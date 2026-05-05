/**
 * Pi SDK Agent Harness for LLM Wiki
 *
 * Single file: boot, session management, custom wiki tools, SSE streaming.
 */

import { AuthStorage, createAgentSession, SessionManager, DefaultResourceLoader, type AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import { getModel } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import * as wikiFs from './wiki-fs.js';

const WIKI_ROOT = process.cwd();

// ─── Session store ───────────────────────────────────────────────────────────

interface SessionEntry {
  session: Awaited<ReturnType<typeof createAgentSession>>['session'];
  unsubscribe: () => void;
}

const sessions = new Map<string, SessionEntry>();

export function listSessionIds(): string[] {
  return Array.from(sessions.keys());
}

export function getSession(id: string) {
  return sessions.get(id)?.session;
}

// ─── Custom Wiki Tools ───────────────────────────────────────────────────────

const wikiReadTool = {
  name: 'wiki_read',
  label: 'Wiki Read',
  description: 'Read a wiki page by relative path (e.g., "concepts/water-for-injection.md"). Returns the full markdown content.',
  parameters: Type.Object({
    path: Type.String({ description: 'Relative path to page, e.g. "concepts/foo.md"' }),
  }),
  execute: async (_id: string, params: { path: string }) => {
    const content = await wikiFs.readPage(params.path).catch(() => '');
    return {
      content: [{ type: 'text' as const, text: content || '(page not found)' }],
      details: {},
    };
  },
};

const wikiWriteTool = {
  name: 'wiki_write',
  label: 'Wiki Write',
  description: 'Write a wiki page at a given path with markdown content. Creates directories as needed.',
  parameters: Type.Object({
    path: Type.String({ description: 'Relative path to page, e.g. "entities/bar.md"' }),
    content: Type.String({ description: 'Full markdown content including YAML frontmatter' }),
  }),
  execute: async (_id: string, params: { path: string; content: string }) => {
    await wikiFs.writePage(params.path, params.content);
    return {
      content: [{ type: 'text' as const, text: `Wrote ${params.path}` }],
      details: {},
    };
  },
};

const wikiListTool = {
  name: 'wiki_list',
  label: 'Wiki List',
  description: 'List all wiki pages. Returns a JSON array of paths.',
  parameters: Type.Object({}),
  execute: async () => {
    const pages = await wikiFs.listPages();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(pages, null, 2) }],
      details: {},
    };
  },
};

const wikiSearchTool = {
  name: 'wiki_search',
  label: 'Wiki Search',
  description: 'Search wiki pages by keyword. Returns matching pages with previews.',
  parameters: Type.Object({
    query: Type.String({ description: 'Search query, e.g. "C201" or "water injection"' }),
  }),
  execute: async (_id: string, params: { query: string }) => {
    const results = await wikiFs.searchWiki(params.query);
    const text = results.map((r) => `--- ${r.path} ---\n${r.preview}`).join('\n\n');
    return {
      content: [{ type: 'text' as const, text: text || '(no results)' }],
      details: {},
    };
  },
};

const wikiSourcesTool = {
  name: 'wiki_sources',
  label: 'Wiki Sources',
  description: 'List raw source filenames that have been uploaded.',
  parameters: Type.Object({}),
  execute: async () => {
    const sources = await wikiFs.listSources();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(sources, null, 2) }],
      details: {},
    };
  },
};

// ─── Agent Boot ──────────────────────────────────────────────────────────────

async function getAuthAndRegistry() {
  // Use the user's existing pi auth.json (same credentials as their CLI pi)
  const authStorage = AuthStorage.create();
  const modelRegistry = AuthStorage.create(); // placeholder
  return { authStorage, modelRegistry };
}

