import { useState, useCallback, useRef } from 'react'
import type { LogEntry } from '../components/ActivityDrawer'

let entryId = 0
function nextId() { return `log-${++entryId}` }

export interface SessionStats {
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  cost?: number
  toolCalls?: number
  model?: string
  provider?: string
}

export interface UseAgentStreamResult {
  output: string
  isRunning: boolean
  run: (url: string, body: object, label: string) => Promise<string>
  entries: LogEntry[]
  stats: SessionStats | null
}

export function useAgentStream(): UseAgentStreamResult {
  const [output, setOutput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<SessionStats | null>(null)
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
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages
        const messages = buffer.split('\n\n')
        buffer = messages.pop() || '' // keep incomplete last chunk

        for (const msg of messages) {
          const line = msg.trim()
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          try {
            const event = JSON.parse(data)

            if (event.type === 'tool_start') {
              const argsStr = event.args ? ` ${event.args}` : ''
              addEntry({
                id: nextId(),
                type: 'tool_start',
                timestamp: Date.now(),
                tool: event.tool,
                preview: argsStr.slice(0, 150),
              })
            } else if (event.type === 'tool_end') {
              addEntry({
                id: nextId(),
                type: 'tool_end',
                timestamp: Date.now(),
                tool: event.tool,
                preview: event.result
                  ? `${event.duration} → ${event.result}`
                  : event.duration,
                error: event.error,
              })
            } else if (event.type === 'subagent_update') {
              // Sub-agent text content update — show in main output
              text += event.content
              setOutput(text)
            } else if (event.type === 'subagent_progress') {
              addEntry({
                id: nextId(),
                type: 'subagent_progress',
                timestamp: Date.now(),
                agent: event.agent,
                tool: event.tool,
                output: event.output,
              })
            } else if (event.type === 'text') {
              text += event.content
              setOutput(text)
            } else if (event.type === 'stats') {
              setStats({
                tokens: event.tokens,
                cost: event.cost,
                toolCalls: event.toolCalls,
                model: event.model,
                provider: event.provider,
              })
            } else if (event.type === 'done') {
              // handled below
            }
          } catch {
            // Not valid JSON — plain text fallback
            text += data
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

  return { output, isRunning, run, entries, stats }
}
