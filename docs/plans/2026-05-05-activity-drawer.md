# Agent Activity Drawer — Implementation Plan

> **REQUIRED SUB-SKILL:** Use `/skill:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Add a collapsible bottom drawer that streams agent activity (tool calls, results, timing) in real-time during ingest/query operations.

**Architecture:** Frontend captures SSE events from agent routes, renders them in a shared ActivityDrawer component. The drawer persists across operations with timestamped separators. Backend already emits events — frontend just needs to consume and display them.

**Tech Stack:** React, TypeScript, existing CSS system

---

### Task 1: Create ActivityDrawer component

**Files:**
- Create: `src/components/ActivityDrawer.tsx`

**Step 1: Write the component**

```tsx
import { useEffect, useRef, useState } from 'react'

export interface LogEntry {
  id: string
  type: 'separator' | 'tool_start' | 'tool_end' | 'text' | 'done' | 'error'
  timestamp: number
  tool?: string
  preview?: string
  duration?: number
  error?: boolean
}

interface Props {
  entries: LogEntry[]
}

export default function ActivityDrawer({ entries }: Props) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-expand when new entries arrive
  useEffect(() => {
    if (entries.length > 0) {
      const last = entries[entries.length - 1]
      if (last.type === 'separator' || last.type === 'tool_start') {
        setExpanded(true)
      }
    }
  }, [entries])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, expanded])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className={`activity-drawer ${expanded ? 'expanded' : 'collapsed'}`}>
      <button
        className="activity-drawer-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▼' : '▲'} agent activity
        {!expanded && entries.length > 0 && (
          <span className="activity-count">{entries.length}</span>
        )}
      </button>
      {expanded && (
        <div className="activity-drawer-content" ref={scrollRef}>
          {entries.map(entry => (
            <div key={entry.id} className={`activity-entry activity-${entry.type}`}>
              {entry.type === 'separator' && (
                <div className="activity-separator">
                  ── {entry.preview} ({formatTime(entry.timestamp)}) ──
                </div>
              )}
              {entry.type === 'tool_start' && (
                <div className="activity-tool">
                  ⚡ {entry.tool}
                </div>
              )}
              {entry.type === 'tool_end' && (
                <div className="activity-tool">
                  {entry.error ? '❌' : '✅'} {entry.tool}
                  {entry.preview && (
                    <div className="activity-preview">→ {entry.preview}</div>
                  )}
                </div>
              )}
              {entry.type === 'done' && (
                <div className="activity-done">
                  ✅ done{entry.duration ? ` (${(entry.duration / 1000).toFixed(1)}s)` : ''}
                </div>
              )}
              {entry.type === 'error' && (
                <div className="activity-error">
                  ❌ {entry.preview || 'error'}
                </div>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <div className="activity-empty">no activity yet</div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/ActivityDrawer.tsx
git commit -m "feat: add ActivityDrawer component for agent activity logging"
```

---

### Task 2: Add ActivityDrawer CSS styles

**Files:**
- Modify: `src/styles/retro.css` — append drawer styles

**Step 1: Append styles**

```css
/* --- Activity Drawer --- */
.activity-drawer {
  border-top: 1px solid #30363d;
  background: #161b22;
  flex-shrink: 0;
  transition: height 0.2s ease;
}

.activity-drawer.collapsed {
  height: 32px;
}

.activity-drawer.expanded {
  height: 200px;
  display: flex;
  flex-direction: column;
}

.activity-drawer-toggle {
  font-family: 'VT323', monospace;
  font-size: 0.9rem;
  background: transparent;
  color: #484f58;
  border: none;
  padding: 0.4rem 1rem;
  cursor: pointer;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.activity-drawer-toggle:hover {
  color: #8b949e;
}

.activity-count {
  background: #30363d;
  color: #8b949e;
  padding: 0 0.4rem;
  font-size: 0.8rem;
}

.activity-drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1rem;
  font-family: 'VT323', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
}

.activity-separator {
  color: #484f58;
  margin: 0.75rem 0 0.25rem;
  font-size: 0.85rem;
}

.activity-tool {
  color: #8b949e;
}

.activity-preview {
  color: #484f58;
  padding-left: 1.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.activity-done {
  color: #3fb950;
}

.activity-error {
  color: #f47067;
}

.activity-empty {
  color: #484f58;
  font-style: italic;
}
```

**Step 2: Commit**

```bash
git add src/styles/retro.css
git commit -m "feat: add ActivityDrawer CSS styles"
```

---

### Task 3: Create useAgentStream hook

**Files:**
- Create: `src/hooks/useAgentStream.ts`

**Step 1: Write the hook**

A reusable hook that POSTs to an agent endpoint, reads the SSE stream, and emits log entries + text output.

```typescript
import { useState, useCallback, useRef } from 'react'
import type { LogEntry } from '../components/ActivityDrawer'

let entryId = 0
function nextId() { return `log-${++entryId}` }

interface UseAgentStreamResult {
  output: string
  isRunning: boolean
  run: (url: string, body: object, label: string) => Promise<string>
  entries: LogEntry[]
  addSeparator: (label: string) => void
}

export function useAgentStream(): UseAgentStreamResult {
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const startTime = useRef(0)

  const addEntry = useCallback((entry: LogEntry) => {
    setEntries(prev => [...prev, entry])
  }, [])

  const addSeparator = useCallback((label: string) => {
    addEntry({ id: nextId(), type: 'separator', timestamp: Date.now(), preview: label })
  }, [addEntry])

  const run = useCallback(async (url: string, body: object, label: string): Promise<string> => {
    setOutput('')
    setIsRunning(true)
    startTime.current = Date.now()

    addEntry({ id: nextId(), type: 'separator', timestamp: Date.now(), preview: label })

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok || !res.body) {
        addEntry({ id: nextId(), type: 'error', timestamp: Date.now(), preview: `HTTP ${res.status}` })
        setIsRunning(false)
        return ''
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      let currentTool = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        // Try to parse SSE events
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'tool_start') {
                currentTool = event.tool
                addEntry({ id: nextId(), type: 'tool_start', timestamp: Date.now(), tool: event.tool })
              } else if (event.type === 'tool_end') {
                addEntry({ id: nextId(), type: 'tool_end', timestamp: Date.now(), tool: event.tool || currentTool, preview: event.preview, error: event.error })
              } else if (event.type === 'text') {
                text += event.content
                setOutput(text)
              } else if (event.type === 'done') {
                // handled below
              }
            } catch {
              // Not JSON SSE — treat as plain text stream
              text += line.slice(6)
              setOutput(text)
            }
          } else if (line && !line.startsWith(':')) {
            // Plain text (non-SSE)
            text += chunk
            setOutput(text)
            break
          }
        }
      }

      const duration = Date.now() - startTime.current
      addEntry({ id: nextId(), type: 'done', timestamp: Date.now(), duration })
      setIsRunning(false)
      return text
    } catch (err) {
      addEntry({ id: nextId(), type: 'error', timestamp: Date.now(), preview: String(err) })
      setIsRunning(false)
      return ''
    }
  }, [addEntry])

  return { output, isRunning, run, entries, addSeparator }
}
```

**Step 2: Commit**

```bash
git add src/hooks/useAgentStream.ts
git commit -m "feat: add useAgentStream hook for SSE consumption + logging"
```

---

### Task 4: Wire ActivityDrawer into App layout

**Files:**
- Modify: `src/App.tsx` — add shared state and drawer component
- Modify: `src/components/TerminalLayout.tsx` — add drawer slot

**Step 1: Update TerminalLayout to accept drawer prop**

Add a `drawer` prop to TerminalLayout that renders before the footer:

```tsx
interface Props {
  header: string
  nav: ReactNode
  children: ReactNode
  drawer?: ReactNode
}

export default function TerminalLayout({ header, nav, children, drawer }: Props) {
  return (
    <div className="terminal">
      <header className="terminal-header">
        <span className="prompt">&gt;</span> {header}
      </header>
      {nav}
      <main className="terminal-main">{children}</main>
      {drawer}
      <footer className="terminal-footer">
        <span className="cursor">█</span> pi-powered wiki
      </footer>
    </div>
  )
}
```

**Step 2: Update App.tsx**

Import ActivityDrawer and useAgentStream. Create shared state at the App level. Pass the hook's entries to ActivityDrawer. Pass the hook's `run` function down to IngestView and QueryView via props or context.

For simplicity, use a context:

Create `src/AgentContext.tsx`:
```tsx
import { createContext, useContext } from 'react'
import type { UseAgentStreamResult } from './hooks/useAgentStream'

export const AgentContext = createContext<UseAgentStreamResult | null>(null)
export function useAgent() {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgent must be inside AgentContext')
  return ctx
}
```

In App.tsx:
```tsx
import { useAgentStream } from './hooks/useAgentStream'
import { AgentContext } from './AgentContext'
import ActivityDrawer from './components/ActivityDrawer'

// Inside App component:
const agent = useAgentStream()

// Wrap children in AgentContext.Provider
// Pass <ActivityDrawer entries={agent.entries} /> as drawer prop
```

**Step 3: Commit**

```bash
git add src/App.tsx src/components/TerminalLayout.tsx src/AgentContext.tsx src/hooks/useAgentStream.ts
git commit -m "feat: wire ActivityDrawer into app layout with AgentContext"
```

---

### Task 5: Update IngestView and QueryView to use AgentContext

**Files:**
- Modify: `src/pages/IngestView.tsx` — use `useAgent()` hook instead of raw fetch
- Modify: `src/pages/QueryView.tsx` — use `useAgent()` hook instead of raw fetch

**Step 1: Update IngestView**

Replace the manual fetch/stream logic with:
```tsx
const { run, isRunning, output } = useAgent()

const handleCompile = async () => {
  if (!selected || isRunning) return
  setStatus('agent processing...')
  await run('/api/agent/ingest', { filename: selected }, `ingest: ${selected}`)
  setStatus('✅ ingest complete')
  fetchSources()
}
```

**Step 2: Update QueryView**

Replace the manual fetch/stream logic with:
```tsx
const { run, isRunning, output } = useAgent()

const handleQuery = async () => {
  if (!question.trim() || isRunning) return
  const q = question.trim()
  setQuestion('')
  const answer = await run('/api/agent/query', { question: q }, `query: "${q}"`)
  setHistory(h => [...h, { q, a: answer }])
}
```

**Step 3: Commit**

```bash
git add src/pages/IngestView.tsx src/pages/QueryView.tsx
git commit -m "feat: IngestView and QueryView use AgentContext for activity logging"
```

---

### Task 6: TypeScript verification + final test

**Step 1: Run type check**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

**Step 2: Boot server**

```bash
npm run dev
```

Expected: Boots cleanly on port 3000.

**Step 3: Visual check**

- Open http://localhost:3000
- Bottom drawer shows "▲ agent activity"
- Click to expand — shows "no activity yet"
- Run a query — drawer auto-expands, shows tool calls
- Collapse drawer — stays collapsed until next operation

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: agent activity drawer complete — shows tool calls in real-time"
```

---

## Handoff

**Plan complete and saved. Two execution options:**

**1. Subagent-Driven (this session)** — dispatch fresh subagent per task

**2. Parallel Session** — open new session with `/skill:executing-plans`
