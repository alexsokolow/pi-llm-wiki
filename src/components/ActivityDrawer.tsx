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
