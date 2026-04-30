import { Router } from 'express';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const results = await wikiFs.searchWiki(q);
    res.json({ query: q, results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
