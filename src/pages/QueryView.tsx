import { useState, useRef, useEffect } from 'react'
import { useAgent } from '../AgentContext'

export default function QueryView() {
  const { run, isRunning, output } = useAgent()
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<{ q: string; a: string }[]>([])
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, history])

  const handleQuery = async () => {
    if (!question.trim() || isRunning) return
    const q = question.trim()
    setQuestion('')
    const answer = await run('/api/agent/query', { question: q }, `query: "${q}"`)
    setHistory(h => [...h, { q, a: answer }])
  }

  return (
    <div className="query">
      <div className="query-output" ref={outputRef}>
        {history.map((turn, i) => (
          <div key={i} className="query-turn">
            <div className="query-q">&gt; {turn.q}</div>
            <div className="query-a">{turn.a}</div>
          </div>
        ))}
        {isRunning && output && (
          <div className="query-turn">
            <div className="query-q">&gt; {history.length > 0 ? '' : question}</div>
            <div className="query-a">{output}</div>
          </div>
        )}
        {history.length === 0 && !isRunning && (
          <div className="empty">ask a question to query the wiki</div>
        )}
      </div>
      <div className="command-bar">
        <input
          className="command-input"
          type="text"
          placeholder="ask the wiki..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleQuery()}
          disabled={isRunning}
        />
        <button className="btn" onClick={handleQuery} disabled={isRunning}>
          {isRunning ? '⏳' : '→'}
        </button>
      </div>
    </div>
  )
}
