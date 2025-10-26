import axios from 'axios';
import type { ChatResponse, StudyMaterial, OpenAIChatMessage } from '../types/chat';
const API_BASE_URL = 'http://localhost:3001/api';

export async function getMaterials(): Promise<{ topics: StudyMaterial[]; metadata: any }> {
  try {
    const response = await axios.get(`${API_BASE_URL}/materials`);
    return response.data;
  } catch (error) {
    console.error('Error fetching materials:', error);
    throw error;
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data.status === 'ok';
  } catch (error) {
    return false;
  }
}

export function createFetchSSETransport(url: string, init?: RequestInit) {
  return async (text: string, history: OpenAIChatMessage[], signal?: AbortSignal) => {
    const body = JSON.stringify({ prompt: text, history });
    const headers = { 'Content-Type': 'application/json', ...(init?.headers || {}) };
    return fetch(url, { method: 'POST', headers, body, signal, ...init });
  };
}

export const API_BASE = API_BASE_URL;
