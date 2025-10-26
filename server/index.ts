import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import studyMaterials from './data/json/materials.json' with { type: 'json' };
import { registerChatStreamingRoute } from './chatStreaming';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://0.0.0.0:8000';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  materials_loaded: boolean;
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function handleHealthRequest(req: Request, res: Response<HealthResponse>) {
  const materialsLoaded = Boolean(studyMaterials);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    materials_loaded: materialsLoaded
  });
}

function handleMaterialsRequest(req: Request, res: Response) {
  res.json(studyMaterials as unknown);
}

app.get('/api/health', handleHealthRequest);
app.get('/api/materials', handleMaterialsRequest);
registerChatStreamingRoute(app);

app.listen(PORT, function onListen() {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  GET  http://localhost:${PORT}/api/materials`);
  console.log(`  POST http://localhost:${PORT}/api/chat`);
});
