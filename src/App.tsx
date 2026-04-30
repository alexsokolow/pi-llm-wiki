import { useState } from 'react'
import TerminalLayout from './components/TerminalLayout'
import WikiBrowser from './pages/WikiBrowser'
import IngestView from './pages/IngestView'
import QueryView from './pages/QueryView'
import ExploreView from './pages/ExploreView'

import WikiGraph from './components/WikiGraph'

type View = 'browser' | 'ingest' | 'query' | 'explore' | 'graph'

export default function App() {
  const [view, setView] = useState<View>('browser')

  const navItems: { key: View; label: string }[] = [
    { key: 'browser', label: '[wiki]' },
    { key: 'graph', label: '[graph]' },
    { key: 'ingest', label: '[ingest]' },
    { key: 'query', label: '[query]' },
    { key: 'explore', label: '[explore]' },
  ]

  return (
    <TerminalLayout
      header="LLM WIKI v0.1"
      nav={
        <nav className="nav-bar">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-btn ${view === item.key ? 'active' : ''}`}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      }
    >
      {view === 'browser' && <WikiBrowser />}
      {view === 'graph' && <WikiGraph />}
      {view === 'ingest' && <IngestView />}
      {view === 'query' && <QueryView />}
      {view === 'explore' && <ExploreView />}
    </TerminalLayout>
  )
}
