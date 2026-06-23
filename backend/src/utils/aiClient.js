import axios from 'axios';
import { config } from '../config.js';

const client = axios.create({ baseURL: config.aiServiceUrl, timeout: config.aiTimeoutMs });

/**
 * Call the FastAPI AI service. Normalises connection/timeout failures into a
 * tagged error the route layer can translate into a 503/504.
 */
export async function callAi(path, body) {
  try {
    const { data } = await client.post(path, body);
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        const err = new Error('AI service unavailable');
        err.status = 503;
        throw err;
      }
      if (error.code === 'ECONNABORTED') {
        const err = new Error('AI service timeout');
        err.status = 504;
        throw err;
      }
      if (error.response) {
        const err = new Error(error.response.data?.detail || 'AI service error');
        err.status = 502;
        throw err;
      }
    }
    throw error;
  }
}
