import { useEffect, useState } from 'react'

export default function ExploreView() {
  const [pages, setPages] = useState<string[]>([])
  const [indexContent, setIndexContent] = useState('')
  const [logContent, setLogContent] = useState('')

  useEffect(() => {
    fetch('/api/wiki/pages').then(r => r.json()).then(d => setPages(d.pages || []))
    fetch('/api/wiki/index').then(r => r.json()).then(d => setIndexContent(d.content || ''))
    fetch('/api/wiki/log').then(r => r.json()).then(d => setLogContent(d.content || ''))
  }, [])

  return (
    <div className="explore">
      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-num">{pages.length}</div>
          <div className="stat-label">total pages</div>
        </div>
      </div>
      <div className="explore-columns">
        <div className="explore-col">
          <div className="panel-title">&gt; INDEX</div>
          <pre className="explore-content">{indexContent}</pre>
        </div>
        <div className="explore-col">
          <div className="panel-title">&gt; LOG</div>
          <pre className="explore-content">{logContent}</pre>
        </div>
      </div>
    </div>
  )
}
