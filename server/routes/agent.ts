import { Router } from 'express';
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import { homedir } from 'os';
import path from 'path';
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
    const agentDir = path.join(homedir(), '.pi', 'agent');
    const authStorage = AuthStorage.create(path.join(agentDir, 'auth.json'));
    const registry = ModelRegistry.create(authStorage, path.join(agentDir, 'models.json'));
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

    // Pre-extract text from binary files (PDF, DOCX)
    const { readFile } = await import('fs/promises');
    const filePath = path.resolve('wiki/raw', filename);
    const ext = path.extname(filename).toLowerCase();
    let sourceText = '';

    try {
      if (ext === '.pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = await readFile(filePath);
        const data = await pdfParse(buffer);
        sourceText = data.text;
      } else if (ext === '.docx') {
        const mammoth = await import('mammoth');
        const result = await mammoth.default.extractRawText({ path: filePath });
        sourceText = result.value;
      } else {
        sourceText = await readFile(filePath, 'utf-8');
      }
    } catch (e) {
      res.status(400).json({ error: `Failed to extract text from ${filename}: ${e}` });
      return;
    }

    if (!sourceText.trim()) {
      res.status(400).json({ error: `No text could be extracted from ${filename}` });
      return;
    }

    // Cap content for the LLM context
    if (sourceText.length > 15000) {
      sourceText = sourceText.slice(0, 10000) + '\n\n[... content truncated ...]\n\n' + sourceText.slice(-5000);
    }

    console.log(`\n📄 Ingesting: ${filename} (${sourceText.length} chars extracted)`);

    const { sessionId, session } = await createWikiSession();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(sessionId)!;
    const send = (e: any) => {
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', content: e.assistantMessageEvent.delta })}\n\n`);
      } else if (e.type === 'tool_execution_start') {
        res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: e.toolName })}\n\n`);
      } else if (e.type === 'tool_execution_end') {
        res.write(`data: ${JSON.stringify({ type: 'tool_end', tool: e.toolName, error: e.isError })}\n\n`);
      } else if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'thinking_delta') {
        res.write(`data: ${JSON.stringify({ type: 'thinking', content: e.assistantMessageEvent.delta })}\n\n`);
      }
    };
    entry.subscribers.add(send);

    req.on('close', () => { entry.subscribers.delete(send); });

    const prompt = `Ingest this document into the wiki.

Source file: ${filename}

Extracted text content:
---
${sourceText}
---

Your task:
1. Use wiki_list() to see existing pages
2. Create a source summary page using wiki_write()
3. Create entity pages for key people, orgs, equipment, systems
4. Create concept pages for methods, standards, processes
5. Add [[cross-references]] between related pages
6. Be thorough — create 5-15 pages from this source`;

    await session.prompt(prompt);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
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
    res.setHeader('Connection', 'keep-alive');

    const entry = getSessionEntry(sessionId)!;
    const send = (e: any) => {
      if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text', content: e.assistantMessageEvent.delta })}\n\n`);
      } else if (e.type === 'tool_execution_start') {
        res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: e.toolName })}\n\n`);
      } else if (e.type === 'tool_execution_end') {
        res.write(`data: ${JSON.stringify({ type: 'tool_end', tool: e.toolName, error: e.isError })}\n\n`);
      } else if (e.type === 'message_update' && e.assistantMessageEvent?.type === 'thinking_delta') {
        res.write(`data: ${JSON.stringify({ type: 'thinking', content: e.assistantMessageEvent.delta })}\n\n`);
      }
    };
    entry.subscribers.add(send);

    req.on('close', () => { entry.subscribers.delete(send); });

    const prompt = `Answer this question using the wiki: ${question}\n\nUse wiki_search and wiki_read to find relevant information. Cite pages with [[Title]] notation.`;

    await session.prompt(prompt);
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
