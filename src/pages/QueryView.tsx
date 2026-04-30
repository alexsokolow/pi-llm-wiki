import { useState, useRef, useEffect } from 'react'

export default function QueryView() {
  const [question, setQuestion] = useState('')
  const [model, setModel] = useState('gemma4')
  const [models, setModels] = useState<string[]>([])
  const [output, setOutput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/ollama/models')
      .then(r => r.json())
      .then(data => setModels(data.models || []))
      .catch(() => setModels([]))
  }, [])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleQuery = async () => {
    if (!question.trim()) return
    setOutput('')
    const q = question.trim()
    setHistory(h => [...h, q])
    const res = await fetch('/api/ollama/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, model }),
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
          value={model}
          onChange={e => setModel(e.target.value)}
        >
          <option value="gemma4">gemma4</option>
          {models.filter(m => m !== 'gemma4').map(m => (
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
