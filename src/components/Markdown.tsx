import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/github-dark.css';
import './Markdown.css';

marked.setOptions({ gfm: true, breaks: true, mangle: false, headerIds: false });
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    } catch {
      return code;
    }
  }
}));

function normalizeStreamingMarkdown(text: string) {
  let out = text;
  const patchFence = (fence: string) => {
    let count = 0, i = 0;
    while (true) {
      const pos = out.indexOf(fence, i);
      if (pos === -1) break;
      count++;
      i = pos + fence.length;
    }
    if (count % 2 === 1) out += `\n${fence}`;
  };
  patchFence('```'); patchFence('~~~');
  return out;
}

function decorateChunkPlaceholders(root: HTMLElement, chunkTexts?: string[]) {
  if (!chunkTexts || chunkTexts.length === 0) return;

  const candidates = root.querySelectorAll('span[data-chunk-id]');
  candidates.forEach(node => {
    const el = node as HTMLElement;
    const idAttr = el.getAttribute('data-chunk-id') || '';
    const index = Number(idAttr);
    if (!Number.isFinite(index) || index < 1 || index > chunkTexts.length) return;

    const chunkText = chunkTexts[index - 1] || '';
    const visible = el.textContent || '';

    // Build final: <span class="annot-ref">{visible}<span class="annot-badge">N</span><span class="annot-tooltip" data-text="..."></span></span>
    const wrapper = document.createElement('span');
    wrapper.className = 'annot-ref';

    const visibleNode = document.createTextNode(visible);
    const badge = document.createElement('span');
    badge.className = 'annot-badge';
    badge.textContent = String(index);

    const tooltip = document.createElement('span');
    tooltip.className = 'annot-tooltip';
    tooltip.setAttribute('data-text', chunkText);

    wrapper.appendChild(visibleNode);
    wrapper.appendChild(badge);
    wrapper.appendChild(tooltip);

    el.replaceWith(wrapper);
  });
}

export function Markdown({ text, codeTheme = 'dark', annotations }: { text: string; codeTheme?: 'dark' | 'light'; annotations?: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const html = useMemo(() => {
    const balanced = normalizeStreamingMarkdown(text);
    let raw = '';
    try {
      raw = marked.parse(balanced);
    } catch {
      raw = `<pre><code>${balanced}</code></pre>`;
    }
    const sanitized = typeof window === 'undefined' ? raw : DOMPurify.sanitize(raw);
    if (typeof window === 'undefined') return sanitized;

    const root = document.createElement('div');
    root.innerHTML = sanitized;

    // Post-process: convert <span data-chunk-id="N">…</span> into finalized annotation markup
    decorateChunkPlaceholders(root, annotations);

    // Code block wrapper and copy button
    const themeClass = codeTheme === 'light' ? 'chat-codeblock-light' : 'chat-codeblock-dark';
    root.querySelectorAll('pre > code').forEach(codeEl => {
      const pre = codeEl.parentElement as HTMLElement | null;
      if (!pre) return;

      if (!codeEl.classList.contains('hljs')) codeEl.classList.add('hljs');

      const alreadyWrapped = pre.parentElement && pre.parentElement.classList.contains('chat-codeblock');
      if (alreadyWrapped) return;

      const wrapper = document.createElement('div');
      wrapper.className = `chat-codeblock ${themeClass}`;

      const btn = document.createElement('span');
      btn.className = 'chat-copy-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', 'Copy code');
      btn.setAttribute('tabindex', '0');
      btn.textContent = 'Copy';

      pre.replaceWith(wrapper);
      wrapper.appendChild(btn);
      wrapper.appendChild(pre);
    });

    return root.innerHTML;
  }, [text, codeTheme, annotations]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined' || typeof document === 'undefined' || !navigator?.clipboard) return;

    const handleCopy = async (btn: HTMLElement) => {
      const wrapper = btn.closest('.chat-codeblock') as HTMLElement | null;
      const codeEl = wrapper?.querySelector('pre > code') as HTMLElement | null;
      const raw = codeEl?.innerText ?? '';
      try {
        await navigator.clipboard.writeText(raw);
        const prev = btn.textContent || 'Copy';
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = prev; btn.classList.remove('copied'); }, 1200);
      } catch {}
    };

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target?.closest?.('.chat-copy-btn') as HTMLElement | null;
      if (btn) handleCopy(btn);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const btn = target?.closest?.('.chat-copy-btn') as HTMLElement | null;
      if (!btn) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCopy(btn); }
    };

    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeyDown);
    return () => { el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKeyDown); };
  }, []);

  return <div ref={containerRef} className="chat-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
