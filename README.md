# Study Buddy - Take-Home Assignment

Welcome! This is a take-home coding assignment for our software engineering position. You'll be implementing chat functionality for a Study Buddy application that helps students learn by answering questions about their study materials.

## 🎯 Your Task (2-4 hours)

Build a working chat interface that:
1. Connects the frontend to the backend API
2. Integrates with Ollama (a local LLM) to generate responses
3. Uses the provided study materials as context for answers
4. Handles errors gracefully

## 🚀 Quick Setup (5 minutes)

### Prerequisites
1. **Install Ollama**: https://ollama.com
2. **Pull a model**: 
   ```bash
   ollama pull llama3.2
   ```
3. **Verify Ollama is running**:
   ```bash
   ollama list  # Should show llama3.2
   ```

### Start the Application
```bash
# Install dependencies
pnpm install

# Start both frontend and backend
pnpm dev:all

# Or run them separately:
pnpm dev        # Frontend only (http://localhost:5173)
pnpm dev:server # Backend only (http://localhost:3001)
```

## ✅ Requirements Checklist

### Core Requirements (Must Complete)
- [ ] **Frontend-Backend Connection**: Wire up the send button in `src/components/Chat.tsx` to call the backend
- [ ] **API Client**: Complete the `sendMessage` function in `src/services/api.ts`
- [ ] **Ollama Integration**: Implement the `chatWithOllama` function in `server/ollama.ts`
- [ ] **Context Integration**: Include study material from BOTH sources in your prompts:
  - JSON study materials (provided in `server/data/json/materials.json`)
  - PDF content (extract from `server/data/pdf/biology-for-dummies.pdf`)
- [ ] **PDF Processing**: Implement `processPDFForContext` in `server/pdfParser.ts`
- [ ] **Error Handling**: Show appropriate error messages when things go wrong

### Optional Enhancements (If Time Permits)
- [ ] Streaming responses from Ollama
- [ ] Better context selection (choose most relevant topic from JSON and PDF)
- [ ] Smart PDF content extraction (relevance-based, chunking, summarization)
- [ ] Context size optimization strategies
- [ ] Message history persistence
- [ ] Improved prompt engineering
- [ ] Loading animations

## 📁 Project Structure

```
study-buddy/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Chat.tsx       # Main chat component (partially complete)
│   │   └── Context.tsx    # Study materials display (complete)
│   ├── services/
│   │   └── api.ts         # API client (needs implementation)
│   └── types/
│       └── chat.ts        # TypeScript interfaces (complete)
├── server/                 # Backend (Express + TypeScript)
│   ├── index.ts           # Express server (chat endpoint stubbed)
│   ├── ollama.ts          # Ollama integration (needs implementation)
│   ├── pdfParser.ts       # PDF parsing utilities (needs implementation)
│   └── data/
│       ├── json/
│       │   └── materials.json # Biology study materials
│       └── pdf/
│           └── biology-for-dummies.pdf # Additional PDF context
└── README.md              # You are here!
```

## 🔍 What We've Provided

1. **Working Examples**:
   - `/api/health` endpoint - shows how to create an endpoint
   - `/api/materials` endpoint - returns study materials
   - `getMaterials()` in api.ts - shows how to make API calls

2. **Study Materials**: 
   - Three biology topics (photosynthesis, cellular respiration, mitosis) in `server/data/json/materials.json`
   - A biology textbook PDF in `server/data/pdf/biology-for-dummies.pdf`

3. **UI Components**: Fully styled chat interface and context panel

4. **Type Definitions**: All TypeScript interfaces you'll need

## 💡 Implementation Hints

### 1. Start with the API Client
Look at the working `getMaterials` function in `src/services/api.ts` as an example.

### 2. Ollama API Documentation
- Endpoint: `POST http://localhost:11434/api/generate`
- Request body:
  ```json
  {
    "model": "llama3.2",
    "prompt": "Your prompt with context here",
    "stream": false
  }
  ```
- Response: `{ "response": "AI response text", ... }`

### 3. Building Good Prompts
Include relevant study material from both JSON and PDF sources. For example:
```
Study Materials Context:
[Include relevant JSON study material here]

Additional Reference Material:
[Include relevant PDF content here]

Question: [User's question]
Please answer based on the provided context.
```

### 4. PDF Processing Tips
- The `pdf-parse` library is already installed for you
- PDF files can be large - think about context window limits
- Consider different strategies: truncation, chunking, summarization, or relevance scoring
- The PDF might fail to parse - handle this gracefully

### 5. Testing Your Solution
- Try asking about "photosynthesis" - it should use both JSON and PDF materials
- Test with Ollama not running - should show a friendly error
- Test PDF parsing failure scenarios - should handle gracefully
- Ask about topics not in the materials - should still try to use available context

## 🧪 Testing Checklist

Before submitting, make sure:
- [ ] Chat messages send and receive successfully
- [ ] Responses are relevant to the study materials
- [ ] Error states are handled (Ollama not running, network errors)
- [ ] The UI shows loading states while waiting for responses
- [ ] The app doesn't crash on edge cases

## 📊 Evaluation Criteria

### We Must See
- Clean, readable code
- Working chat functionality
- Proper use of TypeScript
- Error handling

### We Love to See
- Thoughtful UX improvements
- Performance optimizations
- Code comments where helpful
- Creative problem solving

## ❓ FAQ

**Q: Can I use a different LLM instead of Ollama?**
A: Yes! OpenAI or other APIs are fine. Just document your choice.

**Q: Should I implement authentication?**
A: No, focus on the core chat functionality.

**Q: Can I add additional npm packages?**
A: Yes, but document why you chose them.

**Q: The context is too large for my prompt, what should I do?**
A: This is intentional! Show us how you handle this challenge. The PDF adds extra complexity here.

**Q: How should I handle both JSON and PDF content?**
A: That's up to you! Show us your approach to combining multiple context sources.

## 🎉 Submission

When you're done:
1. Make sure both `pnpm dev` and `pnpm dev:server` run without errors
2. Test the complete flow: send message → get response with context
3. Commit your changes with clear commit messages
4. Push to your fork or zip the project

Good luck! We're excited to see your solution. Remember, we're looking for clean, working code that demonstrates good engineering practices. Don't overthink it - a simple, solid solution is better than an over-engineered one.

---

**Time Estimate**: 2-4 hours
**Questions?** Include them in your submission notes.