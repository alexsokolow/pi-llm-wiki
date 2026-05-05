import { useState } from 'react'
import TerminalLayout from './components/TerminalLayout'
import WikiBrowser from './pages/WikiBrowser'
import IngestView from './pages/IngestView'
import QueryView from './pages/QueryView'
import ExploreView from './pages/ExploreView'
import SettingsView from './pages/SettingsView'
import WikiGraph from './components/WikiGraph'
import ActivityDrawer from './components/ActivityDrawer'
import { AgentContext } from './AgentContext'
import { useAgentStream } from './hooks/useAgentStream'

type View = 'browser' | 'ingest' | 'query' | 'explore' | 'graph' | 'config'

export default function App() {
  const [view, setView] = useState<View>('browser')
  const agent = useAgentStream()

  const navItems: { key: View; label: string }[] = [
    { key: 'browser', label: '[wiki]' },
    { key: 'graph', label: '[graph]' },
    { key: 'ingest', label: '[ingest]' },
    { key: 'query', label: '[query]' },
    { key: 'explore', label: '[explore]' },
    { key: 'config', label: '[config]' },
  ]

  return (
    <AgentContext.Provider value={agent}>
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
        drawer={<ActivityDrawer entries={agent.entries} />}
      >
        {view === 'browser' && <WikiBrowser />}
        {view === 'graph' && <WikiGraph />}
        {view === 'ingest' && <IngestView />}
        {view === 'query' && <QueryView />}
        {view === 'explore' && <ExploreView />}
        {view === 'config' && <SettingsView />}
      </TerminalLayout>
    </AgentContext.Provider>
  )
}
