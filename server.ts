import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize Google Gen AI client with server-side API key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Real AI Analysis endpoint using Gemini 3.8 Flash
app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();
  try {
    const { ticket_text, ticket_key } = req.body;

    if (!ticket_text || typeof ticket_text !== 'string' || ticket_text.trim().length < 5) {
      return res.status(400).json({ error: 'Missing or insufficient ticket_text for analysis' });
    }

    const key = ticket_key || 'TICKET-LIVE';

    const prompt = `Act as a senior software architect and tech lead. Analyze this Jira ticket carefully and predict all codebase files, components, and endpoints that will need to be added or modified.

Ticket Key: ${key}
Ticket Content:
${ticket_text}

Categorize files into:
- frontend_files: UI components, pages, custom hooks, styles, view templates
- backend_files: API routes, controllers, middleware, business services
- database_files: ORM models, migration SQL, schemas, seeds
- config_files: env files, dockerfiles, build/package configs
- test_files: unit tests, integration tests, end-to-end tests

Be realistic, precise, and practical for production codebases.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a senior full-stack software engineer. Return structured JSON predicting impacted files for software tickets.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            frontend_files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Frontend component and UI files affected',
            },
            backend_files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Backend controllers, routes, and services affected',
            },
            database_files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Database models, schemas, and migrations affected',
            },
            config_files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Project and deployment configuration files affected',
            },
            test_files: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Test files and suites affected',
            },
            confidence_score: {
              type: Type.NUMBER,
              description: 'Confidence score between 0.0 and 1.0',
            },
            reasoning: {
              type: Type.STRING,
              description: 'Concise architectural reasoning behind the predictions',
            },
          },
          required: [
            'frontend_files',
            'backend_files',
            'database_files',
            'config_files',
            'test_files',
            'confidence_score',
            'reasoning',
          ],
        },
      },
    });

    const rawJson = response.text?.trim() || '{}';
    const parsed = JSON.parse(rawJson);

    const frontend_files = Array.isArray(parsed.frontend_files) ? parsed.frontend_files : [];
    const backend_files = Array.isArray(parsed.backend_files) ? parsed.backend_files : [];
    const database_files = Array.isArray(parsed.database_files) ? parsed.database_files : [];
    const config_files = Array.isArray(parsed.config_files) ? parsed.config_files : [];
    const test_files = Array.isArray(parsed.test_files) ? parsed.test_files : [];

    const total_files =
      frontend_files.length +
      backend_files.length +
      database_files.length +
      config_files.length +
      test_files.length;

    const processingTimeMs = Date.now() - startTime;

    return res.json({
      frontend_files,
      backend_files,
      database_files,
      config_files,
      test_files,
      confidence_score: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0.88,
      reasoning: parsed.reasoning || 'Identified impacted files based on technical requirements.',
      total_files,
      processingTimeMs,
      ticket_key: key,
    });
  } catch (error: any) {
    console.error('Gemini API analysis error:', error);
    return res.status(500).json({
      error: `Gemini Analysis failed: ${error?.message || 'Unknown error'}`,
    });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'Context Pilot API',
    model: 'gemini-3.8-flash',
    timestamp: new Date().toISOString(),
  });
});

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Context Pilot Server listening on port ${PORT} with Gemini 3.8 Flash`);
  });
}

startServer();
