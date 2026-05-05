# Skills-Based Wiki Agent — Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Replace custom wiki tools with skills. Reduce agent tool count from 12+ to 5 (read, bash, edit, write, document_parse). Wiki operations taught via skills instead.

**Architecture:** Remove all `defineTool()` wiki tools from pi-harness. Create two skill files that teach the agent conventions. The agent uses built-in file tools guided by skill instructions. Skills loaded into system prompt via `DefaultResourceLoader`.

**Tech Stack:** Pi SDK, TypeScript, markdown skills

---

### Task 1: Create document-extraction skill

**Files:**
- Create: `wiki/skills/document-extraction/SKILL.md`

**Step 1: Write the skill file**

```markdown
---
name: document-extraction
description: Extract text from PDF, DOCX, PPTX, images, spreadsheets using document_parse tool
---

# Document Extraction

Use `document_parse` to extract text from uploaded source files in `wiki/raw/`.

## When to use

- PDF, DOCX, PPTX, images, spreadsheets → use `document_parse`
- Plain text files (.md, .txt, .csv) → just use `read` directly, no parsing needed

## Usage

```
document_parse({ path: "wiki/raw/filename.pdf" })
```

## Options

- `ocr: "auto"` — enable OCR for scanned/image-based documents
- `ocrLanguage: "eng"` — ISO 639-3 language code for OCR
- `targetPages: "1-5"` — limit parsing to specific page range (PDF only)
- `format: "text"` — plain text output (default, preferred)
- `format: "json"` — structured output with bounding boxes (only when layout matters)

## Output

Returns extracted text content. For large documents, the output may be saved to a temporary file — use `read` on the returned path to access it.

## Tips

- Always use `format: "text"` unless you specifically need coordinates
- For very large documents (100+ pages), use `targetPages` to process in chunks
- The font warning "fetchStandardFontData: failed to fetch file" is harmless — text extraction still works
```

**Step 2: Commit**

```bash
git add wiki/skills/document-extraction/SKILL.md
git commit -m "feat: add document-extraction skill"
```

---

### Task 2: Create wiki-operations skill

**Files:**
- Create: `wiki/skills/wiki-operations/SKILL.md`

**Step 1: Write the skill file**

```markdown
---
name: wiki-operations
description: Conventions for creating, updating, and maintaining wiki pages using file tools
---

# Wiki Operations

All wiki operations use the built-in file tools: `write`, `read`, `edit`, `bash`.

## Directory Structure

```
wiki/
├── raw/           # Uploaded source documents (immutable)
├── index.md       # Page catalog (you maintain this)
├── log.md         # Chronological operation log (append-only)
├── AGENT.md       # Your instructions
└── pages/
    ├── sources/   # One page per ingested document
    ├── entities/  # People, orgs, equipment, systems, locations
    ├── concepts/  # Methods, standards, processes, frameworks
    └── syntheses/ # Cross-source analysis, comparisons
```

## Creating a Page

Use `write` with the full path:

```
write wiki/pages/concepts/transformer-architecture.md
```

Every page MUST start with YAML frontmatter:

```yaml
---
title: "Transformer Architecture"
date: "2026-05-05"
tags: ["deep-learning", "attention", "neural-networks"]
source_count: 1
last_updated: "2026-05-05"
---
```

## Naming

- Slugs: lowercase-kebab-case
- Examples: `entities/google-brain.md`, `concepts/multi-head-attention.md`

## Cross-References

Link between pages with `[[Page Title]]` notation:

```markdown
The [[Transformer Architecture]] uses [[Multi-Head Attention]] to...
```

## Listing Pages

```bash
find wiki/pages -name "*.md" | sort
```

## Searching Pages

```bash
grep -rl "search term" wiki/pages/
```

Or for context:
```bash
grep -rn "search term" wiki/pages/ | head -20
```

## Updating index.md

After creating pages, rewrite `wiki/index.md` with a full catalog:

```markdown
# Wiki Index

## Sources
- [[Attention Is All You Need]] — Foundational transformer paper (Vaswani et al., 2017)

## Entities
- [[Google Brain]] — AI research lab, co-authors of the transformer paper

## Concepts
- [[Transformer Architecture]] — Encoder-decoder model using self-attention
- [[Multi-Head Attention]] — Parallel attention mechanism

## Syntheses
_(none yet)_
```

Use `write wiki/index.md` to update it.

## Appending to log.md

After every operation, append to `wiki/log.md`:

```bash
echo "
## [2026-05-05] ingest | Document Title

