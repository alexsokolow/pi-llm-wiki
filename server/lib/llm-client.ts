import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

// --- Types ---

export type Provider = 'copilot' | 'openrouter' | 'ollama';

export interface GenerateOpts {
  provider?: Provider;
  model?: string;
  system?: string;
  prompt: string;
  stream?: boolean;
}

interface AuthConfig {
  'github-copilot'?: {
    type: string;
    refresh: string;
    access: string;
    expires: number;
  };
  openrouter?: {
    type: string;
    key: string;
  };
}

// --- Provider configs ---

const PROVIDER_DEFAULTS: Record<Provider, { endpoint: string; model: string }> = {
  copilot: {
    endpoint: 'https://api.githubcopilot.com/chat/completions',
    model: 'gpt-4o-mini',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemini-2.0-flash-001',
  },
  ollama: {
    endpoint: `${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/generate`,
    model: 'gemma4',
  },
};

// --- Auth loading ---

let cachedAuth: AuthConfig | null = null;

async function loadAuth(): Promise<AuthConfig> {
  if (cachedAuth) return cachedAuth;
  try {
    const authPath = path.join(homedir(), '.pi', 'agent', 'auth.json');
    const raw = await readFile(authPath, 'utf-8');
    cachedAuth = JSON.parse(raw);
    return cachedAuth!;
  } catch {
    return {};
  }
}

function getAuthHeader(provider: Provider, auth: AuthConfig): string | null {
  switch (provider) {
    case 'copilot': {
      const copilot = auth['github-copilot'];
      if (!copilot?.access) return null;
      return `Bearer ${copilot.access}`;
    }
    case 'openrouter': {
      const or = auth.openrouter;
      if (!or?.key) return null;
      return `Bearer ${or.key}`;
    }
    case 'ollama':
      return null;
  }
}

// --- Streaming generator ---

export async function* generate(opts: GenerateOpts): AsyncGenerator<string, void, unknown> {
  const provider = opts.provider || getDefaultProvider();
  const config = PROVIDER_DEFAULTS[provider];
  const model = opts.model || config.model;

  if (provider === 'ollama') {
    yield* generateOllama(opts, model);
    return;
  }

  // OpenAI-compatible providers (Copilot, OpenRouter)
  const auth = await loadAuth();
  const authHeader = getAuthHeader(provider, auth);
  if (!authHeader) {
    throw new Error(`No credentials found for provider: ${provider}`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader,
  };

  // OpenRouter wants these headers
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:3000';
    headers['X-Title'] = 'LLM Wiki';
  }

  // Copilot wants these
  if (provider === 'copilot') {
    headers['Editor-Version'] = 'vscode/1.99.0';
    headers['Copilot-Integration-Id'] = 'vscode-chat';
    headers['Editor-Plugin-Version'] = 'copilot-chat/0.25.0';
  }

  const messages: { role: string; content: string }[] = [];
  if (opts.system) {
    messages.push({ role: 'system', content: opts.system });
  }
  messages.push({ role: 'user', content: opts.prompt });

  const body = {
    model,
    messages,
    stream: opts.stream !== false,
    max_tokens: 4096,
  };

  const resp = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`${provider} HTTP ${resp.status}: ${errText}`);
  }

  if (!resp.body) {
    throw new Error(`${provider} returned empty body`);
  }

  if (opts.stream === false) {
    const data = await resp.json() as { choices: { message: { content: string } }[] };
    yield data.choices?.[0]?.message?.content || '';
    return;
  }

  // SSE streaming
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // skip malformed SSE line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Ollama fallback (same format as before) ---

async function* generateOllama(opts: GenerateOpts, model: string): AsyncGenerator<string, void, unknown> {
  const endpoint = PROVIDER_DEFAULTS.ollama.endpoint;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system: opts.system,
      prompt: opts.prompt,
      stream: opts.stream !== false,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
  }
  if (!resp.body) {
    throw new Error('Ollama returned empty body');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.response) yield json.response;
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Model listing ---

export async function listModels(): Promise<{ provider: Provider; models: string[] }[]> {
  const results: { provider: Provider; models: string[] }[] = [];
  const auth = await loadAuth();

  // Copilot models (hardcoded known set)
  if (auth['github-copilot']?.access) {
    results.push({
      provider: 'copilot',
      models: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'o3-mini', 'gemini-2.0-flash'],
    });
  }

  // OpenRouter
  if (auth.openrouter?.key) {
    results.push({
      provider: 'openrouter',
      models: [
        'google/gemini-2.0-flash-001',
        'anthropic/claude-3.5-haiku-20241022',
        'openai/gpt-4o-mini',
        'meta-llama/llama-3.3-70b-instruct',
      ],
    });
  }

  // Ollama (try to reach)
  try {
    const resp = await fetch(`${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/tags`);
    if (resp.ok) {
      const data = (await resp.json()) as { models?: { name: string }[] };
      results.push({
        provider: 'ollama',
        models: (data.models || []).map((m) => m.name),
      });
    }
  } catch {
    // Ollama not running
  }

  return results;
}

// --- Helpers ---

function getDefaultProvider(): Provider {
  // Prefer copilot > openrouter > ollama
  if (cachedAuth?.['github-copilot']?.access) return 'copilot';
  if (cachedAuth?.openrouter?.key) return 'openrouter';
  return 'ollama';
}

// Pre-load auth on import
loadAuth().catch(() => {});
