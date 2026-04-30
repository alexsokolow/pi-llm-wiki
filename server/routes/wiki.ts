import { Router } from 'express';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();

router.get('/pages', async (_req, res) => {
  try {
    const pages = await wikiFs.listPages();
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.use('/page', async (req, res) => {
  try {
    const relPath = req.url.replace(/^\/+/, '');
    const content = await wikiFs.readPage(relPath);
    res.json({ path: relPath, content });
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

router.get('/sources', async (_req, res) => {
  try {
    const sources = await wikiFs.listSources();
    res.json({ sources });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/source/:name', async (req, res) => {
  try {
    const content = await wikiFs.readSource(req.params.name);
    res.json({ name: req.params.name, content });
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

router.get('/index', async (_req, res) => {
  try {
    const content = await wikiFs.readWikiFile('index.md');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/log', async (_req, res) => {
  try {
    const content = await wikiFs.readWikiFile('log.md');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
