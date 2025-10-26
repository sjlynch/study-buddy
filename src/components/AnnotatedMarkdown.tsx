import './AnnotatedMarkdown.css';
import { Markdown } from './Markdown';

function escapeHtml(input: string) {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Convert explicit tags:
 *   <chunk_1>visible words</chunk_1>
 * into minimal placeholders:
 *   <span data-chunk-id="1">visible words</span>
 *
 * We do NOT inject the final badge/tooltip HTML here. Instead, we let Markdown
 * and DOMPurify run first, and then (in Markdown.tsx) we upgrade these spans
 * to the full .annot-ref + .annot-badge + .annot-tooltip structure. This avoids
 * streaming/Markdown interfering with partially-inserted HTML.
 *
 */
function toPlaceholderSpans(input: string, chunks?: string[]) {
  // Hide a trailing, partial start/end of a <chunk_* ...> tag to prevent the brief "<" flash while streaming.
  // Matches: "<", "<c", "<ch", ..., "<chunk", "<chunk_", "<chunk_1", "<chunk_12", "<chunk_123" (end of string only)
  const maskTrailingPartialStarts = (s: string) => s.replace(/<(?:c(?:h(?:u(?:n(?:k(?:_(?:\d{0,3})?)?)?)?)?)?)?$/, '');
  // Matches partial closing tag at the very end: "</", "</c", ..., "</chunk_123"
  const maskTrailingPartialEnds = (s: string) => s.replace(/<\/(?:c(?:h(?:u(?:n(?:k(?:_(?:\d{0,3})?)?)?)?)?)?)?$/, '');

  let src = maskTrailingPartialEnds(maskTrailingPartialStarts(input));

  // When annotations have not arrived yet, do not render any opening/closing chunk tags (avoids flicker).
  if (!chunks || chunks.length === 0) {
    // Drop complete start/end tags, keep the inner text intact.
    src = src.replace(/<\/?chunk_\d{1,3}>/g, '');
    return src;
  }

  const pairPattern = /<chunk_(\d{1,3})>([\s\S]*?)<\/chunk_\1>/g;

  let out = src.replace(pairPattern, (_, numStr: string, innerText: string) => {
    const index = Number(numStr);
    if (!Number.isFinite(index) || index < 1 || index > chunks.length) {
      const safeInner = escapeHtml(innerText);
      return safeInner;
    }
    const safeInner = escapeHtml(innerText);
    return `<span data-chunk-id="${index}">${safeInner}</span>`;
  });

  // Hide any stray start/end tags that may appear mid-stream (only applied to rendered HTML string)
  const strayStart = /<chunk_(\d{1,3})>/g;
  const strayEnd = /<\/chunk_(\d{1,3})>/g;
  out = out.replace(strayStart, '');
  out = out.replace(strayEnd, '');

  return out;
}

export function AnnotatedMarkdown({ text, chunks, codeTheme = 'dark' }: { text: string; chunks?: string[]; codeTheme?: 'dark' | 'light' }) {
  const prepared = toPlaceholderSpans(text, chunks);
  return <Markdown text={prepared} codeTheme={codeTheme} annotations={chunks} />;
}
