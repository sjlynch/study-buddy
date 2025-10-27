# Study Buddy - Take-Home Assignment

### Start the Application
```bash
# Install dependencies
pnpm install

Create a new ".env" file in the root directory and set OPENAI_API_KEY=<your_api_key>

# Start both frontend and backend
pnpm dev:all

# Or run them separately:
pnpm dev        # Frontend only (http://localhost:5173)
pnpm dev:server # Backend only (http://localhost:3001)


python -m venv venv # in the study-buddy/rag_service folder
pip install -r requirements.txt
python server.py # This micro service uses FAISS and fastapi to provide semantic search features for RAG
```
**Features:**
  - Streaming chat with server-sent events
  - Inline annotations for retrieved context
  - Markdown rendering
  - Code blocks with syntax highlighting
  - rag_service - Ingests chunks and creates document embeddings using FAISS for semantic search.

# Why these libraries (for our SSE React chat)

This chat renders **streaming** assistant messages as Markdown (including code blocks) and also injects inline citations for RAG chunks. We need a stack that can (1) parse partial Markdown safely, (2) highlight code as it streams, and (3) avoid XSS while still allowing our custom inline HTML for annotations.

---

## `marked`
**What it solves:** Fast, flexible Markdown → HTML parsing with GitHub-flavored Markdown (GFM).

**Where we use it:** `src/components/Markdown.tsx`
- We set `gfm: true`, `breaks: true`, and disable header IDs/mangling to keep output clean and predictable for chat.
- We first “balance” fences (```` ``` ```` / `~~~`) in partially streamed content so half-finished blocks don’t break the DOM, then call `marked.parse(...)`.

**Why it fits our streaming UI:**
- It’s small and fast, so we can continuously re-parse growing text during SSE without jank.
- Plugin-friendly (see `marked-highlight` below), which keeps highlighting integrated instead of bolted on later.

---

## `marked-highlight`
**What it solves:** A tiny bridge that lets `marked` delegate code block highlighting to a highlighter.

**Where we use it:** `src/components/Markdown.tsx`
- `marked.use(markedHighlight({ highlight(code, lang) { ... } }))`
- We pass each code block to our highlighter (highlight.js), returning safe HTML for the block.
- We also set a consistent `langPrefix` so CSS themes apply reliably.

**Why it fits our streaming UI:**
- Lets us keep a single Markdown → HTML pipeline. No brittle post-processing passes are needed to find and style code after the fact.

---

## `highlight.js`
**What it solves:** Syntax highlighting for fenced code blocks (with language-aware and auto-detect modes).

**Where we use it:** `src/components/Markdown.tsx`
- We attempt `hljs.highlight(code, { language: lang })` when a language is present; otherwise `hljs.highlightAuto(code)`.
- The theme CSS (`highlight.js/styles/github-dark.css`) provides readable, consistent styling that matches our dark code block chrome.

**Why it fits our streaming UI:**
- It’s resilient to partial updates and supports many languages out of the box, so code looks good even while text is still arriving over SSE.

---

## `dompurify`
**What it solves:** Sanitizes the generated HTML before we set it with `dangerouslySetInnerHTML`, preventing XSS.

**Where we use it:** `src/components/Markdown.tsx`
- After `marked.parse(...)`, we run `DOMPurify.sanitize(raw)` in the browser.
- This is essential because we’re rendering user-/model-supplied Markdown as HTML.

**Why it’s especially important here:**
- We inject custom inline HTML for RAG citations in `src/components/AnnotatedMarkdown.tsx` (badges + tooltips). Sanitizing allows **our** known-good markup to render while stripping dangerous payloads.

---

## `lucide-react`
**What it solves:** Accessible, lightweight React SVG icons with a consistent visual language.

**Where/How we’ll use it (UI polish):**
- Chat actions (Send / Stop), copy buttons on code blocks, and small inline icons (e.g., info, external link) to reduce text clutter.
- Tree-shakable icons keep bundle size in check; each icon is a simple React component we can style via className.

**Why it fits our app:**
- The chat UI benefits from recognizable icon affordances (e.g., a Stop square during streaming). Using a cohesive icon set keeps the interface clean and consistent.

---

## `dotenv`
**What it solves:** Loads environment variables from a `.env` file into `process.env` during local/dev runs.

**Where we use it:** `server/index.ts`, `server/chatStreaming.ts`
- We import `'dotenv/config'` at startup so variables like `OPENAI_API_KEY`, `PYTHON_API_URL`, and `PORT` are available without hardcoding.
- `chatStreaming.ts` reads `process.env.OPENAI_API_KEY` to authenticate upstream requests; if missing, it emits an SSE `error` event to the client.

**Why it fits our server setup:**
- Keeps secrets and environment-specific values out of source, supports 12-factor config, and makes dev/prod parity straightforward.

---

### How this combo solves the streaming problem end-to-end

- **Streaming-safe parse:** `marked` + our fence-balancing lets partially received text render without breaking the DOM.
- **Readable code while streaming:** `marked-highlight` → `highlight.js` produces highlighted blocks as soon as fences/lines arrive.
- **Safe HTML:** `dompurify` sanitizes before render, protecting the chat surface even though content is model/user-provided.
- **Helpful UI affordances:** `lucide-react` provides lightweight icons for actions like Send/Stop/Copy without hand-rolling SVGs.
- **Config without leaks:** `dotenv` ensures keys/URLs are injected at runtime, allowing `chatStreaming.ts` to stream from OpenAI securely via SSE.
