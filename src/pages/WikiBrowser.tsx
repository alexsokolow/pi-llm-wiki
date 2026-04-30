import { useEffect, useState } from 'react'
import MarkdownViewer from '../components/MarkdownViewer'

interface PageInfo {
  path: string
  content: string
}

export default function WikiBrowser() {
  const [pages, setPages] = useState<string[]>([])
  const [current, setCurrent] = useState<PageInfo | null>(null)

  useEffect(() => {
    fetch('/api/wiki/pages')
      .then(r => r.json())
      .then(data => setPages(data.pages || []))
  }, [current])

  const loadPage = (path: string) => {
    fetch(`/api/wiki/page/${path}`)
      .then(r => r.json())
      .then(data => setCurrent({ path: data.path, content: data.content }))
  }

  return (
    <div className="browser">
      <aside className="file-tree">
        <div className="panel-title">&gt; INDEX</div>
        {pages.length === 0 && <div className="empty">(no pages yet)</div>}
        {pages.map(p => (
          <button
            key={p}
            className={`tree-item ${current?.path === p ? 'active' : ''}`}
            onClick={() => loadPage(p)}
          >
            {p}
          </button>
        ))}
      </aside>
      <section className="preview-pane">
        {current ? (
          <>
            <div className="panel-title">&gt; {current.path}</div>
            <div className="markdown-body">
              <MarkdownViewer
                content={current.content}
                onLinkClick={(title) => {
                  const match = pages.find(p =>
                    p.toLowerCase().replace(/\.md$/, '') === title.toLowerCase().replace(/\s+/g, '-')
                  )
                  if (match) loadPage(match)
                }}
              />
            </div>
          </>
        ) : (
          <div className="empty">select a page from the index</div>
        )}
      </section>
    </div>
  )
}
