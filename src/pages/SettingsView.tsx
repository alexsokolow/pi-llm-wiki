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

interface ProviderInfo {
  id: string
  name: string
  type: 'oauth' | 'apikey' | 'ollama'
  authenticated: boolean
  baseUrl?: string
}

export default function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [models, setModels] = useState<AvailableModel[]>([])
  const [status, setStatus] = useState('')
  const [loadingModels, setLoadingModels] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [authProviders, setAuthProviders] = useState<ProviderInfo[]>([])
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [oauthStatus, setOauthStatus] = useState<Record<string, string>>({})
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434/v1')
  const [ollamaModels, setOllamaModels] = useState<any[]>([])
  const [ollamaSelected, setOllamaSelected] = useState<string[]>([])

  const loadAuthStatus = () => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then(data => {
        const providers = data.providers || []
        setAuthProviders(providers)
        // Set ollama URL from server config if available
        const ollama = providers.find((p: any) => p.id === 'ollama')
        if (ollama?.baseUrl) setOllamaUrl(ollama.baseUrl)
      })
      .catch(() => {})
  }

  const loadModels = () => {
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
  }

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig)
    loadModels()
    loadAuthStatus()
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

  const saveApiKey = async (provider: string) => {
    const key = apiKeyInputs[provider]
    if (!key?.trim()) return
    const res = await fetch('/api/auth/apikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, key: key.trim() }),
    })
    if (res.ok) {
      setApiKeyInputs(prev => ({ ...prev, [provider]: '' }))
      loadAuthStatus()
      loadModels()
      setStatus(`✅ ${provider} key saved`)
      setTimeout(() => setStatus(''), 2000)
    }
  }

  const startOAuth = async (provider: string) => {
    setOauthStatus(prev => ({ ...prev, [provider]: 'starting...' }))
    try {
      const eventSource = new EventSource(`/api/auth/oauth/login/${provider}`)

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'auth') {
          window.open(data.url, '_blank')
          const msg = data.instructions
            ? `🔗 Opened browser. Code: ${data.instructions}`
            : '🔗 Opened browser for authorization...'
          setOauthStatus(prev => ({ ...prev, [provider]: msg }))
        } else if (data.type === 'prompt') {
          // This contains the device code
          setOauthStatus(prev => ({ ...prev, [provider]: `📋 ${data.message}` }))
        } else if (data.type === 'progress') {
          setOauthStatus(prev => ({ ...prev, [provider]: `⏳ ${data.message}` }))
        } else if (data.type === 'complete') {
          setOauthStatus(prev => ({ ...prev, [provider]: '✅ authenticated!' }))
          eventSource.close()
          loadAuthStatus()
          loadModels()
          setTimeout(() => setOauthStatus(prev => ({ ...prev, [provider]: '' })), 3000)
        } else if (data.type === 'error') {
          setOauthStatus(prev => ({ ...prev, [provider]: `❌ ${data.message}` }))
          eventSource.close()
          setTimeout(() => setOauthStatus(prev => ({ ...prev, [provider]: '' })), 5000)
        }
      }

      eventSource.onerror = () => {
        eventSource.close()
        setOauthStatus(prev => ({ ...prev, [provider]: '' }))
      }
    } catch (err) {
      setOauthStatus(prev => ({ ...prev, [provider]: `❌ ${err}` }))
      setTimeout(() => setOauthStatus(prev => ({ ...prev, [provider]: '' })), 5000)
    }
  }

  const logout = async (provider: string) => {
    await fetch(`/api/auth/${provider}`, { method: 'DELETE' })
    loadAuthStatus()
    loadModels()
    setStatus(`🗑️ ${provider} logged out`)
    setTimeout(() => setStatus(''), 2000)
  }

  const fetchOllamaModels = async () => {
    try {
      const res = await fetch('/api/auth/ollama/models')
      if (res.ok) {
        const data = await res.json()
        setOllamaModels(data.models || [])
      } else {
        const err = await res.json()
        setStatus(`❌ Ollama: ${err.error}`)
        setTimeout(() => setStatus(''), 3000)
      }
    } catch {
      setStatus('❌ Cannot reach Ollama server')
      setTimeout(() => setStatus(''), 3000)
    }
  }

  const saveOllama = async () => {
    const res = await fetch('/api/auth/ollama', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: ollamaUrl,
        models: ollamaSelected.map(id => ({ id })),
      }),
    })
    if (res.ok) {
      setStatus('✅ Ollama configured')
      loadAuthStatus()
      loadModels()
    } else {
      setStatus('❌ Failed to save Ollama config')
    }
    setTimeout(() => setStatus(''), 2000)
  }

  if (!config) return <div className="empty">loading config...</div>

  const modelProviders = [...new Set(models.map(m => m.provider))]
  const selectedKey = `${config.defaultProvider}/${config.defaultModel}`

  return (
    <div className="settings">
      <div className="panel-title">&gt; CONFIGURATION</div>

      {/* ─── Provider Authentication ─── */}
      <div className="settings-section">
        <div className="settings-label">Providers</div>
        <div className="settings-providers">
          {authProviders.map(p => (
            <div key={p.id} className="settings-provider-item" style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{p.authenticated ? '✅' : '⬚'}</span>
                <strong>{p.name}</strong>
                <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>({p.type})</span>
                {p.authenticated && (
                  <button
                    className="btn"
                    style={{ marginLeft: 'auto', fontSize: '0.7rem', padding: '2px 6px' }}
                    onClick={() => logout(p.id)}
                  >
                    logout
                  </button>
                )}
              </div>
              {!p.authenticated && p.type === 'apikey' && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  <input
                    className="command-input"
                    type="password"
                    placeholder={`${p.id} API key...`}
                    value={apiKeyInputs[p.id] || ''}
                    onChange={e => setApiKeyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && saveApiKey(p.id)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn" onClick={() => saveApiKey(p.id)}>save</button>
                </div>
              )}
              {!p.authenticated && p.type === 'oauth' && (
                <div style={{ marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  <button className="btn" onClick={() => startOAuth(p.id)}>
                    Login with {p.name}
                  </button>
                  {oauthStatus[p.id] && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>{oauthStatus[p.id]}</span>
                  )}
                </div>
              )}
              {p.type === 'ollama' && (
                <div style={{ marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      className="command-input"
                      placeholder="Ollama URL"
                      value={ollamaUrl}
                      onChange={e => setOllamaUrl(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="btn" onClick={fetchOllamaModels}>detect</button>
                  </div>
                  {ollamaModels.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Select models to use:</div>
                      {ollamaModels.map(m => (
                        <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                          <input
                            type="checkbox"
                            checked={ollamaSelected.includes(m.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setOllamaSelected(prev => [...prev, m.id])
                              } else {
                                setOllamaSelected(prev => prev.filter(x => x !== m.id))
                              }
                            }}
                          />
                          {m.id} {m.parameterSize && <span style={{ opacity: 0.5 }}>({m.parameterSize})</span>}
                        </label>
                      ))}
                      <button className="btn" onClick={saveOllama} style={{ marginTop: '0.5rem' }}>Save Ollama</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {authProviders.length === 0 && (
            <div className="empty">Loading providers...</div>
          )}
        </div>
      </div>

      {/* ─── Model Selection ─── */}
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
            {modelProviders.map(provider => (
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
            <div className="empty">no models available — authenticate a provider above first</div>
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

      {/* ─── Thinking Level ─── */}
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

      {/* ─── Save ─── */}
      <div className="settings-actions">
        <button className="btn" onClick={save}>SAVE</button>
        {status && <span className="status-line">&gt; {status}</span>}
      </div>

      {/* ─── Danger Zone ─── */}
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
