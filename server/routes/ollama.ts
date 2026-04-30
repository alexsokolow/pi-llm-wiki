import { Router } from 'express';
import { readFile } from 'fs/promises';
import path from 'path';
import { generate, listModels, type Provider } from '../lib/llm-client.js';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();

async function loadSchema(): Promise<string> {
  try {
    const { readFile } = await import('fs/promises');
    return readFile('AGENTS.md', 'utf-8');
  } catch {
    return '';
  }
}

router.get('/models', async (_req, res) => {
  try {
    const providers = await listModels();
    res.json({ providers });
  } catch {
    res.status(503).json({ error: 'Failed to list models' });
  }
});

router.post('/ingest', async (req, res) => {
  try {
    const { filename, model, provider } = req.body as {
      filename: string;
      model?: string;
      provider?: Provider;
    };

    // Extract text from the source file (handles .docx, .pdf, .txt)
    const ext = path.extname(filename).toLowerCase();
    const filePath = path.resolve('wiki/raw', filename);
    let sourceContent = '';

    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.default.extractRawText({ path: filePath });
      sourceContent = result.value;
    } else if (ext === '.pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);
      sourceContent = data.text;
    } else {
      sourceContent = await wikiFs.readSource(filename);
    }

    if (!sourceContent.trim()) {
      res.status(400).json({ error: 'Could not extract text from file' });
      return;
    }

    // Cap content to avoid overflowing LLM context
    if (sourceContent.length > 10000) {
      sourceContent = sourceContent.slice(0, 7000) + '\n\n[...middle content omitted...]\n\n' + sourceContent.slice(-3000);
    }

    const schema = await loadSchema();
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Source document: ${filename}

Content:
---
${sourceContent}
---

Process this according to the wiki schema. Output ONLY a JSON object with this exact shape:
{
  "sourcePage": { "path": "sources/<slug>.md", "content": "..." },
  "updates": [
    { "path": "entities/..." OR "concepts/..." OR "syntheses/...", "content": "..." }
  ],
  "indexSnippet": "markdown snippet to insert into index.md"
}

Rules:
- All content must be valid markdown with YAML frontmatter.
- Use [[Title]] cross-references.
- Frontmatter must include: title, date, tags, source_count, last_updated.
- The slug should be lowercase kebab-case from the filename.
`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    let fullResponse = '';
    for await (const chunk of generate({ provider, model, system: schema, prompt, stream: true })) {
      res.write(chunk);
      fullResponse += chunk;
    }

    // Try to parse and apply the result
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        if (result.sourcePage) {
          await wikiFs.writePage(result.sourcePage.path, result.sourcePage.content);
        }
        for (const upd of result.updates || []) {
          await wikiFs.writePage(upd.path, upd.content);
        }
        if (result.indexSnippet) {
          const index = await wikiFs.readWikiFile('index.md');
          await wikiFs.writeWikiFile('index.md', index + '\n' + result.indexSnippet);
        }
        const logEntry = `\n## [${today}] ingest | ${filename}\n\nProcessed by ${model || 'default'} (${provider || 'auto'}).\n`;
        const log = await wikiFs.readWikiFile('log.md');
        await wikiFs.writeWikiFile('log.md', log + logEntry);
      }
    } catch {
      // If LLM didn't return valid JSON, we still streamed the raw output
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/query', async (req, res) => {
  try {
    const { question, model, provider } = req.body as {
      question: string;
      model?: string;
      provider?: Provider;
    };
    const schema = await loadSchema();
    const searchResults = await wikiFs.searchWiki(question);
    const context = searchResults.map((r) => `--- ${r.path} ---\n${r.preview}`).join('\n\n');
    const indexContent = await wikiFs.readWikiFile('index.md').catch(() => '');

    const prompt = `Question: ${question}\n\nWiki index:\n${indexContent}\n\nRelevant pages found:\n${context || '(none)'}\n\nAnswer in markdown. Cite pages with [[Title]]. If you discover a new insight worth preserving, say: "WORTH FILING: <title>" at the end.`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of generate({ provider, model, system: schema, prompt, stream: true })) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/lint', async (req, res) => {
  try {
    const { model, provider } = req.body as { model?: string; provider?: Provider };
    const schema = await loadSchema();
    const pages = await wikiFs.listPages();
    const snippets = await Promise.all(
      pages.slice(0, 30).map(async (p) => ({
        path: p,
        content: await wikiFs.readPage(p).catch(() => ''),
      })),
    );

    const prompt = `Review these wiki pages for structural issues:
${snippets.map((s) => `--- ${s.path} ---\n${s.content.slice(0, 800)}`).join('\n\n')}

Identify:
- Orphan pages with no inbound [[links]]
- Contradictions between pages
- Stale claims superseded by newer sources
- Important concepts lacking their own page
- Missing cross-references
- Data gaps worth filling

Output a markdown report with findings and suggested fixes.`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of generate({ provider, model, system: schema, prompt, stream: true })) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
