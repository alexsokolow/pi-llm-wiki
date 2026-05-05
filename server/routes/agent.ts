import { Router } from 'express';
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import { homedir } from 'os';
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
  // Track sub-agent state for delta-only streaming
  const subagentState = new Map<string, { outputLen: number; toolCount: number; lastTool: string }>();
  let lastStepIndex = -1;

  return (e: any) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
      res.write(`data: ${JSON.stringify({ type: 'text', content: e.assistantMessageEvent.delta })}\n\n`);
    } else if (e.type === 'tool_execution_start') {
      toolTimers.set(e.toolCallId, Date.now());
      const argsPreview = e.args ? JSON.stringify(e.args).slice(0, 300) : '';
      res.write(`data: ${JSON.stringify({
        type: 'tool_start',
        tool: e.toolName,
        args: argsPreview,
        elapsed,
      })}\n\n`);
    } else if (e.type === 'tool_execution_end') {
      const toolStart = toolTimers.get(e.toolCallId) || startTime;
      const duration = ((Date.now() - toolStart) / 1000).toFixed(2);
      let resultPreview = '';
      if (e.result?.content?.[0]?.text) {
        resultPreview = e.result.content[0].text;
      }
      res.write(`data: ${JSON.stringify({
        type: 'tool_end',
        tool: e.toolName,
        error: e.isError,
        duration: `${duration}s`,
        result: resultPreview,
        elapsed,
      })}\n\n`);
    } else if (e.type === 'tool_execution_update' && e.toolName === 'subagent') {
      const pr = e.partialResult;
      if (!pr?.details) return;
      const details = pr.details;
      // Emit chain step transitions
      if (details.currentStepIndex !== undefined && details.currentStepIndex !== lastStepIndex) {
        lastStepIndex = details.currentStepIndex;
        const agents = details.chainAgents || [];
        const current = agents[details.currentStepIndex] || 'agent';
        res.write(`data: ${JSON.stringify({
          type: 'subagent_step',
          step: details.currentStepIndex + 1,
          totalSteps: details.totalSteps || agents.length,
          agent: current,
          elapsed,
        })}\n\n`);
      }
      // Emit new tool calls and output lines (delta only)
      if (details.progress) {
        for (const p of details.progress) {
          const key = `${p.agent}-${p.index || 0}`;
          const prev = subagentState.get(key) || { outputLen: 0, toolCount: 0, lastTool: '' };
          const updates: any = { type: 'subagent_progress', agent: p.agent, elapsed };
          let hasNew = false;
          if (p.currentTool && p.currentTool !== prev.lastTool) {
            updates.tool = p.currentToolArgs ? `${p.currentTool}(${p.currentToolArgs})` : p.currentTool;
            prev.lastTool = p.currentTool;
            hasNew = true;
          }
          if (p.recentOutput?.length > prev.outputLen) {
            updates.output = p.recentOutput.slice(prev.outputLen).filter((l: string) => l.trim());
            prev.outputLen = p.recentOutput.length;
            hasNew = true;
          }
          if (hasNew) {
            subagentState.set(key, prev);
            res.write(`data: ${JSON.stringify(updates)}\n\n`);
          }
        }
      }
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
    const agentDir = path.join(homedir(), '.pi', 'agent');
    const authStorage = AuthStorage.create(path.join(agentDir, 'auth.json'));
    const registry = ModelRegistry.create(authStorage, path.join(agentDir, 'models.json'));
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

    console.log(`\n📄 Ingesting: ${filename} (using document_parse)`);

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

Steps:
1. Use document_parse({ path: "${filePath}" }) to extract the text content
2. Use wiki_list() to check existing pages and avoid duplicates
3. Create a source summary page using wiki_write()
4. Create entity pages for key people, orgs, equipment, systems
5. Create concept pages for methods, standards, processes
6. Add [[cross-references]] between related pages
7. Be thorough — create 5-15 pages from this source`;

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

router.post('/agent/query', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) { res.status(400).json({ error: 'question required' }); return; }

    const { sessionId, session } = await createWikiSession();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(sessionId)!;
    const send = createEventForwarder(res);
    entry.subscribers.add(send);
    req.on('close', () => { entry.subscribers.delete(send); });

    const prompt = `Answer this question using the wiki: ${question}\n\nUse wiki_search and wiki_read to find relevant information. Cite pages with [[Title]] notation.`;

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

export default router;
