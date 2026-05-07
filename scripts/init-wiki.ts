#!/usr/bin/env node
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'fs';

const dirs = [
  'wiki/raw',
  'wiki/pages/sources',
  'wiki/pages/entities',
  'wiki/pages/concepts',
  'wiki/pages/syntheses',
];

for (const dir of dirs) {
  mkdirSync(dir, { recursive: true });
}

// Clear QMD index (will be rebuilt on server start)
if (existsSync('wiki/db')) {
  rmSync('wiki/db', { recursive: true, force: true });
}
mkdirSync('wiki/db', { recursive: true });

const files: Record<string, string> = {
  'wiki/index.md': `# Wiki Index\n\n## Sources\n_(none yet)_\n\n## Entities\n_(none yet)_\n\n## Concepts\n_(none yet)_\n\n## Syntheses\n_(none yet)_\n`,
  'wiki/log.md': `# Wiki Log\n\nChronological record of all operations.\n`,
  'wiki/.config.json': JSON.stringify({
    defaultModel: '',
    defaultProvider: '',
    thinkingLevel: 'medium',
    plugins: { webSearch: false, codeSearch: false, subagents: false, fileSystem: true },
  }, null, 2),
  'wiki/.models.json': '{}',
  'wiki/.auth.json': '{}',
};

for (const [path, content] of Object.entries(files)) {
  if (!existsSync(path)) {
    writeFileSync(path, content, 'utf-8');
    console.log(`  created ${path}`);
  }
}

console.log('✅ Wiki initialized');
