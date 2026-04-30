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

    setStatus(`uploading: ${file.name}...`)

    const ext = file.name.split('.').pop()?.toLowerCase()
    const isBinary = ['pdf', 'docx', 'doc', 'xlsx', 'pptx'].includes(ext || '')

    let body: { filename: string; content: string; encoding?: string }

    if (isBinary) {
      // Read as base64 for binary files
      const buffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      body = { filename: file.name, content: base64, encoding: 'base64' }
    } else {
      // Plain text files
      const text = await file.text()
      body = { filename: file.name, content: text }
    }

    const res = await fetch('/api/sources/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setStatus(`✅ uploaded: ${file.name}`)
      fetchSources()
    } else {
      setStatus('❌ upload failed')
    }
  }

  const handleCompile = async () => {
    if (!selected) return
    setOutput('')
    setStatus(`compiling with ${provider}/${model}...`)

    // First extract text from the file server-side
    setOutput('Extracting text from file...\n')
    const extractRes = await fetch(`/api/sources/extract/${encodeURIComponent(selected)}`)
    if (!extractRes.ok) {
      setStatus('❌ text extraction failed')
      setOutput('Failed to extract text from file. Is it a supported format?')
      return
    }
    const { chars } = await extractRes.json() as { text: string; chars: number }
    setOutput(`Extracted ${chars} chars. Sending to ${provider}/${model}...\n\n`)

    // Now send to the LLM for wiki ingest
    const res = await fetch('/api/ollama/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: selected, model, provider }),
    })
    if (!res.ok || !res.body) {
      setStatus('❌ compile failed')
      setOutput(prev => prev + `\nError: ${res.status} ${res.statusText}`)
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = `Extracted ${chars} chars. Sending to ${provider}/${model}...\n\n`
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fullText += decoder.decode(value, { stream: true })
      setOutput(fullText)
    }
    setStatus('✅ compile complete')
    fetchSources()
  }

  return (
    <div className="ingest">
      <div className="panel-title">&gt; RAW SOURCES</div>
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
