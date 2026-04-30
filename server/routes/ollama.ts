import { Router } from 'express';
import { ollamaGenerate, listOllamaModels } from '../lib/ollama-client.js';
import * as wikiFs from '../lib/wiki-fs.js';

const router = Router();
const DEFAULT_MODEL = 'gemma4';

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
    const models = await listOllamaModels();
    res.json({ models });
  } catch {
    res.status(503).json({ error: 'Ollama not reachable. Is it running?' });
  }
});

router.post('/ingest', async (req, res) => {
  try {
    const { filename, model = DEFAULT_MODEL } = req.body as { filename: string; model?: string };
    const sourceContent = await wikiFs.readSource(filename);
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
    for await (const chunk of ollamaGenerate({ model, system: schema, prompt, stream: true })) {
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
        const logEntry = `\n## [${today}] ingest | ${filename}\n\nProcessed by ${model}.\n`;
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
    const { question, model = DEFAULT_MODEL } = req.body as { question: string; model?: string };
    const schema = await loadSchema();
    const searchResults = await wikiFs.searchWiki(question);
    const context = searchResults.map(r => `--- ${r.path} ---\n${r.preview}`).join('\n\n');
    const indexContent = await wikiFs.readWikiFile('index.md').catch(() => '');

    const prompt = `Question: ${question}\n\nWiki index:\n${indexContent}\n\nRelevant pages found:\n${context || '(none)'}\n\nAnswer in markdown. Cite pages with [[Title]]. If you discover a new insight worth preserving, say: "WORTH FILING: <title>" at the end.`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of ollamaGenerate({ model, system: schema, prompt, stream: true })) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/lint', async (req, res) => {
  try {
    const { model = DEFAULT_MODEL } = req.body as { model?: string };
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

    for await (const chunk of ollamaGenerate({
      model,
      system: schema,
      prompt,
      stream: true,
    })) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
