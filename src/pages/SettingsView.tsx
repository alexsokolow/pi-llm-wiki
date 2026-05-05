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

interface AvailableModel {
  provider: string
  id: string
  name?: string
}

export default function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [models, setModels] = useState<AvailableModel[]>([])
  const [status, setStatus] = useState('')
  const [loadingModels, setLoadingModels] = useState(true)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig)
    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
        // ModelRegistry.getAvailable() returns model objects with provider/id
        const available = (data.models || []).map((m: any) => ({
          provider: m.provider || m.providerId || 'unknown',
          id: m.id || m.modelId || m.name || 'unknown',
          name: m.name || m.id || m.modelId,
        }))
        setModels(available)
        setLoadingModels(false)
      })
      .catch(() => setLoadingModels(false))
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

  // Group models by provider
  const providers = [...new Set(models.map(m => m.provider))]
  const selectedKey = `${config.defaultProvider}/${config.defaultModel}`

  return (
    <div className="settings">
      <div className="panel-title">&gt; CONFIGURATION</div>

      <div className="settings-section">
        <div className="settings-label">Model</div>
        {loadingModels ? (
          <div className="empty">loading models...</div>
        ) : models.length > 0 ? (
          <select
            className="model-select settings-select"
            value={selectedKey}
            onChange={e => {
              const [provider, ...rest] = e.target.value.split('/')
              const model = rest.join('/')
              setConfig({ ...config, defaultProvider: provider, defaultModel: model })
            }}
          >
            {providers.map(provider => (
              <optgroup key={provider} label={provider}>
                {models.filter(m => m.provider === provider).map(m => (
                  <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                    {m.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <div className="settings-fallback">
            <div className="empty">no models found — run `pi /login` in terminal to authenticate providers</div>
            <input
              className="command-input"
              value={config.defaultModel}
              onChange={e => setConfig({ ...config, defaultModel: e.target.value })}
              placeholder="e.g. claude-opus-4.6"
            />
            <input
              className="command-input"
              value={config.defaultProvider}
              onChange={e => setConfig({ ...config, defaultProvider: e.target.value })}
              placeholder="e.g. github-copilot"
              style={{ marginTop: '0.5rem' }}
            />
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-label">Thinking Level</div>
        <select
          className="model-select settings-select"
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

      <div className="settings-section">
        <div className="settings-label">Providers ({providers.length} authenticated)</div>
        <div className="settings-providers">
          {providers.length > 0 ? (
            providers.map(p => (
              <div key={p} className="settings-provider-item">
                ✅ {p} ({models.filter(m => m.provider === p).length} models)
              </div>
            ))
          ) : (
            <div className="empty">
              No providers authenticated. Run in terminal:<br/>
              <code>pi /login</code>
            </div>
          )}
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn" onClick={save}>SAVE CONFIG</button>
        {status && <span className="status-line">&gt; {status}</span>}
      </div>
    </div>
  )
}
