import { Router } from 'express';
import { loadConfig, saveConfig } from '../lib/config.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req, res) => {
  try {
    await saveConfig(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
