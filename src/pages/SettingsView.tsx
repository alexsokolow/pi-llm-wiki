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
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig)
    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
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
            <div className="empty">no models found — run <code>pi /login</code> in terminal</div>
            <input
              className="command-input"
              value={`${config.defaultProvider}/${config.defaultModel}`}
              onChange={e => {
                const [provider, ...rest] = e.target.value.split('/')
                setConfig({ ...config, defaultProvider: provider, defaultModel: rest.join('/') })
              }}
              placeholder="provider/model-id"
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
              No providers authenticated.<br/>
              Run <code>pi /login</code> in your terminal to add providers.
            </div>
          )}
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn" onClick={save}>SAVE</button>
        {status && <span className="status-line">&gt; {status}</span>}
      </div>

      <div className="settings-section" style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        <div className="settings-label">Danger Zone</div>
        <button
          className="btn"
          style={{ background: 'var(--error, #c62828)', color: '#fff' }}
          disabled={resetting}
          onClick={async () => {
            if (!confirm('Reset wiki? This will delete all pages, index, and log. Raw source files are kept.')) return
            setResetting(true)
            try {
              const res = await fetch('/api/wiki/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              })
              if (res.ok) {
                setStatus('✅ wiki reset')
              } else {
                setStatus('❌ reset failed')
              }
            } catch {
              setStatus('❌ reset failed')
            }
            setResetting(false)
            setTimeout(() => setStatus(''), 3000)
          }}
        >
          {resetting ? 'RESETTING...' : 'RESET WIKI'}
        </button>
        <div className="empty" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          Deletes all pages, index, and log. Raw source files in wiki/raw/ are kept.
        </div>
      </div>
    </div>
  )
}
