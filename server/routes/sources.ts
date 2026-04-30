import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();

router.post('/upload', async (req, res) => {
  try {
    const { filename, content, encoding } = req.body as {
      filename: string;
      content: string;
      encoding?: 'base64' | 'text';
    };
    if (!filename || !content) {
      res.status(400).json({ error: 'filename and content required' });
      return;
    }

    if (encoding === 'base64') {
      // Binary file — decode base64 and save raw bytes
      const buffer = Buffer.from(content, 'base64');
      await wikiFs.saveSourceBinary(filename, buffer);
    } else {
      // Plain text file
      await wikiFs.saveSource(filename, content);
    }

    res.json({ success: true, filename });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/extract/:name', async (req, res) => {
  try {
    const filename = req.params.name;
    const ext = path.extname(filename).toLowerCase();
    const filePath = path.resolve('wiki/raw', filename);

    let text = '';

    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.default.extractRawText({ path: filePath });
      text = result.value;
    } else if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);
      text = data.text;
    } else {
      text = await readFile(filePath, 'utf-8');
    }

    res.json({ filename, text, chars: text.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
