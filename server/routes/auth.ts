import { Router } from 'express';
import { AuthStorage } from '@mariozechner/pi-coding-agent';
import path from 'path';

const router = Router();

const AUTH_PATH = path.resolve('wiki/.auth.json');

function getAuthStorage() {
  return AuthStorage.create(AUTH_PATH);
}

// ─── GET /api/auth/status ────────────────────────────────────────────────────

router.get('/status', async (_req, res) => {
  try {
    const auth = getAuthStorage();
    const oauthProviders = auth.getOAuthProviders();

    // Known API-key providers
    const apiKeyProviders = ['anthropic', 'openai', 'openrouter', 'google', 'mistral', 'groq', 'deepseek', 'xai'];

    const providers: any[] = [];

    // OAuth providers
    for (const p of oauthProviders) {
      const status = auth.getAuthStatus(p.id);
      providers.push({
        id: p.id,
        name: p.name,
        type: 'oauth',
        authenticated: status.hasCredentials,
      });
    }

    // API key providers
    for (const id of apiKeyProviders) {
      const status = auth.getAuthStatus(id);
      providers.push({
        id,
        name: id,
        type: 'apikey',
        authenticated: status.hasCredentials,
      });
    }

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

// ─── POST /api/auth/oauth/start ──────────────────────────────────────────────

router.post('/oauth/start', async (req, res) => {
  try {
    const { provider } = req.body;
    if (!provider) {
      res.status(400).json({ error: 'provider required' });
      return;
    }

    const auth = getAuthStorage();
    let authUrl = '';
    let instructions = '';

    // Start OAuth login flow — non-blocking, we'll poll for completion
    const loginPromise = auth.login(provider, {
      onAuth: (info) => {
        authUrl = info.url;
        instructions = info.instructions || '';
      },
      onPrompt: async (prompt) => {
        // For device flows that need manual code input, we handle via polling
        return '';
      },
      onProgress: (message) => {
        console.log(`  🔐 [${provider}] ${message}`);
      },
    });

    // Wait briefly for onAuth to fire with the URL
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (authUrl) {
      // Store the login promise so we can poll for completion
      oauthPending.set(provider, loginPromise);
      res.json({ url: authUrl, instructions });
    } else {
      // If no URL after 2s, the login might have completed instantly or failed
      try {
        await loginPromise;
        res.json({ completed: true });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Track pending OAuth flows
const oauthPending = new Map<string, Promise<void>>();

// ─── GET /api/auth/oauth/poll/:provider ──────────────────────────────────────

router.get('/oauth/poll/:provider', async (req, res) => {
  const { provider } = req.params;
  const pending = oauthPending.get(provider);

  if (!pending) {
    // Check if already authenticated
    const auth = getAuthStorage();
    const status = auth.getAuthStatus(provider);
    if (status.hasCredentials) {
      res.json({ status: 'complete' });
    } else {
      res.json({ status: 'no_pending_flow' });
    }
    return;
  }

  try {
    await pending;
    oauthPending.delete(provider);
    console.log(`  ✅ OAuth login complete for: ${provider}`);
    res.json({ status: 'complete' });
  } catch (err) {
    oauthPending.delete(provider);
    res.json({ status: 'error', error: String(err) });
  }
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
