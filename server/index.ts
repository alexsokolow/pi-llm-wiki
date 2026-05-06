import express from 'express';
import { createServer } from 'vite';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Force QMD to use the wiki/db folder
process.env.XDG_CACHE_HOME = path.resolve('wiki/db');

import wikiRouter from './routes/wiki.js';
import sourcesRouter from './routes/sources.js';
import agentRouter from './routes/agent.js';
import authRouter from './routes/auth.js';
import graphRouter from './routes/graph.js';
import configRouter from './routes/config.js';

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

const QMD_ENV = process.env;

app.use(express.json({ limit: '50mb' }));

// Initialize QMD collection
async function initQmd() {
  try {
    await execAsync('npx qmd collection add wiki/pages pages', { env: QMD_ENV });
    console.log('📦 QMD collection initialized in wiki/db');
  } catch {
    // Ignore errors if collection already exists
  }
}
initQmd();

// API routes
app.use('/api/wiki', wikiRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/graph', graphRouter);
app.use('/api/config', configRouter);
app.use('/api/auth', authRouter);
app.use('/api', agentRouter);

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, () => {
    console.log(`🧠 LLM Wiki server running at http://localhost:${PORT}`);
  });
}

start().catch(console.error);
