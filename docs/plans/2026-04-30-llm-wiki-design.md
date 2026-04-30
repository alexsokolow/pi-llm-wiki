# LLM Wiki — Design Document

A local-first, retro-styled wiki maintained by LLMs, inspired by [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Architecture

Single Node.js repo. Express API + Vite-powered React frontend in one process during development. In production, Express serves pre-built static files.

```
llm-wiki/
├── server/                  # Express API
│   ├── index.ts            # Entry: mounts Vite middleware + API routes
│   ├── routes/
│   │   ├── wiki.ts         # CRUD for markdown pages
│   │   ├── sources.ts      # Raw source ingestion endpoints
│   │   ├── ollama.ts       # Proxy + orchestrate local LLM calls
│   │   └── search.ts       # Simple text search over wiki pages
│   ├── lib/
│   │   ├── wiki-fs.ts      # File I/O abstraction (reads/writes markdown)
│   │   ├── ollama-client.ts # Typed fetch wrapper for Ollama
│   │   └── ingest-engine.ts # Prompt construction + page generation
│   └── types.ts
├── src/                     # React frontend
│   ├── App.tsx
│   ├── pages/
│   │   ├── WikiBrowser.tsx  # Main view: file tree + markdown preview
│   │   ├── IngestView.tsx   # Drop/upload sources + trigger compiler
│   │   ├── QueryView.tsx    # Ask questions, see synthesized answers
│   │   └── ExploreView.tsx  # Graph/index view
│   ├── components/
│   │   ├── TerminalLayout.tsx # Retro chrome (header, nav, borders)
│   │   ├── MarkdownViewer.tsx # Rendered markdown with wiki-link support
│   │   └── PromptInput.tsx    # Honcho-style command bar
│   └── styles/
│       └── retro.css        # 8-bit palette, pixel fonts, scanlines
├── wiki/                    # Your actual wiki data (git-tracked)
│   ├── raw/                 # Immutable source documents
│   ├── pages/               # LLM-generated markdown
│   ├── index.md
│   └── log.md
├── AGENTS.md               # Schema / agent configuration
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Components & Data Flow

### Frontend — Retro Terminal Shell

The UI is wrapped in a `TerminalLayout` component: dark pixel font, amber/cyan accent colors, blocky borders, subtle scanline overlay.

- **WikiBrowser** — File tree sidebar + markdown preview pane. `MarkdownViewer` handles `[[Page Name]]` wiki-links as client-side navigation.
- **IngestView** — Drop zone for raw sources. "Compile" button triggers local LLM with progress log streaming.
- **QueryView** — Honcho-style command bar at bottom. LLM reads relevant pages, synthesizes answers with citations. "File to Wiki" persists answers as new pages.
- **ExploreView** — List/table from `index.md`, stats: page count, last ingest date, orphan pages.

### Data Flow — Ingest

1. User drops file → `POST /api/sources` → saved to `wiki/raw/`
2. Frontend hits `POST /api/ingest` with filename
3. Server reads source, builds ingest prompt (structured by schema), streams to Ollama
4. Ollama returns generated markdown → server writes to `wiki/pages/`, updates `index.md`, appends to `log.md`
5. Frontend refreshes file tree

### Data Flow — Query

1. User types question → `POST /api/query`
2. Server does simple text search over `wiki/pages/`
3. Relevant pages fed into Ollama as context → synthesized answer streamed back
4. Optional: user clicks "Save to Wiki" → new page written to `wiki/pages/`

## Ollama Integration & Ingest Engine

- Ollama HTTP at `localhost:11434`, `/api/generate` with `stream: true`
- **Ollama Client:** Thin typed wrapper, async generator for text chunks
- **Ingest Engine:** Builds structured prompts per `AGENTS.md`, single-source single-pass ingestion
- **Default model:** `gemma4`, configurable in `config.json`

## Schema & Agent Configuration

`AGENTS.md` lives in repo root, passed as system prompt on every Ollama call:

1. Directory conventions (`raw/`, `pages/entities/`, `pages/concepts/`, etc.)
2. Page templates with YAML frontmatter (`date`, `tags`, `source_count`, `last_updated`)
3. Linking rules (`[[Title]]` cross-references)
4. Contradiction handling (⚠️ blocks + `syntheses/` pages)
5. Workflows: Ingest, Query, Lint

Schema is co-evolved over time. The ingest engine reads `AGENTS.md` at startup.

## Retro 8-bit Styling

Custom `retro.css` driving the aesthetic:
- **Font:** Pixel/VT323 monospace body, proportional pixel headings
- **Palette:** `#0d1117` background, `#ff9d00` amber primary, `#00ffcc` cyan links, `#ff4444` red errors
- **Chrome:** Thick `border: 2px solid` panels, blocky dividers, ASCII-style headers, CRT scanline overlay
- **Animation:** Terminal cursor blink on command bar, typing effect for streamed responses
- **Icons:** None — `>` and `+` glyphs in pixel font

## Error Handling

- **Ollama offline:** Terminal-style error: `OLLAMA OFFLINE — run: ollama run gemma4`
- **Malformed LLM output:** Regex validation on file paths, reject out-of-bounds writes
- **File conflicts:** Timestamp suffixes for rare collisions
- **Orphaned pages:** Lint flow + warning badge in explore view

## MVP Exclusions

- No embedding-based search (grep/BM25 only)
- No PDF/image OCR (text + `.md` sources only)
- No user auth (localhost only)
- No collaborative editing

## References

- [Karpathy's LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [honcho.dev](https://honcho.dev/) — 8-bit aesthetic inspiration
- [pi.dev](https://pi.dev/) — minimalist terminal vibe
