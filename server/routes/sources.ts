import { Router } from 'express';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();

router.post('/upload', async (req, res) => {
  try {
    const { filename, content } = req.body as { filename: string; content: string };
    if (!filename || !content) {
      res.status(400).json({ error: 'filename and content required' });
      return;
    }
    await wikiFs.saveSource(filename, content);
    res.json({ success: true, filename });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
