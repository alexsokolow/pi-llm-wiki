# LLM Wiki MVP Implementation Plan

> **REQUIRED SUB-SKILL:** Use subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** Complete the first working prototype of the LLM Wiki — retro-styled React frontend, Express API, local Ollama integration, and agent config documentation.

**Architecture:** Single Node.js process: Express API routes + Vite dev middleware for React SPA. Ollama on `localhost:11434`. Wiki data in git-tracked `wiki/` directory.

**Tech Stack:** TypeScript, React 19, Express 5, Vite, react-markdown, Ollama HTTP API

---

### Task 1: Write Retro CSS

**Goal:** Retro terminal aesthetic with VT323 pixel font, CRT scanlines, blocky borders, amber/cyan palette, blinking cursor.

**Files:**
- Create: `src/styles/retro.css`

**Step 1: Write CSS**

Use these design tokens:
- Font: `'VT323', monospace`
- Background: `#0d1117`, Text: `#c9d1d9`
- Amber: `#ff9d00`, Cyan: `#00ffcc`, Red: `#ff4444`, Green: `#3fb950`
- Blocky borders everywhere: `2px solid currentColor`
- `.scanlines`: fixed overlay with repeating `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px)`
- `.cursor`: `animation: blink 1s step-end infinite`
- Layout: `.terminal` = `min-h-screen flex flex-col`
- `.browser` = `flex` row with `.file-tree` and `.preview-pane`
- `.command-bar` = fixed bottom bar with input + button
- Buttons/nav: uppercase, pixel font, hover inverts bg/text
- `.wiki-link`: cyan color, no underline, button appearance

**Step 2: Verify**
Run `npm run dev`, open `http://localhost:3000`. Dark theme with pixel font visible.

**Step 3: Commit**
`git add src/styles/retro.css && git commit -m "feat: add retro terminal CSS"`

---

### Task 2: Fix Dev Server Wiring

**Goal:** Express + Vite combo boots cleanly, API routes work, frontend builds.

**Files:**
- Modify: `server/index.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json` (add `"baseUrl": ".", "paths": { "@/*": ["src/*"] }` if needed)

**Step 1: Fix vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, '.'),
})
```

**Step 2: Verify server/index.ts**

Must use `vite.middlewares` on the Express app. Should already be roughly correct.

**Step 3: Test boot**

Run: `npm run dev`
Expected: Server starts on port 3000, no TypeScript errors in console.
Test: `curl http://localhost:3000/api/wiki/pages`
Expected: `{"pages":[]}` (empty array since no pages yet)

**Step 4: Commit**
```bash
git add server/index.ts vite.config.ts tsconfig.json
git commit -m "fix: server and vite dev wiring"
```

---

### Task 3: Fix Frontend TypeScript Issues

**Goal:** All `.tsx` files compile without TS errors.

**Files:**
- Modify: `src/pages/IngestView.tsx` — check `useRef<HTMLInputElement>(null)` typing
- Modify: `src/components/MarkdownViewer.tsx` — verify `node` param type usage is correct
- Modify: `src/App.tsx` — ensure no issues

**Step 1: Run type check**
```bash
npx tsc --noEmit
```
Expected: Zero errors. If errors, fix them.

**Step 2: Commit**
```bash
git add src/
git commit -m "fix: resolve TypeScript errors in frontend"
```

---

### Task 4: Add Lint Workflow Endpoint

**Goal:** Give the LLM a way to health-check the wiki for orphans, contradictions, stale claims.

**Files:**
- Modify: `server/routes/ollama.ts` — add `POST /api/ollama/lint`
- Modify: `AGENTS.md` — document lint workflow

**Step 1: Add lint endpoint**

Add to `server/routes/ollama.ts`:
```typescript
router.post('/lint', async (req, res) => {
  try {
    const { model = DEFAULT_MODEL } = req.body;
    const schema = await loadSchema();
    const pages = await wikiFs.listPages();
    const snippets = await Promise.all(
      pages.slice(0, 20).map(async p => ({
        path: p,
        content: await wikiFs.readPage(p).catch(() => '')
      }))
    );

    const prompt = `Review these wiki pages for issues:
${snippets.map(s => `--- ${s.path} ---\n${s.content.slice(0, 500)}`).join('\n\n')}

Identify: orphan pages, contradictions, stale claims, missing cross-references, missing pages.
Output markdown with findings and suggested fixes.`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    for await (const chunk of ollamaGenerate({ model, system: schema, prompt, stream: true })) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

**Step 2: Add lint section to AGENTS.md**

Append:
```markdown
## Lint Workflow

When health-checking the wiki, look for:
- Orphan pages with no inbound links
- Contradictions between pages
- Stale claims superseded by newer sources
- Important concepts mentioned but lacking their own page
- Missing cross-references

Output findings as markdown with suggested fixes.
```

**Step 3: Test**
```bash
curl -X POST http://localhost:3000/api/ollama/lint \
  -H "Content-Type: application/json" \
  -d '{"model":"gemma4"}'
```
Expected: Streamed markdown response with lint findings.

**Step 4: Commit**
```bash
git add server/routes/ollama.ts AGENTS.md
git commit -m "feat: add lint workflow endpoint"
```

---

### Task 5: Add Agent.md for Pi Workflow

**Goal:** Document that this agent must use superpowers/skills workflow for complex tasks.

**Files:**
- Create: `Agent.md`

**Step 1: Write Agent.md**

```markdown
# Agent Configuration for Pi

When working on this codebase, the agent MUST use the superpowers skills workflow:

1. **Brainstorming** (`/skill:brainstorming`) — Explore requirements and approaches before implementation.
2. **Writing Plans** (`/skill:writing-plans`) — Draft implementation plans with bite-sized tasks before coding.
3. **Test-Driven Development** (`/skill:test-driven-development`) — Write tests before implementation.
4. **Verification Before Completion** (`/skill:verification-before-completion`) — Verify before claiming done.
5. **Requesting/Receiving Code Review** (`/skill:requesting-code-review`, `/skill:receiving-code-review`) — Review all non-trivial changes.
6. **Finishing Development** (`/skill:finishing-a-development-branch`) — Properly close branches.

Always prefer structured skill-driven workflow over ad-hoc implementation for any multi-step task.
```

**Step 2: Commit**
```bash
git add Agent.md
git commit -m "docs: add Agent.md with pi workflow requirements"
```

---

### Final Verification

```bash
npm run dev
curl http://localhost:3000/api/wiki/pages
curl http://localhost:3000/api/wiki/index
curl http://localhost:3000/api/ollama/models
```

All should return valid JSON (or empty array for pages). Frontend should render at `http://localhost:3000`.
