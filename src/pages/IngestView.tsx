import { useState, useRef, useEffect } from 'react'

export default function IngestView() {
  const [sources, setSources] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [model, setModel] = useState('gemma4')
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [output, setOutput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    fetchSources()
    fetchModels()
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const fetchSources = () => {
    fetch('/api/wiki/sources')
      .then(r => r.json())
      .then(data => setSources(data.sources || []))
  }

  const fetchModels = () => {
    fetch('/api/ollama/models')
      .then(r => r.json())
      .then(data => setModels(data.models || []))
      .catch(() => setModels([]))
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const text = await file.text()
    const res = await fetch('/api/sources/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, content: text }),
    })
    if (res.ok) {
      setStatus(`uploaded: ${file.name}`)
      fetchSources()
    } else {
      setStatus('upload failed')
    }
  }

  const handleCompile = async () => {
    if (!selected) return
    setOutput('')
    setStatus('compiling...')
    const res = await fetch('/api/ollama/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selected, model }),
    })
    if (!res.ok || !res.body) {
      setStatus('compile failed')
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      setOutput(text)
    }
    setStatus('compile complete')
    fetchSources()
  }

  return (
    <div className="ingest">
      <div className="panel-title">&gt; RAW SOURCES</div>
      <div className="upload-row">
        <input ref={fileRef} type="file" className="file-input" />
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
          <select
            className="model-select"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            <option value="gemma4">gemma4</option>
            {models.filter(m => m !== 'gemma4').map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button className="btn compile-btn" onClick={handleCompile}>
            ⚡ COMPILE
          </button>
        </div>
      )}
      {status && <div className="status-line">&gt; {status}</div>}
      {output && (
        <pre ref={outputRef} className="output-stream">
          {output}
        </pre>
      )}
    </div>
  )
}
