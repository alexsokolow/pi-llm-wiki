# Pi SDK Agent Harness — Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:executing-plans` or `/skill:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Replace direct LLM API calls with the Pi SDK as the backend engine. Add a `/config` interface for model selection and plugin toggles. Remove all "ollama" naming.

**Architecture:** Express server boots a Pi `AgentSession` per user request. The agent has wiki-specific tools (`wiki_read`, `wiki_write`, etc.) plus configurable Pi built-in tools. Frontend streams events via SSE. A settings page lets users pick models and enable/disable features.

**Tech Stack:** TypeScript, Express, Pi SDK (`@mariozechner/pi-coding-agent`), React, D3

---

## Current State

- `server/routes/ollama.ts` — direct LLM calls via `llm-client.ts`
- `server/lib/llm-client.ts` — GitHub Copilot/OpenRouter/Ollama API wrapper
- `server/lib/pi-harness.ts` — started but broken (wrong imports)
- Frontend calls `/api/ollama/*` endpoints
- No configuration UI

## Target State

- `server/routes/agent.ts` — Pi SDK session routes (`/api/sessions/*`)
- `server/lib/pi-harness.ts` — session manager + wiki tools
- `server/lib/config.ts` — app configuration (model, plugins)
- Frontend calls `/api/sessions/*` and `/api/config`
- New `SettingsView.tsx` for model selection + plugin toggles

---

### Task 1: Remove ollama naming from frontend

**Files:**
- Modify: `src/App.tsx` — rename nav label from `[ingest]` flow
- Modify: `src/pages/IngestView.tsx` — remove references to `/api/ollama/ingest`
- Modify: `src/pages/QueryView.tsx` — remove references to `/api/ollama/query`
- Modify: `src/pages/ExploreView.tsx` — remove references to `/api/ollama/models`

**Step 1: Rename API calls in IngestView**

Change `fetch('/api/ollama/ingest')` to `fetch('/api/sessions/...')` (stub for now).

**Step 2: Rename API calls in QueryView**

Change `fetch('/api/ollama/query')` to `fetch('/api/sessions/...')`.

**Step 3: Rename model fetch in all views**

Change `fetch('/api/ollama/models')` to `fetch('/api/models')`.

**Step 4: Commit**

```bash
git add src/
git commit -m "refactor: remove ollama naming from frontend API calls"
```

---

### Task 2: Create app configuration system

**Files:**
- Create: `server/lib/config.ts`
- Create: `server/routes/config.ts`
- Modify: `server/index.ts` — mount config router

**Step 1: Write config module**

```typescript
// server/lib/config.ts
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

export interface AppConfig {
  defaultModel: string;
  defaultProvider: string;
  thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  plugins: {
    webSearch: boolean;
    codeSearch: boolean;
    subagents: boolean;
    fileSystem: boolean;
  };
}

const CONFIG_PATH = path.resolve('wiki', '.config.json');

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return getDefaultConfig();
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getDefaultConfig(): AppConfig {
  return {
    defaultModel: 'claude-opus-4.6',
    defaultProvider: 'github-copilot',
    thinkingLevel: 'medium',
    plugins: {
      webSearch: false,
      codeSearch: false,
      subagents: true,
      fileSystem: true,
    },
  };
}
```

**Step 2: Write config routes**

```typescript
// server/routes/config.ts
import { Router } from 'express';
import { loadConfig, saveConfig } from '../lib/config.js';

const router = Router();

router.get('/', async (_req, res) => {
  const config = await loadConfig();
  res.json(config);
});

router.post('/', async (req, res) => {
  await saveConfig(req.body);
  res.json({ success: true });
});

export default router;
```

**Step 3: Mount in server**

Add `app.use('/api/config', configRouter);` to `server/index.ts`.

**Step 4: Commit**

```bash
git add server/lib/config.ts server/routes/config.ts server/index.ts
git commit -m "feat: add app configuration system"
```

---

### Task 3: Rewrite pi-harness.ts with correct SDK imports

**Files:**
- Create: `server/lib/pi-harness.ts` (replace broken one)
- Delete: old `server/lib/pi-harness.ts`

**Step 1: Fix imports and structure**

The SDK exports `defineTool` for custom tools. Use that instead of inline objects.

```typescript
import {
  AuthStorage,
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  defineTool,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import * as wikiFs from './wiki-fs.js';
```

**Step 2: Define wiki tools with `defineTool()`**

```typescript
export const wikiReadTool = defineTool({
  name: 'wiki_read',
  label: 'Wiki Read',
  description: 'Read a wiki page by path',
  parameters: Type.Object({
    path: Type.String(),
  }),
  execute: async (_id, params) => {
    const content = await wikiFs.readPage(params.path).catch(() => '');
    return { content: [{ type: 'text', text: content }], details: {} };
  },
});

// ... wiki_write, wiki_list, wiki_search, wiki_sources
```

**Step 3: Session factory**

