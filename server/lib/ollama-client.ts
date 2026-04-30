const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

export interface OllamaGenerateOpts {
  model: string;
  system?: string;
  prompt: string;
  stream?: boolean;
  options?: Record<string, unknown>;
}

export async function* ollamaGenerate(opts: OllamaGenerateOpts): AsyncGenerator<string, void, unknown> {
  const resp = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      system: opts.system,
      prompt: opts.prompt,
      stream: opts.stream !== false,
      options: opts.options,
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
          // skip malformed line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function listOllamaModels(): Promise<string[]> {
  const resp = await fetch(`${OLLAMA_HOST}/api/tags`);
  if (!resp.ok) return [];
  const data = await resp.json() as { models?: Array<{ name: string }> };
  return (data.models || []).map(m => m.name);
}
