import { useCallback, useMemo, useRef, useState } from 'react';
import './Chat.css';
import { API_BASE, createFetchSSETransport } from '../services/api';
import { AnnotatedMarkdown } from './AnnotatedMarkdown';
import type { ChatMessage, OpenAIChatMessage, Role } from '../types/chat';

interface OpenAIStreamDelta {
  id?: string;
  choices?: Array<{ delta?: { content?: string; role?: string } }>;
}

const openaiConnector = {
  name: 'openai',
  extract(data: string): { text?: string; done?: boolean } | null {
    if (data === '[DONE]') return { done: true };
    try {
      const obj = JSON.parse(data) as OpenAIStreamDelta;
      const choices = obj?.choices;
      if (!Array.isArray(choices)) return null;
      let text = '';
      for (const choice of choices) {
        const part = choice?.delta?.content;
        if (typeof part === 'string') text += part;
      }
      if (text) return { text };
      return null; // ignore empty/role-only deltas
    } catch {
      // Strict: never treat non-JSON as model text
      return null;
    }
  }
};

/**
 * Read SSE and surface both event name and data to the callback.
 * Default event (if none specified) is "message".
 */
function readSSEStream(response: Response, onEvent: (evt: { event: string; data: string }) => void) {
  if (!response.body) return Promise.resolve();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];
  let currentEvent = 'message';

  const flushEvent = () => {
    if (!dataLines.length) { currentEvent = 'message'; return; }
    onEvent({ event: currentEvent || 'message', data: dataLines.join('\n') });
    dataLines = [];
    currentEvent = 'message';
  };

  const processLine = (line: string) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '') { flushEvent(); return; }
    if (line.startsWith('event:')) {
      let value = line.slice(6);
      if (value.startsWith(' ')) value = value.slice(1);
      currentEvent = value || 'message';
      return;
    }
    if (line.startsWith('data:')) {
      let value = line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      dataLines.push(value);
      return;
    }
  };

  return new Promise<void>((resolve, reject) => {
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            processLine(line);
          }
        }
        buffer += decoder.decode();
        if (buffer.length) processLine(buffer);
        flushEvent();
        resolve();
      } catch (err) {
        reject(err);
      }
    })();
  });
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const hasStartedAssistantRef = useRef(false);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const chunkQueueRef = useRef<string[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const pendingChunksRef = useRef<string[] | null>(null);

  const transport = useMemo(() => createFetchSSETransport(`${API_BASE}/chat`), []);

  const updateMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessages(prev => updater(prev));
  }, []);

  const appendAssistantToken = (chunk: string) => {
    if (!chunk) return;

    if (!hasStartedAssistantRef.current) {
      const id = 'assistant-' + Date.now();
      const initialChunks = pendingChunksRef.current || undefined;
      pendingAssistantIdRef.current = id;
      hasStartedAssistantRef.current = true;
      chunkQueueRef.current.length = 0;
      updateMessages(prev => prev.concat({ id, role: 'assistant', content: chunk, chunks: initialChunks }));
      pendingChunksRef.current = null;
    } else {
      chunkQueueRef.current.push(chunk);
      if (rafIdRef.current == null && typeof window !== 'undefined') {
        rafIdRef.current = window.requestAnimationFrame(() => {
          rafIdRef.current = null;
          const queue = chunkQueueRef.current;
          if (!pendingAssistantIdRef.current || queue.length === 0) return;
          const toAppend = queue.join('');
          queue.length = 0;
          const assistantId = pendingAssistantIdRef.current;
          updateMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + toAppend } : m));
        });
      }
    }
  };

  const flushAndFinalizeAssistant = () => {
    if (rafIdRef.current != null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const queue = chunkQueueRef.current;
    if (pendingAssistantIdRef.current && queue.length > 0) {
      const toAppend = queue.join('');
      queue.length = 0;
      const assistantId = pendingAssistantIdRef.current;
      updateMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + toAppend } : m));
    }
    hasStartedAssistantRef.current = false;
    pendingAssistantIdRef.current = null;
    setSending(false);
  };

  const abortInFlightIfAny = () => { if (controllerRef.current) controllerRef.current.abort(); };

  const handleSend = async () => {
    if (sending) return;
    const text = inputValue.trim();
    if (!text) return;

    setError(null);
    setInputValue('');
    abortInFlightIfAny();

    const controller = new AbortController();
    controllerRef.current = controller;
    hasStartedAssistantRef.current = false;
    pendingAssistantIdRef.current = null;
    chunkQueueRef.current.length = 0;
    pendingChunksRef.current = null;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
    updateMessages(prev => prev.concat(userMessage));
    setSending(true);

    try {
      const historyForServer: OpenAIChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await transport(text, historyForServer, controller.signal);
      if (!response.ok || !response.body) throw new Error(`Bad response (${response.status}) or missing body`);

      await readSSEStream(response, (evt) => {
        if (evt.event === 'retrieved_chunks') {
          try {
            const json = JSON.parse(evt.data) as { chunks?: string[] };
            if (Array.isArray(json?.chunks)) {
              if (hasStartedAssistantRef.current && pendingAssistantIdRef.current) {
                const assistantId = pendingAssistantIdRef.current;
                updateMessages(prev => prev.map(m => m.id === assistantId ? { ...m, chunks: json.chunks as string[] } : m));
              } else {
                pendingChunksRef.current = json.chunks as string[];
              }
            }
          } catch {}
          return;
        }

        if (evt.event === 'error') {
          try {
            const err = JSON.parse(evt.data) as any;
            setError(err?.error || 'Server error');
          } catch {
            setError('Server error');
          }
          return;
        }

        // Default "message" events: treat as OpenAI deltas
        const out = openaiConnector.extract(evt.data);
        if (!out || out.done) return;
        const chunk = out.text || '';
        if (!chunk) return;
        appendAssistantToken(chunk);
      });

      flushAndFinalizeAssistant();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        flushAndFinalizeAssistant();
        return;
      }
      console.error('Chat error:', err);
      setError('Failed to send message. Please make sure the server is running.');
      setSending(false);
    }
  };

  const handleStop = () => { if (sending) controllerRef.current?.abort(); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !sending) handleSend(); };

  const headerTitle = 'Study Buddy Chat';
  const headerSubtitle = 'Ask questions about biology topics!';

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>{headerTitle}</h2>
        <p>{headerSubtitle}</p>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>No messages yet. Try asking about photosynthesis, cellular respiration, or mitosis!</p>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id} className={`message message-${message.role}`}>
              <div className="message-role">{message.role === 'user' ? 'You' : 'Study Buddy'}</div>
              <div className="message-content">
                {message.role === 'assistant' ? <AnnotatedMarkdown text={message.content} chunks={message.chunks} codeTheme="dark" /> : message.content}
              </div>
            </div>
          ))
        )}
        {sending && !hasStartedAssistantRef.current && (
          <div className="message message-assistant">
            <div className="message-role">Study Buddy</div>
            <div className="message-content loading">Thinking...</div>
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="input-container">
        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={onKeyDown} placeholder="Ask a question about your study materials..." disabled={sending} className="chat-input" />
        <button onClick={sending ? handleStop : handleSend} disabled={!sending && !inputValue.trim()} className="send-button">{sending ? 'Stop' : 'Send'}</button>
      </div>
    </div>
  );
}
