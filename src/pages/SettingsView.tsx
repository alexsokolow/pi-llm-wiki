import { useState, useEffect } from 'react'

interface AppConfig {
  defaultModel: string
  defaultProvider: string
  thinkingLevel: string
  plugins: {
    webSearch: boolean
    codeSearch: boolean
    subagents: boolean
    fileSystem: boolean
  }
}

export default function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig)
  }, [])

  const save = async () => {
    if (!config) return
    setStatus('saving...')
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setStatus(res.ok ? '✅ saved' : '❌ failed')
    setTimeout(() => setStatus(''), 2000)
  }

  if (!config) return <div className="empty">loading config...</div>

  return (
    <div className="settings">
      <div className="panel-title">&gt; CONFIGURATION</div>

      <div className="settings-section">
        <div className="settings-label">Model</div>
        <input
          className="command-input"
          value={config.defaultModel}
          onChange={e => setConfig({ ...config, defaultModel: e.target.value })}
          placeholder="e.g. claude-opus-4.6"
        />
      </div>

      <div className="settings-section">
        <div className="settings-label">Provider</div>
        <input
          className="command-input"
          value={config.defaultProvider}
          onChange={e => setConfig({ ...config, defaultProvider: e.target.value })}
          placeholder="e.g. github-copilot"
        />
      </div>

      <div className="settings-section">
        <div className="settings-label">Thinking Level</div>
        <select
          className="model-select"
          value={config.thinkingLevel}
          onChange={e => setConfig({ ...config, thinkingLevel: e.target.value })}
        >
          {['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <div className="settings-label">Plugins</div>
        {Object.entries(config.plugins).map(([key, enabled]) => (
          <label key={key} className="settings-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setConfig({
                ...config,
                plugins: { ...config.plugins, [key]: e.target.checked },
              })}
            />
            <span>{key}</span>
          </label>
        ))}
      </div>

      <div className="settings-actions">
        <button className="btn" onClick={save}>SAVE CONFIG</button>
        {status && <span className="status-line">&gt; {status}</span>}
      </div>
    </div>
  )
}
