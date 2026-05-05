import { useState, useRef, useEffect } from 'react'

interface ProviderModels {
  provider: string
  models: string[]
}

export default function QueryView() {
  const [question, setQuestion] = useState('')
  const [providers, setProviders] = useState<ProviderModels[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [output, setOutput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/models')
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
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const currentModels = providers.find(p => p.provider === provider)?.models || []

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const models = providers.find(p => p.provider === newProvider)?.models || []
    setModel(models[0] || '')
  }

  const handleQuery = async () => {
    if (!question.trim()) return
    setOutput('')
    const q = question.trim()
    setHistory(h => [...h, q])
    setQuestion('')
    const res = await fetch('/api/agent/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, model, provider }),
    })
    if (!res.ok || !res.body) {
      setOutput('query failed')
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
  }

  return (
    <div className="query">
      <div className="query-output" ref={outputRef}>
        {history.map((q, i) => (
          <div key={i} className="query-turn">
            <div className="query-q">&gt; {q}</div>
            {i === history.length - 1 && output && (
              <div className="query-a">{output}</div>
            )}
            {i < history.length - 1 && (
              <div className="query-a">(see above)</div>
            )}
          </div>
        ))}
        {history.length === 0 && (
          <div className="empty">ask a question to query the wiki</div>
        )}
      </div>
      <div className="command-bar">
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
        <input
          className="command-input"
          type="text"
          placeholder="ask the wiki..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleQuery()}
        />
        <button className="btn" onClick={handleQuery}>→</button>
      </div>
    </div>
  )
}
