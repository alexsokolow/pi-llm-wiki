import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { readFile } from 'fs/promises';
import * as wikiFs from './wiki-fs.js';
import { loadConfig } from './config.js';

// ─── Session Store ───────────────────────────────────────────────────────────

interface SessionEntry {
  session: AgentSession;
  events: AgentSessionEvent[];
  subscribers: Set<(e: AgentSessionEvent) => void>;
  unsubscribe: () => void;
}

const sessions = new Map<string, SessionEntry>();

export function getSessionEntry(id: string): SessionEntry | undefined {
  return sessions.get(id);
}

export function getSession(id: string): AgentSession | undefined {
  return sessions.get(id)?.session;
}

export function listSessionIds(): string[] {
  return Array.from(sessions.keys());
}

export function deleteSession(id: string): void {
  const entry = sessions.get(id);
  if (entry) {
    entry.unsubscribe();
    entry.session.dispose();
    sessions.delete(id);
  }
}

// ─── Wiki Custom Tools ───────────────────────────────────────────────────────

const wikiReadTool = defineTool({
  name: 'wiki_read',
  label: 'Wiki Read',
  description: 'Read a wiki page by relative path (e.g. "concepts/water-for-injection.md")',
  parameters: Type.Object({
    path: Type.String({ description: 'Relative path under wiki/pages/' }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: 'text', text: await wikiFs.readPage(params.path).catch(() => '(page not found)') }],
    details: {},
  }),
});

const wikiWriteTool = defineTool({
  name: 'wiki_write',
  label: 'Wiki Write',
  description: 'Write/create a wiki page at a given path with full markdown content',
  parameters: Type.Object({
    path: Type.String({ description: 'Relative path, e.g. "entities/my-page.md"' }),
    content: Type.String({ description: 'Full markdown content (include YAML frontmatter)' }),
  }),
  execute: async (_toolCallId, params) => {
    await wikiFs.writePage(params.path, params.content);
    return { content: [{ type: 'text', text: `Wrote wiki/pages/${params.path}` }], details: {} };
  },
});

const wikiListTool = defineTool({
  name: 'wiki_list',
  label: 'Wiki List',
  description: 'List all wiki page paths',
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: 'text', text: JSON.stringify(await wikiFs.listPages(), null, 2) }],
    details: {},
  }),
});

const wikiSearchTool = defineTool({
  name: 'wiki_search',
  label: 'Wiki Search',
  description: 'Search wiki pages by keyword. Returns matching paths and previews.',
  parameters: Type.Object({
    query: Type.String({ description: 'Search keywords' }),
  }),
  execute: async (_toolCallId, params) => {
    const results = await wikiFs.searchWiki(params.query);
    const text = results.length
      ? results.map((r) => `--- ${r.path} ---\n${r.preview}`).join('\n\n')
      : '(no results)';
    return { content: [{ type: 'text', text }], details: {} };
  },
});

const wikiSourcesTool = defineTool({
  name: 'wiki_sources',
  label: 'Wiki Sources',
  description: 'List uploaded raw source filenames in wiki/raw/',
  parameters: Type.Object({}),
  execute: async () => ({
    content: [{ type: 'text', text: JSON.stringify(await wikiFs.listSources(), null, 2) }],
    details: {},
  }),
});

// ─── Session Factory ─────────────────────────────────────────────────────────

export async function createWikiSession(opts?: {
  provider?: string;
  model?: string;
  thinkingLevel?: string;
}): Promise<{ sessionId: string; session: AgentSession }> {
  const config = await loadConfig();
  const authStorage = AuthStorage.create();

  // Build system prompt from wiki/AGENT.md (the wiki agent's instructions)
  const agentsMd = await readFile('wiki/AGENT.md', 'utf-8').catch(() => '');
  const wikiIndex = await wikiFs.readWikiFile('index.md').catch(() => '');
  const systemPrompt = `${agentsMd}

---

## Wiki State

Index:
${wikiIndex}

## Available Wiki Tools

You have wiki_read, wiki_write, wiki_list, wiki_search, wiki_sources tools.
Use them to interact with the wiki filesystem.
When writing pages, always include YAML frontmatter (title, date, tags, source_count, last_updated).
Use [[Page Title]] cross-references between related pages.`;

  // Determine tools based on config plugins
  const toolNames: string[] = ['read'];
  if (config.plugins.fileSystem) toolNames.push('bash', 'edit', 'write');
  if (config.plugins.codeSearch) toolNames.push('grep', 'find', 'ls');

  const thinkingLevel = (opts?.thinkingLevel ?? config.thinkingLevel) as any;

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    thinkingLevel,
    authStorage,
    tools: toolNames,
    customTools: [wikiReadTool, wikiWriteTool, wikiListTool, wikiSearchTool, wikiSourcesTool],
    sessionManager: SessionManager.inMemory(),
    resourceLoader: loader,
  });

  const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const events: AgentSessionEvent[] = [];
  const subscribers = new Set<(e: AgentSessionEvent) => void>();

  const unsubscribe = session.subscribe((event) => {
    events.push(event);
    subscribers.forEach((cb) => cb(event));
  });

  sessions.set(sessionId, { session, events, subscribers, unsubscribe });

  return { sessionId, session };
}
