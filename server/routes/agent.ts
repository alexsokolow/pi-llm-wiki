import { Router } from 'express';
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import {
  createWikiSession,
  getSession,
  getSessionEntry,
  listSessionIds,
  deleteSession,
} from '../lib/pi-harness.js';

const router = Router();

// GET /api/models — list available models from Pi's ModelRegistry
router.get('/models', async (_req, res) => {
  try {
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    const available = await registry.getAvailable();
    res.json({ models: available });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/agent/sessions — create new agent session
router.post('/agent/sessions', async (req, res) => {
  try {
    const { provider, model, thinkingLevel } = req.body || {};
    const { sessionId } = await createWikiSession({ provider, model, thinkingLevel });
    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/agent/sessions — list active sessions
router.get('/agent/sessions', (_req, res) => {
  res.json({ sessions: listSessionIds() });
});

// POST /api/agent/sessions/:id/prompt — send prompt to session, stream response
router.post('/agent/sessions/:id/prompt', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(req.params.id)!;
    const send = (e: any) => {
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', content: e.assistantMessageEvent.delta })}\n\n`);
      } else if (e.type === 'tool_execution_start') {
        res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: e.toolName })}\n\n`);
      } else if (e.type === 'tool_execution_end') {
        res.write(`data: ${JSON.stringify({ type: 'tool_end', tool: e.toolName, error: e.isError })}\n\n`);
      } else if (e.type === 'agent_end') {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    };

    entry.subscribers.add(send);

    // Handle client disconnect
    req.on('close', () => {
      entry.subscribers.delete(send);
    });

    // Send prompt (async — resolves when agent finishes)
    await session.prompt(text);

    // Send done and close
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    entry.subscribers.delete(send);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({ error: String(err) });
    }
  }
});

// DELETE /api/agent/sessions/:id — destroy session
router.delete('/agent/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ success: true });
});

// --- Legacy compatibility: /api/agent/ingest and /api/agent/query ---
// These create a one-shot session, prompt it, stream the result, then destroy

router.post('/agent/ingest', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({ error: 'filename required' });
      return;
    }

    const { sessionId, session } = await createWikiSession();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const entry = getSessionEntry(sessionId)!;
    const send = (e: any) => {
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        res.write(e.assistantMessageEvent.delta);
      }
    };
    entry.subscribers.add(send);

    const prompt = `Ingest the source file "${filename}" into the wiki. Use wiki_sources to verify it exists, then read it with the bash tool or appropriate method. Extract key entities, concepts, and create wiki pages using wiki_write. Update the wiki index.`;

    await session.prompt(prompt);
    entry.subscribers.delete(send);
    deleteSession(sessionId);
    res.end();
  } catch (err) {
    if (res.headersSent) res.end();
    else res.status(500).json({ error: String(err) });
  }
});

router.post('/agent/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      res.status(400).json({ error: 'question required' });
      return;
    }

    const { sessionId, session } = await createWikiSession();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    const entry = getSessionEntry(sessionId)!;
    const send = (e: any) => {
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        res.write(e.assistantMessageEvent.delta);
      }
    };
    entry.subscribers.add(send);

    const prompt = `Answer this question using the wiki: ${question}\n\nUse wiki_search and wiki_read to find relevant information. Cite pages with [[Title]] notation.`;

    await session.prompt(prompt);
    entry.subscribers.delete(send);
    deleteSession(sessionId);
    res.end();
  } catch (err) {
    if (res.headersSent) res.end();
    else res.status(500).json({ error: String(err) });
  }
});

export default router;
