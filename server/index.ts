import express from 'express';
import cors from 'cors';
import { chatWithOllama } from './ollama.js';
import studyMaterials from './data/materials.json' with { type: 'json' };

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check endpoint - WORKING EXAMPLE FOR CANDIDATES
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    materials_loaded: studyMaterials ? true : false
  });
});

// Get study materials endpoint - WORKING EXAMPLE FOR CANDIDATES
app.get('/api/materials', (req, res) => {
  res.json(studyMaterials);
});

// Chat endpoint - INCOMPLETE - CANDIDATES MUST IMPLEMENT
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // TODO: Candidates need to implement the following:
    // 1. Build a prompt that includes relevant study material context
    // 2. Call the Ollama service (complete the ollama.ts implementation)
    // 3. Return the response to the frontend
    
    // HINT: You'll want to:
    // - Find relevant study material based on the message
    // - Include that context in your prompt to Ollama
    // - Handle errors appropriately
    
    // Placeholder response - REPLACE THIS
    res.json({ 
      response: "Chat endpoint not implemented. Please complete the implementation.",
      context_used: null 
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  GET  http://localhost:${PORT}/api/materials`);
  console.log(`  POST http://localhost:${PORT}/api/chat`);
});