Processed source. Created 8 pages: sources/doc.md, entities/foo.md, concepts/bar.md, ...
" >> wiki/log.md
```

Or use `edit` to append at the end of the file.

Format: `## [YYYY-MM-DD] operation | description`

Operations: `ingest`, `query`, `lint`

## Reading a Page

```
read wiki/pages/concepts/transformer-architecture.md
```

## Updating an Existing Page

Use `edit` for targeted changes (preserve existing content, add new info):

```
edit wiki/pages/entities/google-brain.md
```
```

**Step 2: Commit**

```bash
git add wiki/skills/wiki-operations/SKILL.md
git commit -m "feat: add wiki-operations skill"
```

---

### Task 3: Rewrite pi-harness.ts — remove all custom tools

**Files:**
- Modify: `server/lib/pi-harness.ts`

**Step 1: Remove all defineTool imports and definitions**

Remove:
- `import { Type } from '@sinclair/typebox'`
- `import { defineTool } from ...`
- All `const wikiReadTool = defineTool(...)` blocks (7 tools)
- The `customTools` parameter from `createAgentSession()`
- The wiki tool names from `toolNames` array

**Step 2: Keep only base tools**

```typescript
const toolNames: string[] = ['read', 'bash', 'edit', 'write'];
```

No `customTools` parameter needed. The `document_parse` tool comes from the pi-docparser extension (already loaded via `additionalExtensionPaths`).

**Step 3: Update allowedToolNames to include document_parse**

```typescript
toolNames.push('document_parse');
```

**Step 4: Load skills via DefaultResourceLoader**

Add the skills directory to the resource loader:

```typescript
const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir,
  additionalExtensionPaths: [docparserExtPath],
  skillsOverride: (current) => ({
    skills: [
      ...current.skills,
      {
        name: 'document-extraction',
        description: 'Extract text from PDF, DOCX, images using document_parse',
        filePath: path.resolve('wiki/skills/document-extraction/SKILL.md'),
        baseDir: path.resolve('wiki/skills/document-extraction'),
        source: 'project',
      },
      {
        name: 'wiki-operations',
        description: 'Conventions for wiki page creation, index, log, cross-references',
        filePath: path.resolve('wiki/skills/wiki-operations/SKILL.md'),
        baseDir: path.resolve('wiki/skills/wiki-operations'),
        source: 'project',
      },
    ],
    diagnostics: current.diagnostics,
  }),
  systemPromptOverride: () => systemPrompt,
});
```

**Step 5: Update system prompt to reference skills**

The system prompt (from `wiki/AGENT.md` + wiki index) should tell the agent that skills are available.

**Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add server/lib/pi-harness.ts
git commit -m "refactor: remove custom wiki tools, use skills instead (5 tools total)"
```

---

### Task 4: Update wiki/AGENT.md — reference skills instead of tools

**Files:**
- Modify: `wiki/AGENT.md`

**Step 1: Rewrite to reference skills**

The agent instructions should say "use the wiki-operations skill for page conventions" and "use the document-extraction skill for parsing files" instead of listing tool APIs.

**Step 2: Commit**

```bash
git add wiki/AGENT.md
git commit -m "refactor: AGENT.md references skills instead of custom tools"
```

---

### Task 5: Remove @sinclair/typebox dependency

**Files:**
- Modify: `package.json`

**Step 1: Uninstall**

```bash
npm uninstall @sinclair/typebox
```

(It was only used for `defineTool` parameter schemas which we no longer have.)

Note: Check if pi-docparser or pi-coding-agent depend on it — if so, it stays as a transitive dep.

**Step 2: Verify**

```bash
npx tsc --noEmit
npm run dev  # boots cleanly
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @sinclair/typebox (no longer used directly)"
```

---

### Task 6: Integration test

**Step 1: Boot server**

```bash
npm run dev
```

**Step 2: Verify tools**

Check server log shows: `🔧 [session] tools: read, bash, edit, write, document_parse`

(5 tools, down from 12+)

**Step 3: Test ingest via UI**

Upload PDF → Compile. Agent should:
1. Use `document_parse` to extract text
2. Use `write` to create wiki pages
3. Use `bash` or `edit` to update index.md and log.md

**Step 4: Commit final state**

```bash
git add -A
git commit -m "test: verified skills-based wiki agent works (5 tools)"
```
