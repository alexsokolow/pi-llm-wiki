import { useEffect, useRef, useState } from 'react'
import type { SessionStats } from '../hooks/useAgentStream'

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
  stats: SessionStats | null
}

export default function ActivityDrawer({ entries, stats }: Props) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (entries.length > 0) {
      const last = entries[entries.length - 1]
      if (last.type === 'separator' || last.type === 'tool_start') {
        setExpanded(true)
      }
    }
  }, [entries])

  useEffect(() => {
    if (scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, expanded])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
    return String(n)
  }

  return (
    <div className={`activity-drawer ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="activity-drawer-header">
        <button
          className="activity-drawer-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '▼' : '▲'} agent activity
          {!expanded && entries.length > 0 && (
            <span className="activity-count">{entries.length}</span>
          )}
        </button>
        {stats && (
          <div className="activity-stats-bar">
            <span>↑{formatTokens(stats.tokens?.input || 0)}</span>
            <span>↓{formatTokens(stats.tokens?.output || 0)}</span>
            {(stats.tokens?.cacheRead || 0) > 0 && <span>R{formatTokens(stats.tokens!.cacheRead)}</span>}
            {(stats.tokens?.cacheWrite || 0) > 0 && <span>W{formatTokens(stats.tokens!.cacheWrite)}</span>}
            {stats.cost != null && stats.cost > 0 && <span>${stats.cost.toFixed(3)}</span>}
            <span className="activity-stats-model">({stats.provider}) {stats.model}</span>
          </div>
        )}
      </div>
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
                <div className="activity-tool-call">
                  <div>
                    <span className="activity-icon">⚡</span>
                    <span className="activity-tool-name">{entry.tool}</span>
                  </div>
                  {entry.preview && (
                    <div className="activity-tool-args">{entry.preview}</div>
                  )}
                </div>
              )}
              {entry.type === 'tool_end' && (
                <div className="activity-tool-result">
                  <div>
                    <span className="activity-icon">{entry.error ? '❌' : '✅'}</span>
                    <span className="activity-tool-name">{entry.tool}</span>
                    <span style={{ opacity: 0.5, marginLeft: '0.5rem' }}>{entry.preview?.split(' → ')[0]}</span>
                  </div>
                  {entry.preview?.includes(' → ') && (
                    <div className="activity-tool-output">{entry.preview.split(' → ').slice(1).join(' → ')}</div>
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
