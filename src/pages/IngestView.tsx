import { useState, useRef, useEffect } from 'react'
import type { UseAgentStreamResult } from '../hooks/useAgentStream'
import MarkdownViewer from '../components/MarkdownViewer'

interface Props {
  agent: UseAgentStreamResult
}

export default function IngestView({ agent }: Props) {
  const { run, isRunning, output } = agent
  const [sources, setSources] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchSources()
  }, [])

  const fetchSources = () => {
    fetch('/api/wiki/sources')
      .then(r => r.json())
      .then(data => setSources(data.sources || []))
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setStatus(`uploading: ${file.name}...`)
    const ext = file.name.split('.').pop()?.toLowerCase()
    const isBinary = ['pdf', 'docx', 'doc', 'xlsx', 'pptx'].includes(ext || '')

    let body: { filename: string; content: string; encoding?: string }
    if (isBinary) {
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      body = { filename: file.name, content: base64, encoding: 'base64' }
    } else {
      const text = await file.text()
      body = { filename: file.name, content: text }
    }

    const res = await fetch('/api/sources/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setStatus(res.ok ? `✅ uploaded: ${file.name}` : '❌ upload failed')
    fetchSources()
  }

  const handleCompile = async () => {
    if (!selected || isRunning) return
    setStatus('agent processing...')
    const result = await run('/api/agent/ingest', { filename: selected }, `ingest: ${selected}`)
    setStatus(result ? '✅ ingest complete' : '❌ ingest failed')
    fetchSources()
  }

  return (
    <div className="ingest">
      <div className="panel-title">&gt; INGEST SOURCES</div>
      <div className="upload-row">
        <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.csv" className="file-input" />
        <button className="btn" onClick={handleUpload}>+ UPLOAD</button>
      </div>
      <div className="source-list">
        {sources.length === 0 && <div className="empty">(no sources yet)</div>}
        {sources.map(s => (
          <button
            key={s}
            className={`source-item ${selected === s ? 'active' : ''}`}
            onClick={() => setSelected(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {selected && (
        <div className="compile-row">
          <button
            className="btn compile-btn"
            onClick={handleCompile}
            disabled={isRunning}
          >
            {isRunning ? '⏳ RUNNING...' : '⚡ COMPILE'}
          </button>
        </div>
      )}
      {status && <div className="status-line">&gt; {status}</div>}
      {output && (
        <div className="output-stream">
          <MarkdownViewer content={output} />
        </div>
      )}
    </div>
  )
}
