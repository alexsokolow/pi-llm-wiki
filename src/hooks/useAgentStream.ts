import { useState, useCallback, useRef } from 'react'
import type { LogEntry } from '../components/ActivityDrawer'

let entryId = 0
function nextId() { return `log-${++entryId}` }

export interface UseAgentStreamResult {
  output: string
  isRunning: boolean
  run: (url: string, body: object, label: string) => Promise<string>
  entries: LogEntry[]
}

export function useAgentStream(): UseAgentStreamResult {
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const startTime = useRef(0)

  const addEntry = useCallback((entry: LogEntry) => {
    setEntries(prev => [...prev, entry])
  }, [])

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        // Try to parse as SSE (data: {...}\n\n)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'tool_start') {
                addEntry({ id: nextId(), type: 'tool_start', timestamp: Date.now(), tool: event.tool })
              } else if (event.type === 'tool_end') {
                addEntry({ id: nextId(), type: 'tool_end', timestamp: Date.now(), tool: event.tool, preview: event.preview, error: event.error })
              } else if (event.type === 'thinking') {
                // Ignore thinking deltas — they flood the drawer
              } else if (event.type === 'text') {
                text += event.content
                setOutput(text)
              } else if (event.type === 'done') {
                // will be handled after loop
              }
            } catch {
              // Not valid JSON — treat as plain text
              text += line.slice(6)
              setOutput(text)
            }
          } else if (line.trim() && !line.startsWith(':')) {
            // Plain text streaming (non-SSE fallback)
            text += line
            setOutput(text)
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

  return { output, isRunning, run, entries }
}
