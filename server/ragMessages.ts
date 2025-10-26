type Role = 'user' | 'assistant';

interface OpenAIMessage {
  role: 'system' | Role;
  content: string;
}

interface SearchHit {
  id?: number;
  score?: number;
  text?: string;
  metadata?: Record<string, unknown>;
}

interface SearchResponse {
  results?: SearchHit[];
}

/**
 * Retrieve top-K relevant chunks for a query from the Python RAG service.
 */
async function searchRag(query: string, topK: number): Promise<string[]> {
  const base = process.env.PYTHON_API_URL || 'http://0.0.0.0:8000';
  const url = `${base}/search`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const body = JSON.stringify({ query, top_k: topK });

  try {
    const response = await fetch(url, { method: 'POST', headers, body } as any);
    if (!response.ok) return [];
    const json = await response.json() as SearchResponse;

    const results = Array.isArray(json?.results) ? json.results : [];
    const texts: string[] = [];

    let i = 0;
    while (i < results.length) {
      const t = results[i]?.text;
      if (typeof t === 'string' && t.trim().length > 0) {
        texts.push(t);
      }
      i += 1;
    }
    return texts;
  } catch {
    return [];
  }
}

/**
 * Builds a model-ready message list for OpenAI with RAG.
 *
 * Returns:
 *   { messages, chunkTexts } where chunkTexts are sent to the client for tooltips.
 */
export async function buildMessagesWithRAG(history: Array<{ role: Role; content: string }>, userPrompt: string): Promise<{ messages: OpenAIMessage[]; chunkTexts: string[] }> {
  const chunkTexts = await searchRag(userPrompt, 5);

  const messages: OpenAIMessage[] = [];

  // Keep a concise, stable system preamble only (no RAG stuff here).
  messages.push({
    role: 'system',
    content: 'You are Study Buddy, a helpful biology tutor. Be precise, well-structured, and concise.'
  });

  if (Array.isArray(history)) {
    let i = 0;
    while (i < history.length) {
      const h = history[i];
      const hasValidRole = h && (h.role === 'user' || h.role === 'assistant');
      const hasValidContent = h && typeof h.content === 'string';
      if (hasValidRole && hasValidContent) {
        messages.push({ role: h.role, content: h.content });
      }
      i += 1;
    }
  }

  // Build the final user message that includes:
  // - The student's original question.
  // - Clear instructions for how to cite using <chunk_N> tags.
  // - The retrieved chunks (1-indexed) to use as context.
  let chunkBlock = '';
  if (chunkTexts.length > 0) {
    const lines: string[] = [];
    let idx = 0;
    while (idx < chunkTexts.length) {
      const displayIndex = idx + 1;
      lines.push(`[${displayIndex}] ${chunkTexts[idx]}`);
      idx += 1;
    }
    const joined = lines.join('\n\n');
    chunkBlock = `\n\nCHUNKS (1-indexed):\n${joined}\n`;
  }

  const instructions = `Instructions: 
Use the CHUNKS below as supporting context. When you cite a chunk, wrap only the supported words with a tag exactly like <chunk_N>those words</chunk_N> where N is the 1-indexed chunk id. 
Do not invent ids. 
Do not echo the CHUNKS verbatim—summarize as needed and cite precisely.

1) Use the provided context to answer the user's question and place citations near the relevant clause or sentence.
2) Numbers start at 1. Do NOT invent or reuse numbers that are not present.
3) Do not include a separate References section.
4) Make sure to provide a detailed answer that fully explains the concepts related to the query.
5) ALWAYS use markdown to make your responses easier to read.
`
  const finalUserContent = `Student Question:\n${userPrompt}\n\n${instructions}${chunkBlock}\n\n Remember to always use markdown to format your response.`;

  messages.push({ role: 'user', content: finalUserContent });

  return { messages, chunkTexts };
}
