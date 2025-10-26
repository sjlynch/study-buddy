import express, { Request, Response, Express } from 'express';
import { buildMessagesWithRAG } from './ragMessages';

type Role = 'user' | 'assistant';

interface IncomingHistoryItem {
  role: Role;
  content: string;
}

interface ChatRequestBody {
  prompt: string;
  history?: IncomingHistoryItem[];
}

/**
 * Extracts a non-empty user prompt from the request body.
 * Returns null if missing or empty to let the route send a 400 error.
 */
function extractUserPrompt(body: ChatRequestBody | undefined | null): string | null {
  if (!body) return null;
  if (typeof body.prompt !== 'string') return null;
  const trimmed = body.prompt.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * Builds a message list for OpenAI by:
 * 1) Prepending a system prompt to guide the assistant,
 * 2) Appending the provided history in order, and
 * 3) Adding the user's current prompt as the final message.
 */
function buildMessages(history: Array<{ role: Role; content: string }>, prompt: string) {
  const messages: Array<{ role: 'system' | Role; content: string }> = [];
  messages.push({ role: 'system', content: 'You are Study Buddy, a helpful biology tutor. Be precise, well-structured, and concise.' });

  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    messages.push({ role: h.role, content: h.content });
  }

  messages.push({ role: 'user', content: prompt });
  return messages;
}

/**
 * Sets required headers for Server-Sent Events and flushes them.
 * - Content-Type: tells the client to treat the response as an event stream
 * - Cache-Control: disables buffering/proxies from altering the stream
 * - Connection: keeps the HTTP connection open
 * - X-Accel-Buffering: disables Nginx buffering for immediate delivery
 * Also flushes headers early so the client can begin listening right away.
 */
function setSSEHeaders(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();
}

/**
 * Writes one SSE data event line with a JSON-encoded payload.
 */
function writeSSEJson(res: Response, payload: unknown) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  res.write(line);
}

/**
 * Writes a named SSE event with JSON data and ends the event.
 */
function writeSSEEvent(res: Response, eventName: string, payload: unknown) {
  res.write(`event: ${eventName}\n`);
  writeSSEJson(res, payload);
}

/**
 * Ensures an OpenAI API key is present.
 * If missing, notifies the client via SSE and ends the stream.
 * Returns the key string when available, otherwise null.
 */
function checkAPIKey(res: Response): string | null {
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) {
    writeSSEEvent(res, 'error', { error: 'Missing OPENAI_API_KEY on server' });

    if (!res.writableEnded)
      res.end();

    return null;
  }
  return key;
}

/**
 * Couples the response lifecycle to the upstream request via AbortController.
 * Aborts the upstream fetch if the client disconnects or the response finishes.
 * This prevents orphaned upstream requests and saves resources.
 */
function attachAbortHandlers(res: Response, controller: AbortController) {
  function abortUpstream() {
      controller.abort();
  }

  res.once('close', abortUpstream);
  res.once('finish', abortUpstream);
}

/**
 * Performs the POST to OpenAI Chat Completions with streaming enabled.
 * Accepts the abort signal from our controller so it can be cancelled.
 * Returns the raw fetch Response for further handling.
 */
async function createStream(openaiApiKey: string, messages: Array<{ role: 'system' | Role; content: string }>, controller: AbortController) {
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({ model: 'gpt-4o', stream: true, messages, temperature: 0.1 }),
    signal: controller.signal
  });
  return upstream;
}

/**
 * Handles non-OK upstream responses by reading any error text and
 * emitting a structured SSE error event to the client before ending.
 */
async function handleBadUpstream(upstream: Response, res: Response) {
  let details = '';
  details = await (upstream as any).text?.() ?? '';
  writeSSEEvent(res, 'error', { error: 'Upstream error', status: (upstream as any).status, details });

  if (!res.writableEnded)
    res.end();
}

/**
 * Reads bytes from the upstream SSE response and writes them verbatim
 * to the client response. Handles client disconnects and common read errors.
 * Always ends the client response in the finally block.
 */
async function passThroughSSE(upstream: Response, res: Response) {
  const body = (upstream as any).body as ReadableStream<Uint8Array> | null;
  if (!body) {
    writeSSEEvent(res, 'error', { error: 'Stream read error' });
    if (!res.writableEnded)
      res.end();
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!result.value) continue;
      if (res.writableEnded) break;
      const chunk = decoder.decode(result.value);
      res.write(chunk);
    }
  } catch (err: unknown) {
    const e = err as { name?: string } | undefined;
    if (!e || e.name !== 'AbortError') {
      if (!res.writableEnded) {
        writeSSEEvent(res, 'error', { error: 'Stream read error' });
      }
    }
  } finally {
    if (!res.writableEnded)
      res.end();
  }
}

/**
 * Main /api/chat handler.
 * Flow: validate body → set SSE headers → ensure API key → build messages (with RAG) →
 * emit retrieved chunk payload → attach abort handlers → call OpenAI → stream bytes → finalize.
 * Uses SSE so the frontend can display tokens as they arrive.
 */
function handleChat(req: Request<unknown, unknown, ChatRequestBody>, res: Response) {
  (async function run() {
    try {
      const userPrompt = extractUserPrompt(req.body);
      if (userPrompt === null) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
      }

      setSSEHeaders(res);

      const openaiApiKey = checkAPIKey(res);
      if (openaiApiKey === null) return;

      const history = Array.isArray(req.body?.history) ? (req.body!.history as Array<{ role: Role; content: string }>) : [];

      const { messages, chunkTexts } = await buildMessagesWithRAG(history, userPrompt);

      // Send the retrieved chunks to the client first so it can annotate citations during streaming.
      if (Array.isArray(chunkTexts) && chunkTexts.length > 0) {
        writeSSEEvent(res, 'retrieved_chunks', { chunks: chunkTexts });
      }

      const controller = new AbortController();
      attachAbortHandlers(res, controller);

      const upstream = await createStream(openaiApiKey, messages, controller);
      if (!(upstream as any).ok || !(upstream as any).body) {
        await handleBadUpstream(upstream as unknown as Response, res);
        return;
      }

      await passThroughSSE(upstream as unknown as Response, res);
    } catch (error: unknown) {
      console.error('Chat error:', error);
      const withHeadersFlag = res as Response & { headersSent?: boolean };
      if (withHeadersFlag.headersSent) {
        if (!res.writableEnded) {
          const e = error as { name?: string } | undefined;
          if (!e || e.name !== 'AbortError') {
            writeSSEEvent(res, 'error', { error: 'Internal server error' });
          }
          res.end();
        }
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  })();
}

/**
 * Registers the streaming chat route on the provided Express app instance.
 * Keeps route wiring in index.ts minimal and focused.
 */
export function registerChatStreamingRoute(app: Express) {
  app.post('/api/chat', handleChat);
}
