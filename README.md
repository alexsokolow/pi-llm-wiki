# LLM Wiki

A personal knowledge base powered by LLMs. Drop in documents, and the AI incrementally builds a structured, interlinked wiki — extracting entities, concepts, and cross-references automatically.

Inspired by [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Quick Start

```bash
git clone https://github.com/alexsokolow/pi-llm-wiki.git
cd pi-llm-wiki
npm install    # installs deps + initializes wiki/ skeleton
npm run dev
```

Open http://localhost:3000. Go to **Settings** → authenticate a provider (paste API key or OAuth login) → select a model → **Save**.

## How It Works

1. **Ingest** — Upload a PDF/DOCX/text file → the AI extracts content and creates structured wiki pages (source summaries, entity pages, concept pages) with cross-references.
2. **Query** — Ask questions → semantic search (via [qmd](https://github.com/tobi/qmd)) finds relevant pages → AI synthesizes an answer with citations.
3. **Browse** — Navigate the wiki pages, view the knowledge graph, check the index and log.

## Architecture

```
llm-wiki/
├── server/          # Express backend (Pi SDK + QMD)
├── src/             # React frontend (Vite)
├── wiki/            # Self-contained wiki data
│   ├── raw/         # Uploaded source documents (immutable)
│   ├── pages/       # LLM-generated markdown pages
│   ├── skills/      # Agent skill instructions
│   ├── db/          # QMD search index (auto-generated)
│   ├── AGENT.md     # Agent schema/instructions
│   ├── index.md     # Page catalog
│   └── log.md       # Operation log
├── .pi/             # Pi extension config
└── package.json
```

## Key Design Choices

- **Single agent, minimal tools** — 5 tools only: `read`, `bash`, `edit`, `write`, `document_parse`
- **Skills over code** — Wiki conventions taught via markdown skill files, not hardcoded
- **Local semantic search** — QMD runs fully on-device (BM25 + vector + reranking), no external API
- **Self-contained** — Own auth (`wiki/.auth.json`), own models config, no dependency on global Pi setup
- **Persistent query sessions** — Follow-up questions keep context (click "+ new" to reset)

## Supported Providers

| Provider | Auth Type |
|----------|-----------|
| GitHub Copilot | OAuth (device flow) |
| Anthropic | API key |
| OpenAI | API key |
| OpenRouter | API key |
| Ollama | Local URL + model detection |

## Scripts

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Build for production
npm run preview  # Preview production build
```

## Requirements

- Node.js 20+
- npm 9+
