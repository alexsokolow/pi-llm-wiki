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

app.use(express.json({ limit: '50mb' }));

// Initialize QMD collection
async function initQmd() {
  const expectedPath = path.resolve('wiki/pages');
  try {
    // Check if collection already points to the right path
    const { stdout } = await execAsync('npx qmd collection show pages');
    if (stdout.includes(expectedPath)) {
      // Collection exists and points to correct path — just update
      const { stdout: updateOut } = await execAsync('npx qmd update');
      if (updateOut.includes('new') || updateOut.includes('updated')) {
        console.log(`📦 QMD: ${updateOut.trim()}`);
        await execAsync('npx qmd embed');
        console.log('📦 QMD: embeddings updated');
      } else {
        console.log('📦 QMD: index up to date');
      }
      return;
    }
    // Wrong path — re-register
    await execAsync('npx qmd collection remove pages').catch(() => {});
  } catch {
    // Collection doesn't exist yet
  }
  try {
    await execAsync('npx qmd collection add wiki/pages pages');
    console.log('📦 QMD: collection registered');
    await execAsync('npx qmd embed').catch(() => {});
  } catch (err) {
    console.log(`📦 QMD: setup failed (${err})`);
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
