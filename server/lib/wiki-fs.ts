import fs from 'fs/promises';
import path from 'path';

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

export async function resetWiki(): Promise<void> {
  // Clear all pages
  const categories = ['sources', 'entities', 'concepts', 'syntheses'];
  for (const cat of categories) {
    const dir = path.join(PAGES_ROOT, cat);
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
    } catch {
      // directory might not exist
    }
  }

  // Reset index.md
  await fs.writeFile(path.join(WIKI_ROOT, 'index.md'),
`# Wiki Index

## Sources
_(none yet)_

## Entities
_(none yet)_

## Concepts
_(none yet)_

## Syntheses
_(none yet)_
`, 'utf-8');

  // Reset log.md
  await fs.writeFile(path.join(WIKI_ROOT, 'log.md'),
`# Wiki Log

Chronological record of all operations.
`, 'utf-8');

  // Clear search index database (so QMD doesn't keep phantom search entries)
  try {
    await execAsync('npx qmd update --prune', { cwd: process.cwd() });
  } catch {
    // Ignore errors
  }
}

function validatePath(fullPath: string): void {
  const resolved = path.resolve(fullPath);
  const allowed = path.resolve(WIKI_ROOT);
  if (!resolved.startsWith(allowed)) {
    throw new Error(`Invalid path: ${fullPath}`);
  }
}