```typescript
export async function createWikiSession(opts: {
  modelName?: string;
  provider?: string;
  thinkingLevel?: string;
  enableWebSearch?: boolean;
  enableCodeSearch?: boolean;
  enableFileSystem?: boolean;
  enableSubagents?: boolean;
} = {}) {
  const authStorage = AuthStorage.create();
  const model = opts.modelName && opts.provider
    ? getModel(opts.provider, opts.modelName)
    : undefined;

  const toolNames = ['read'];
  if (opts.enableFileSystem !== false) toolNames.push('bash', 'edit', 'write');
  if (opts.enableCodeSearch) toolNames.push('grep', 'find', 'ls');
  // webSearch and subagents handled by extensions

  const systemPrompt = await loadSystemPrompt();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model: model ?? undefined,
    thinkingLevel: (opts.thinkingLevel as any) ?? 'medium',
    authStorage,
    customTools: [wikiReadTool, wikiWriteTool, wikiListTool, wikiSearchTool, wikiSourcesTool],
    tools: toolNames,
    sessionManager: SessionManager.inMemory(),
  });

  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const eventBuffer: AgentSessionEvent[] = [];
  const subscribers = new Set<(e: AgentSessionEvent) => void>();

  const unsubscribe = session.subscribe((event) => {
    eventBuffer.push(event);
    subscribers.forEach((cb) => cb(event));
  });

  sessions.set(sessionId, { session, unsubscribe, eventBuffer, subscribers });

  return { sessionId, session };
}
```

**Step 4: Commit**

```bash
git add server/lib/pi-harness.ts
git commit -m "feat: rewrite pi-harness with correct SDK imports and wiki tools"
```

---

### Task 4: Create agent routes (replaces ollama.ts)

**Files:**
- Create: `server/routes/agent.ts`
- Delete: `server/routes/ollama.ts`
- Modify: `server/index.ts` — mount agent router, remove ollama router

**Step 1: Write agent routes**

```typescript
// server/routes/agent.ts
import { Router } from 'express';
import { createWikiSession, getSession, listSessionIds } from '../lib/pi-harness.js';

const router = Router();

// GET /api/models — list available models from Pi's ModelRegistry
router.get('/models', async (_req, res) => {
  try {
    const { AuthStorage, ModelRegistry } = await import('@mariozechner/pi-coding-agent');
    const authStorage = AuthStorage.create();
    const registry = ModelRegistry.create(authStorage);
    const available = await registry.getAvailable();
    res.json({ models: available });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/sessions — create new agent session
router.post('/sessions', async (req, res) => {
  try {
    const { modelName, provider, thinkingLevel, plugins } = req.body;
    const result = await createWikiSession({
      modelName,
      provider,
      thinkingLevel,
      enableFileSystem: plugins?.fileSystem,
      enableCodeSearch: plugins?.codeSearch,
    });
    res.json({ sessionId: result.sessionId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/sessions — list active sessions
router.get('/sessions', (_req, res) => {
  res.json({ sessions: listSessionIds() });
});

// POST /api/sessions/:id/prompt — send prompt
router.post('/sessions/:id/prompt', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const { text } = req.body;
    await session.prompt(text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/sessions/:id/events — SSE stream
router.get('/sessions/:id/events', (req, res) => {
  const sessionEntry = getSessionEntry(req.params.id);
  if (!sessionEntry) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send buffered events
  sessionEntry.eventBuffer.forEach((e) => {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  });

  // Subscribe to new events
  const send = (e: any) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  sessionEntry.subscribers.add(send);

  req.on('close', () => {
    sessionEntry.subscribers.delete(send);
    res.end();
  });
});

// POST /api/sessions/:id/reset — clear session
router.post('/sessions/:id/reset', async (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    // Pi sessions don't have a direct reset — create new
    res.json({ success: true, note: 'Create a new session instead' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

**Step 2: Update server/index.ts**

Remove `import ollamaRouter from './routes/ollama.js'` and `app.use('/api/ollama', ollamaRouter)`.
Add `import agentRouter from './routes/agent.js'` and `app.use('/api', agentRouter)`.

**Step 3: Commit**

```bash
git add server/routes/agent.ts server/index.ts && git rm server/routes/ollama.ts
git commit -m "feat: replace ollama routes with Pi SDK agent routes"
```

---

### Task 5: Delete old llm-client.ts

**Files:**
- Delete: `server/lib/llm-client.ts`

**Step 1: Remove file**

```bash
git rm server/lib/llm-client.ts
git commit -m "chore: remove old llm-client.ts (replaced by Pi SDK)"
```

---

### Task 6: Create SettingsView frontend page

**Files:**
- Create: `src/pages/SettingsView.tsx`
- Modify: `src/App.tsx` — add `[config]` tab
- Modify: `src/styles/retro.css` — add settings styles

**Step 1: Write SettingsView**

```tsx
import { useState, useEffect } from 'react';