export async function createWikiSession(opts: {
  modelName?: string;
  provider?: string;
  thinkingLevel?: string;
  disableTools?: string[];
} = {}) {
  const { authStorage, modelRegistry } = await getAuthAndRegistry();

  // Resolve model
  const model = opts.modelName && opts.provider
    ? getModel(opts.provider, opts.modelName)
    : undefined;

  // Base system prompt = AGENTS.md + wiki context
  const systemPrompt = await getSystemPrompt();

  // Which pi built-in tools to include
  const toolNames = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'];

  // WIKI TOOLS always included (the point of the app)
  const customTools = [wikiReadTool, wikiWriteTool, wikiListTool, wikiSearchTool, wikiSourcesTool];

  const { session } = await createAgentSession({
    cwd: WIKI_ROOT,
    model: model ?? undefined,
    thinkingLevel: (opts.thinkingLevel as any) ?? 'medium',
    authStorage,
    // @ts-ignore — customTools is typed differently internally
    customTools,
    tools: toolNames,
    sessionManager: SessionManager.inMemory(),
    resourceLoader: await createWikiResourceLoader(systemPrompt),
  });

  const sessionId = `sess-${Date.now()}`;

  // Capture events for SSE replay
  const eventBuffer: AgentSessionEvent[] = [];
  const subscribers = new Set<(e: AgentSessionEvent) => void>();

  const unsubscribe = session.subscribe((event) => {
    eventBuffer.push(event);
    subscribers.forEach((cb) => cb(event));
  });

  sessions.set(sessionId, { session, unsubscribe });

  return { sessionId, session, eventBuffer, subscribers };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSystemPrompt(): Promise<string> {
  try {
    const { readFile } = await import('fs/promises');
    const agentsMd = await readFile('AGENTS.md', 'utf-8').catch(() => '');
    const wikiIndex = await wikiFs.readWikiFile('index.md').catch(() => '');
    return `${agentsMd}\n\n---\n\nWiki index:\n${wikiIndex}\n\nYou have wiki_read, wiki_write, wiki_list, wiki_search, wiki_sources tools. Use them to interact with the wiki filesystem. When writing pages, always include YAML frontmatter with title, date, tags, source_count, last_updated.`;
  } catch {
    return '';
  }
}

async function createWikiResourceLoader(systemPrompt: string) {
  const { DefaultResourceLoader } = await import('@mariozechner/pi-coding-agent');
  const loader = new DefaultResourceLoader({
    cwd: WIKI_ROOT,
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();
  return loader;
}

// ─── Event streaming ─────────────────────────────────────────────────────────

export function streamSessionEvents(
  sessionId: string,
  send: (data: string) => void,
  onClose: () => void
) {
  const entry = sessions.get(sessionId);
  if (!entry) return onClose();

  // Already buffered events
  const evt = getEventBuffer(sessionId);
  if (evt) {
    evt.buffer.forEach((e) => send(JSON.stringify(e)));
  }

  const cb = (e: AgentSessionEvent) => send(JSON.stringify(e));
  evt?.subscribers.add(cb);

  return () => {
    evt?.subscribers.delete(cb);
    onClose();
  };
}

const eventBuffers = new Map<string, { buffer: AgentSessionEvent[]; subscribers: Set<(e: AgentSessionEvent) => void> }>();

function getEventBuffer(sessionId: string) {
  return eventBuffers.get(sessionId);
}

// Wire event buffer on session create
const _origCreate = createWikiSession;
export async function createWikiSessionWithBuffer(opts?: Parameters<typeof createWikiSession>[0]) {
  const result = await _origCreate(opts);
  eventBuffers.set(result.sessionId, { buffer: [], subscribers: new Set() });

  const entry = sessions.get(result.sessionId)!;
  const origUnsub = entry.unsubscribe;
  entry.unsubscribe = () => {
    origUnsub();
    eventBuffers.delete(result.sessionId);
  };

  // Re-subscribe to also push to our buffer
  entry.session.subscribe((event) => {
    const buf = eventBuffers.get(result.sessionId);
    if (buf) buf.buffer.push(event);
  });

  return result;
}
