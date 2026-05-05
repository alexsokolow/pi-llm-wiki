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