interface AppConfig {
  defaultModel: string;
  defaultProvider: string;
  thinkingLevel: string;
  plugins: {
    webSearch: boolean;
    codeSearch: boolean;
    subagents: boolean;
    fileSystem: boolean;
  };
}

interface ModelInfo {
  provider: string;
  id: string;
  name?: string;
}

export default function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig);
    fetch('/api/models').then(r => r.json()).then(d => setModels(d.models || []));
  }, []);

  const save = async () => {
    if (!config) return;
    setStatus('saving...');
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setStatus(res.ok ? 'saved' : 'failed');
  };

  if (!config) return <div className="empty">loading config...</div>;

  return (
    <div className="settings">
      <div className="panel-title">&gt; CONFIGURATION</div>

      <div className="settings-section">
        <div className="settings-label">Default Model</div>
        <select
          className="model-select"
          value={`${config.defaultProvider}/${config.defaultModel}`}
          onChange={e => {
            const [provider, model] = e.target.value.split('/');
            setConfig({ ...config, defaultProvider: provider, defaultModel: model });
          }}
        >
          {models.map(m => (
            <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
              {m.provider} / {m.id}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <div className="settings-label">Thinking Level</div>
        <select
          className="model-select"
          value={config.thinkingLevel}
          onChange={e => setConfig({ ...config, thinkingLevel: e.target.value })}
        >
          {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <div className="settings-label">Plugins</div>
        {Object.entries(config.plugins).map(([key, enabled]) => (
          <label key={key} className="settings-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setConfig({
                ...config,
                plugins: { ...config.plugins, [key]: e.target.checked },
              })}
            />
            {key}
          </label>
        ))}
      </div>

      <div className="settings-actions">
        <button className="btn" onClick={save}>SAVE</button>
        {status && <span className="status-line">&gt; {status}</span>}
      </div>
    </div>
  );
}
```

**Step 2: Add settings styles to retro.css**

```css
.settings {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.settings-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid #30363d;
  background: #161b22;
}

.settings-label {
  font-family: 'VT323', monospace;
  font-size: 1.1rem;
  text-transform: uppercase;
  color: #8b949e;
  margin-bottom: 0.75rem;
  letter-spacing: 1px;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  color: #c9d1d9;
  cursor: pointer;
}

.settings-toggle input[type="checkbox"] {
  accent-color: #58a6ff;
}

.settings-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
```

**Step 3: Add [config] tab to App.tsx**

Add `{ key: 'config', label: '[config]' }` to `navItems` and `view === 'config' && <SettingsView />` to the render.

**Step 4: Commit**

```bash
git add src/pages/SettingsView.tsx src/App.tsx src/styles/retro.css
git commit -m "feat: add SettingsView for model and plugin configuration"
```

---

### Task 7: Update IngestView to use Pi agent sessions

**Files:**
- Modify: `src/pages/IngestView.tsx`

**Step 1: Replace direct API with session-based flow**

Instead of `POST /api/ollama/ingest`, the flow becomes:
1. `POST /api/sessions` to create session
2. `POST /api/sessions/:id/prompt` with the document text
3. `GET /api/sessions/:id/events` (SSE) to stream agent reasoning

The agent uses its `wiki_write` tool to create pages — no JSON parsing needed.

**Step 2: Commit**

```bash
git add src/pages/IngestView.tsx
git commit -m "feat: IngestView uses Pi agent sessions"
```

---

### Task 8: Update QueryView to use Pi agent sessions

**Files:**
- Modify: `src/pages/QueryView.tsx`

**Step 1: Replace direct API with session-based flow**

Same pattern as IngestView: create session → prompt → stream events.

**Step 2: Commit**

```bash
git add src/pages/QueryView.tsx
git commit -m "feat: QueryView uses Pi agent sessions"
```

---

### Task 9: TypeScript verification

**Step 1: Run type check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

**Step 2: Fix any remaining issues**

Common issues:
- Missing type imports from `@mariozechner/pi-coding-agent`
- `defineTool` parameter types
- Session event types

**Step 3: Commit**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors"
```

---

### Task 10: Final integration test

**Step 1: Boot server**

```bash
npm run dev
```

Expected: Server starts on port 3000, no crashes.

**Step 2: Test config API**

```bash
curl http://localhost:3000/api/config
curl http://localhost:3000/api/models
```

**Step 3: Test session creation**

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"thinkingLevel":"medium"}'
```

**Step 4: Test event stream**

```bash
curl http://localhost:3000/api/sessions/{sessionId}/events
```

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify Pi SDK integration boots correctly"
```

---

## Handoff

**Plan complete and saved to `docs/plans/2026-05-05-pi-sdk-agent-harness.md`.**

Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** `/skill:subagent-driven-development`

**2. Parallel Session (separate)** — Open new session with `/skill:executing-plans`, batch execution with checkpoints.

**Which approach?**
