import express from 'express';
import { createServer } from 'vite';
import wikiRouter from './routes/wiki.js';
import sourcesRouter from './routes/sources.js';
import ollamaRouter from './routes/ollama.js';
import searchRouter from './routes/search.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/wiki', wikiRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api/search', searchRouter);

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
