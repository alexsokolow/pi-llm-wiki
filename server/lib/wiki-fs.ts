import fs from 'fs/promises';
import path from 'path';

const WIKI_ROOT = path.resolve('wiki');
const PAGES_ROOT = path.join(WIKI_ROOT, 'pages');

export async function listPages(): Promise<string[]> {
  const pages: string[] = [];
  await walkDir(PAGES_ROOT, '', pages);
  return pages.sort();
}

async function walkDir(dir: string, prefix: string, out: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(full, rel, out);
      } else if (entry.name.endsWith('.md')) {
        out.push(rel);
      }
    }
  } catch {
    // directory doesn't exist
  }
}

export async function readPage(relPath: string): Promise<string> {
  const full = path.join(PAGES_ROOT, relPath);
  validatePath(full);
  return fs.readFile(full, 'utf-8');
}

export async function writePage(relPath: string, content: string): Promise<void> {
  const full = path.join(PAGES_ROOT, relPath);
  validatePath(full);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
}

export async function listSources(): Promise<string[]> {
  const rawDir = path.join(WIKI_ROOT, 'raw');
  try {
    const entries = await fs.readdir(rawDir);
    return entries.filter(e => !e.startsWith('.')).sort();
  } catch {
    return [];
  }
}

export async function readSource(filename: string): Promise<string> {
  const full = path.join(WIKI_ROOT, 'raw', filename);
  validatePath(full);
  return fs.readFile(full, 'utf-8');
}

export async function saveSource(filename: string, content: string): Promise<void> {
  const full = path.join(WIKI_ROOT, 'raw', filename);
  validatePath(full);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
}

export async function saveSourceBinary(filename: string, buffer: Buffer): Promise<void> {
  const full = path.join(WIKI_ROOT, 'raw', filename);
  validatePath(full);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer);
}

export async function readWikiFile(relPath: string): Promise<string> {
  const full = path.join(WIKI_ROOT, relPath);
  validatePath(full);
  return fs.readFile(full, 'utf-8');
}

export async function writeWikiFile(relPath: string, content: string): Promise<void> {
  const full = path.join(WIKI_ROOT, relPath);
  validatePath(full);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
}

export async function searchWiki(query: string): Promise<{ path: string; preview: string }[]> {
  const pages = await listPages();
  const results: { path: string; preview: string; score: number }[] = [];

  // Tokenize query into meaningful search terms (3+ chars)
  const terms = query
    .toLowerCase()
    .split(/[\s,;.!?()\[\]{}]+/)
    .filter(t => t.length >= 2)
    .filter(t => !['the', 'is', 'a', 'an', 'of', 'in', 'on', 'to', 'for', 'and', 'or', 'what', 'where', 'how', 'which', 'that', 'this', 'are', 'was', 'were', 'can', 'do', 'does'].includes(t));

  if (terms.length === 0) return [];

  for (const p of pages) {
    const content = await readPage(p).catch(() => '');
    const lower = content.toLowerCase();

    // Score: how many terms appear in this page
    let score = 0;
    let bestIdx = -1;
    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx !== -1) {
        score++;
        // Count multiple occurrences for boosting
        const occurrences = lower.split(term).length - 1;
        score += Math.min(occurrences - 1, 3) * 0.5;
        if (bestIdx === -1) bestIdx = idx;
      }
    }

    if (score > 0) {
      // Return full content (capped) for high-scoring pages, preview for lower
      let preview: string;
      if (score >= 2 || content.length < 2000) {
        preview = content.slice(0, 3000);
      } else {
        const start = Math.max(0, bestIdx - 100);
        const end = Math.min(content.length, bestIdx + 500);
        preview = content.slice(start, end);
      }
      results.push({ path: p, preview, score });
    }
  }

  // Sort by score descending, return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ path: p, preview }) => ({ path: p, preview }));
}

function validatePath(fullPath: string): void {
  const resolved = path.resolve(fullPath);
  const allowed = path.resolve(WIKI_ROOT);
  if (!resolved.startsWith(allowed)) {
    throw new Error(`Invalid path: ${fullPath}`);
  }
}
