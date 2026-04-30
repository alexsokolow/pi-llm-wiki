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
  const results: { path: string; preview: string }[] = [];
  const lowerQ = query.toLowerCase();
  for (const p of pages) {
    const content = await readPage(p).catch(() => '');
    if (content.toLowerCase().includes(lowerQ)) {
      const idx = content.toLowerCase().indexOf(lowerQ);
      const start = Math.max(0, idx - 80);
      const end = Math.min(content.length, idx + 200);
      results.push({ path: p, preview: content.slice(start, end).replace(/\n/g, ' ') });
    }
  }
  return results;
}

function validatePath(fullPath: string): void {
  const resolved = path.resolve(fullPath);
  const allowed = path.resolve(WIKI_ROOT);
  if (!resolved.startsWith(allowed)) {
    throw new Error(`Invalid path: ${fullPath}`);
  }
}
