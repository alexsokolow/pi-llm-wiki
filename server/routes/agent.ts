import { Router } from 'express';
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import path from 'path';
import type { Response } from 'express';
import {
  createWikiSession,
  getSession,
  getSessionEntry,
  listSessionIds,
  deleteSession,
} from '../lib/pi-harness.js';

const router = Router();

// ─── Helper: verbose SSE event forwarder (CLI-style) ─────────────────────────

function createEventForwarder(res: Response) {
  const startTime = Date.now();
  const toolTimers = new Map<string, number>();

  return (e: any) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ type: 'text', content: e.assistantMessageEvent.delta })}\n\n`);
    } else if (e.type === 'tool_execution_start') {
      toolTimers.set(e.toolCallId, Date.now());
      const argsPreview = e.args ? JSON.stringify(e.args) : '';
      res.write(`data: ${JSON.stringify({
        type: 'tool_start',
        tool: e.toolName,
        args: argsPreview,
        elapsed,
      })}\n\n`);
    } else if (e.type === 'tool_execution_end') {
      const toolStart = toolTimers.get(e.toolCallId) || startTime;
      const duration = ((Date.now() - toolStart) / 1000).toFixed(2);
      let result = '';
      if (e.result?.content?.[0]?.text) {
        result = e.result.content[0].text;
      }
      res.write(`data: ${JSON.stringify({
        type: 'tool_end',
        tool: e.toolName,
        error: e.isError,
        duration: `${duration}s`,
        result,
        elapsed,
      })}\n\n`);
    }
  };
}

function sendStats(res: Response, session: any) {
  try {
    const stats = session.getSessionStats();
    res.write(`data: ${JSON.stringify({
      type: 'stats',
      tokens: stats.tokens,
      cost: stats.cost,
      toolCalls: stats.toolCalls,
      model: session.model?.id || 'unknown',
      provider: session.model?.provider || 'unknown',
    })}\n\n`);
  } catch {
    // stats not available
  }
}

// ─── GET /api/models ─────────────────────────────────────────────────────────

router.get('/models', async (_req, res) => {
  try {
    const authStorage = AuthStorage.create(path.resolve('wiki/.auth.json'));
    const registry = ModelRegistry.create(authStorage, path.resolve('wiki/.models.json'));
    const available = await registry.getAvailable();
    res.json({ models: available });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/agent/sessions ────────────────────────────────────────────────

router.post('/agent/sessions', async (req, res) => {
  try {
    const { provider, model, thinkingLevel } = req.body || {};
    const { sessionId } = await createWikiSession({ provider, model, thinkingLevel });
    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/agent/sessions', (_req, res) => {
  res.json({ sessions: listSessionIds() });
});

// ─── POST /api/agent/sessions/:id/prompt ─────────────────────────────────────

router.post('/agent/sessions/:id/prompt', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

    const { text } = req.body;
    if (!text) { res.status(400).json({ error: 'text required' }); return; }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(req.params.id)!;
    const send = createEventForwarder(res);
    entry.subscribers.add(send);
    req.on('close', () => { entry.subscribers.delete(send); });

    await session.prompt(text);
    sendStats(res, session);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    entry.subscribers.delete(send);
    res.end();
  } catch (err) {
    if (res.headersSent) res.end();
    else res.status(500).json({ error: String(err) });
  }
});

router.delete('/agent/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ success: true });
});

// ─── POST /api/agent/ingest ──────────────────────────────────────────────────

router.post('/agent/ingest', async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) { res.status(400).json({ error: 'filename required' }); return; }

    const { access } = await import('fs/promises');
    const filePath = path.resolve('wiki/raw', filename);
    try { await access(filePath); } catch {
      res.status(404).json({ error: `File not found: wiki/raw/${filename}` });
      return;
    }

    console.log(`\n📄 Ingesting: ${filename}`);

    const { sessionId, session } = await createWikiSession();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(sessionId)!;
    const send = createEventForwarder(res);
    entry.subscribers.add(send);
    req.on('close', () => { entry.subscribers.delete(send); });

    const prompt = `Ingest the document "${filename}" into the wiki.

The file is located at: ${filePath}

Follow the Ingest Workflow in your instructions. Be thorough — create 5-15 pages from this source.`;

    await session.prompt(prompt);
    sendStats(res, session);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    entry.subscribers.delete(send);
    deleteSession(sessionId);
    res.end();
  } catch (err) {
    if (res.headersSent) res.end();
    else res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/agent/query ───────────────────────────────────────────────────

// Persistent query session (survives across follow-up messages)
let querySessionId: string | null = null;

router.post('/agent/query/reset', (_req, res) => {
  if (querySessionId) {
    deleteSession(querySessionId);
    querySessionId = null;
  }
  res.json({ ok: true });
});

router.post('/agent/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) { res.status(400).json({ error: 'question required' }); return; }

    // Reuse existing query session or create a new one
    let session = querySessionId ? getSession(querySessionId) : null;
    if (!session) {
      const created = await createWikiSession();
      querySessionId = created.sessionId;
      session = created.session;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(querySessionId!)!;
    const send = createEventForwarder(res);
    entry.subscribers.add(send);
    req.on('close', () => { entry.subscribers.delete(send); });

    await session.prompt(question);
    sendStats(res, session);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    entry.subscribers.delete(send);
    res.end();
  } catch (err) {
    if (querySessionId) {
      deleteSession(querySessionId);
      querySessionId = null;
    }
    if (res.headersSent) res.end();
    else res.status(500).json({ error: String(err) });
  }
});

export default router;
