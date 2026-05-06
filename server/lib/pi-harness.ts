import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import { homedir } from 'os';
import path from 'path';
import { readFile, mkdir } from 'fs/promises';
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

// ─── Session Factory ─────────────────────────────────────────────────────────

export async function createWikiSession(opts?: {
  provider?: string;
  model?: string;
  thinkingLevel?: string;
}): Promise<{ sessionId: string; session: AgentSession }> {
  const config = await loadConfig();
  // Use local agent directory — fully self-contained, no global ~/.pi/agent dependency
  const agentDir = path.resolve('wiki/.agent');
  await mkdir(agentDir, { recursive: true });
  const authStorage = AuthStorage.create(path.resolve('wiki/.auth.json'));

  // Build system prompt from wiki/AGENT.md
  const agentsMd = await readFile('wiki/AGENT.md', 'utf-8').catch(() => '');
  const wikiIndex = await readFile('wiki/index.md', 'utf-8').catch(() => '');
  const systemPrompt = `${agentsMd}

---

## Wiki State

Index:
${wikiIndex}`;

  // Single agent with minimal tools — skills teach conventions
  const toolNames: string[] = ['read', 'bash', 'edit', 'write', 'document_parse'];

  const thinkingLevel = (opts?.thinkingLevel ?? config.thinkingLevel) as any;

  // Resolve model from app config using local auth
  const modelRegistry = ModelRegistry.create(authStorage, path.resolve('wiki/.models.json'));
  const provider = opts?.provider ?? config.defaultProvider;
  const modelId = opts?.model ?? config.defaultModel;
  const model = modelRegistry.find(provider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${provider}/${modelId}. Check config tab settings.`);
  }

  // Load pi-docparser extension for PDF/DOCX parsing
  const docparserExtPath = path.resolve('node_modules/pi-docparser/extensions/docparser/index.ts');

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir,
    noExtensions: true,  // Don't discover global extensions
    noSkills: true,      // Don't discover global skills
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true, // Don't read global AGENTS.md
    additionalExtensionPaths: [docparserExtPath],
    skillsOverride: (current) => ({
      skills: [
        ...current.skills,
        {
          name: 'document-extraction',
          description: 'Extract text from PDF, DOCX, images using document_parse',
          filePath: path.resolve('wiki/skills/document-extraction/SKILL.md'),
          baseDir: path.resolve('wiki/skills/document-extraction'),
          source: 'project',
        },
        {
          name: 'wiki-operations',
          description: 'Conventions for wiki page creation, index, log, cross-references',
          filePath: path.resolve('wiki/skills/wiki-operations/SKILL.md'),
          baseDir: path.resolve('wiki/skills/wiki-operations'),
          source: 'project',
        },
      ],
      diagnostics: current.diagnostics,
    }),
    systemPromptOverride: () => systemPrompt,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    agentDir,
    model,
    thinkingLevel,
    authStorage,
    modelRegistry,
    tools: toolNames,
    sessionManager: SessionManager.inMemory(),
    resourceLoader: loader,
  });

  // Log available tools for debugging
  const agentTools = session.agent.state.tools.map((t: any) => t.name || t.label || 'unknown');
  console.log(`  🔧 [session] tools: ${agentTools.join(', ')}`);

  const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const events: AgentSessionEvent[] = [];
  const subscribers = new Set<(e: AgentSessionEvent) => void>();

  const toolTimers = new Map<string, number>();

  const unsubscribe = session.subscribe((event) => {
    // Server-side logging
    if (event.type === 'tool_execution_start') {
      const e = event as any;
      toolTimers.set(e.toolCallId, Date.now());
      const args = e.args ? JSON.stringify(e.args) : '';
      console.log(`\n  ⚡ ${e.toolName} ${args}`);
    } else if (event.type === 'tool_execution_end') {
      const e = event as any;
      const start = toolTimers.get(e.toolCallId) || Date.now();
      const dur = ((Date.now() - start) / 1000).toFixed(2);
      const status = e.isError ? '❌' : '✅';
      let result = '';
      if (e.result?.content?.[0]?.text) {
        result = e.result.content[0].text;
      }
      console.log(`\n  ${status} ${e.toolName} (${dur}s)`);
      if (result) console.log(result);
    } else if (event.type === 'agent_start') {
      console.log(`\n  🧠 agent reasoning...`);
    } else if (event.type === 'agent_end') {
      try {
        const stats = (session as any).getSessionStats();
        const t = stats.tokens;
        console.log(`\n  🏁 done | ↑${t.input} ↓${t.output} R${t.cacheRead} W${t.cacheWrite} $${stats.cost?.toFixed(3) || '0'} | ${stats.toolCalls} tool calls`);
      } catch {
        console.log(`\n  🏁 agent finished`);
      }
    } else if (event.type === 'message_update') {
      const me = event as any;
      if (me.assistantMessageEvent?.type === 'text_delta') {
        process.stdout.write(me.assistantMessageEvent.delta);
      }
    }
    events.push(event);
    subscribers.forEach((cb) => cb(event));
  });

  sessions.set(sessionId, { session, events, subscribers, unsubscribe });

  return { sessionId, session };
}
