import { Router } from 'express';
import { AuthStorage } from '@mariozechner/pi-coding-agent';
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

const router = Router();

const AUTH_PATH = path.resolve('wiki/.auth.json');
const MODELS_PATH = path.resolve('wiki/.models.json');

// Supported providers (trimmed list)
const APIKEY_PROVIDERS = ['anthropic', 'openai', 'openrouter'];

function getAuthStorage() {
  return AuthStorage.create(AUTH_PATH);
}

async function loadModelsJson(): Promise<any> {
  try {
    return JSON.parse(await readFile(MODELS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

async function saveModelsJson(data: any): Promise<void> {
  await writeFile(MODELS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── GET /api/auth/status ────────────────────────────────────────────────────

router.get('/status', async (_req, res) => {
  try {
    const auth = getAuthStorage();
    const oauthProviders = auth.getOAuthProviders();
    const modelsJson = await loadModelsJson();

    const providers: any[] = [];

    // OAuth providers (only github-copilot)
    for (const p of oauthProviders) {
      if (p.id !== 'github-copilot') continue;
      const status = auth.getAuthStatus(p.id);
      providers.push({
        id: p.id,
        name: p.name,
        type: 'oauth',
        authenticated: status.hasCredentials,
      });
    }

    // API key providers
    for (const id of APIKEY_PROVIDERS) {
      const status = auth.getAuthStatus(id);
      providers.push({
        id,
        name: id,
        type: 'apikey',
        authenticated: status.hasCredentials,
      });
    }

    // Ollama (special: uses models.json, not auth.json)
    const ollamaConfigured = !!(modelsJson?.providers?.ollama);
    providers.push({
      id: 'ollama',
      name: 'ollama (local)',
      type: 'ollama',
      authenticated: ollamaConfigured,
      baseUrl: modelsJson?.providers?.ollama?.baseUrl || 'http://127.0.0.1:11434/v1',
    });

    res.json({ providers });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/auth/apikey ───────────────────────────────────────────────────

router.post('/apikey', async (req, res) => {
  try {
    const { provider, key } = req.body;
    if (!provider || !key) {
      res.status(400).json({ error: 'provider and key required' });
      return;
    }

    const auth = getAuthStorage();
    auth.set(provider, { type: 'api_key', key });
    console.log(`  🔑 API key saved for provider: ${provider}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/auth/ollama ───────────────────────────────────────────────────

router.post('/ollama', async (req, res) => {
  try {
    const { baseUrl, models } = req.body;
    const url = baseUrl || 'http://127.0.0.1:11434/v1';

    const modelsJson = await loadModelsJson();
    if (!modelsJson.providers) modelsJson.providers = {};

    modelsJson.providers.ollama = {
      api: 'openai-completions',
      apiKey: 'ollama',
      baseUrl: url,
      models: (models || []).map((m: any) => ({
        id: m.id || m,
        contextWindow: m.contextWindow || 131072,
        input: ['text'],
        reasoning: m.reasoning || false,
      })),
    };

    await saveModelsJson(modelsJson);
    console.log(`  🧠 Ollama configured: ${url} (${(models || []).length} models)`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /api/auth/ollama/models ─ fetch available models from Ollama server ──

router.get('/ollama/models', async (req, res) => {
  try {
    const modelsJson = await loadModelsJson();
    const baseUrl = modelsJson?.providers?.ollama?.baseUrl || 'http://127.0.0.1:11434';
    // Ollama API: GET /api/tags
    const ollamaUrl = baseUrl.replace(/\/v1\/?$/, '');
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      res.status(502).json({ error: `Ollama not reachable at ${ollamaUrl}` });
      return;
    }
    const data = await response.json() as any;
    const models = (data.models || []).map((m: any) => ({
      id: m.name || m.model,
      size: m.size,
      parameterSize: m.details?.parameter_size,
    }));
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: `Cannot reach Ollama: ${err}` });
  }
});

// ─── GET /api/auth/oauth/login/:provider — SSE stream for OAuth flow ─────────

router.get('/oauth/login/:provider', async (req, res) => {
  const { provider } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const auth = getAuthStorage();

    send({ type: 'status', message: 'Starting OAuth login...' });

    await auth.login(provider, {
      onAuth: (info) => {
        console.log(`  🔐 [${provider}] Open: ${info.url}`);
        if (info.instructions) {
          console.log(`  🔐 [${provider}] ${info.instructions}`);
        }
        send({
          type: 'auth',
          url: info.url,
          instructions: info.instructions || '',
        });
      },
      onPrompt: async (prompt) => {
        // The prompt.message contains the device code or instructions
        console.log(`  🔐 [${provider}] ${prompt.message}`);
        send({
          type: 'prompt',
          message: prompt.message,
          placeholder: prompt.placeholder || '',
        });
        // For device flows, we don't need user input back — just display the code
        // The SDK handles the polling internally
        return '';
      },
      onProgress: (message) => {
        console.log(`  🔐 [${provider}] ${message}`);
        send({ type: 'progress', message });
      },
      onManualCodeInput: async () => {
        // Not needed for SSE-based flow
        return '';
      },
    });

    console.log(`  ✅ OAuth login complete for: ${provider}`);
    send({ type: 'complete' });
  } catch (err) {
    console.error(`  ❌ OAuth login failed for ${provider}:`, err);
    send({ type: 'error', message: String(err) });
  }

  res.end();
});

// ─── DELETE /api/auth/:provider ──────────────────────────────────────────────

router.delete('/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const auth = getAuthStorage();
    auth.logout(provider);
    console.log(`  🗑️  Logged out from: ${provider}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
