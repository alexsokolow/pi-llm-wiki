import { useState, useRef, useEffect } from 'react'

interface ProviderModels {
  provider: string
  models: string[]
}

export default function IngestView() {
  const [sources, setSources] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [providers, setProviders] = useState<ProviderModels[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
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
      .then(data => {
        const p = data.providers || []
        setProviders(p)
        if (p.length > 0) {
          setProvider(p[0].provider)
          setModel(p[0].models[0] || '')
        }
      })
      .catch(() => setProviders([]))
  }

  const currentModels = providers.find(p => p.provider === provider)?.models || []

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const models = providers.find(p => p.provider === newProvider)?.models || []
    setModel(models[0] || '')
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
    setStatus(`compiling with ${provider}/${model}...`)
    const res = await fetch('/api/ollama/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selected, model, provider }),
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
            value={provider}
            onChange={e => handleProviderChange(e.target.value)}
          >
            {providers.map(p => (
              <option key={p.provider} value={p.provider}>{p.provider}</option>
            ))}
          </select>
          <select
            className="model-select"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            {currentModels.map(m => (
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
