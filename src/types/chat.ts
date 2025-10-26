export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  chunks?: string[];
}

export interface OpenAIChatMessage {
  role: 'system' | Role;
  content: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: string;
}

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  response: string;
  context_used?: string | null;
}

export interface StudyMaterial {
  id: string;
  title: string;
  category: string;
  content: string;
  key_concepts: string[];
  study_questions: string[];
}
