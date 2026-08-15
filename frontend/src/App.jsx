import { useEffect, useMemo, useState } from 'react'
import './App.css'

const apiRoot = '/api'

function App() {
  const [authMode, setAuthMode] = useState('login')
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [documents, setDocuments] = useState([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [summary, setSummary] = useState('')
  const [status, setStatus] = useState('Create an account or log in to start indexing your documents.')
  const [busy, setBusy] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('Upload document')
  const [indexing, setIndexing] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('docmind_token')
    const storedUser = localStorage.getItem('docmind_user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
      fetchDocuments(storedToken)
    }
  }, [])

  const authHeaders = useMemo(
    () => ({ ...(token ? { Authorization: `Bearer ${token}` } : {}) }),
    [token],
  )

  const saveSession = (nextToken, nextUser) => {
    localStorage.setItem('docmind_token', nextToken)
    localStorage.setItem('docmind_user', JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
    setAuthError('')
    setStatus(`Welcome back, ${nextUser.name}. Your workspace is ready.`)
  }

  const clearSession = () => {
    localStorage.removeItem('docmind_token')
    localStorage.removeItem('docmind_user')
    setToken('')
    setUser(null)
    setDocuments([])
    setAnswer('')
    setSummary('')
    setStatus('Create an account or log in to start indexing your documents.')
  }

  const fetchDocuments = async (overrideToken) => {
    const headers = overrideToken
      ? { Authorization: `Bearer ${overrideToken}` }
      : authHeaders
    try {
      const response = await fetch(`${apiRoot}/documents`, { headers })
      if (!response.ok) throw new Error('Unable to load documents')
      const data = await response.json()
      setDocuments(data.documents || [])
      setSummary(data.indexSummary || '')
    } catch (error) {
      console.warn(error)
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setAuthError('')
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch(`${apiRoot}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Registration failed')
      saveSession(result.token, result.user)
      fetchDocuments(result.token)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setAuthError('')
    setBusy(true)
    try {
      const response = await fetch(`${apiRoot}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Login failed')
      saveSession(result.token, result.user)
      fetchDocuments(result.token)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setBusy(false)
    }
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setBusy(true)
    setUploadLabel(`Uploading ${file.name}…`)
    setStatus(`Uploading ${file.name}`)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${apiRoot}/documents/upload`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Upload failed')
      setDocuments((prev) => [result.document, ...prev])
      setStatus(`Uploaded ${result.document.name} successfully.`)
      setUploadLabel('Upload another document')
    } catch (error) {
      setStatus(`Upload failed: ${error.message}`)
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  const handleBuildIndex = async () => {
    if (!documents.length) {
      setStatus('Upload a document before building an index.')
      return
    }

    setIndexing(true)
    setStatus('Generating a fresh index for your workspace…')

    try {
      const response = await fetch(`${apiRoot}/index`, {
        method: 'POST',
        headers: authHeaders,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Index creation failed')
      setSummary(result.summary)
      setStatus('Index created successfully — now ask DocMind any question.')
    } catch (error) {
      setStatus(`Index error: ${error.message}`)
    } finally {
      setIndexing(false)
    }
  }

  const handleAsk = async (event) => {
    event.preventDefault()
    if (!question.trim()) {
      setStatus('Write a question about your documents to get started.')
      return
    }
    if (!documents.length) {
      setStatus('Upload a document so DocMind can answer your question.')
      return
    }

    setBusy(true)
    setStatus('DocMind is reading your indexed content…')

    try {
      const response = await fetch(`${apiRoot}/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ question }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Query failed')
      setAnswer(result.answer)
      setStatus('Answer generated from your document matrix.')
    } catch (error) {
      setStatus(`Question failed: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  const totalChars = documents.reduce((sum, doc) => sum + (doc.size || 0), 0)

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <span>DocMind AI</span>
            <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p>
              {authMode === 'login'
                ? 'Sign in to manage your documents, build smart indexes, and ask AI-powered questions.'
                : 'Register a secure account and start building a private document intelligence workspace.'}
            </p>
          </div>

          <form className="auth-form" onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
            {authMode === 'register' && (
              <label className="input-group">
                <span>Name</span>
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
            )}

            <label className="input-group">
              <span>Email address</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            <label className="input-group">
              <span>Password</span>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                required
              />
            </label>

            {authMode === 'register' && (
              <label className="input-group">
                <span>Confirm password</span>
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={busy}
                  required
                />
              </label>
            )}

            {authError && <div className="form-error">{authError}</div>}

            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Working…' : authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>

            <div className="auth-switch">
              <span>
                {authMode === 'login'
                  ? 'New to DocMind?'
                  : 'Already have an account?'}
              </span>
              <button
                type="button"
                className="button button-link"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login')
                  setAuthError('')
                }}
              >
                {authMode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>DocMind</strong>
          <span>Private AI document intelligence</span>
        </div>
        <div className="topbar-actions">
          <span className="user-chip">{user.name}</span>
          <button className="button button-ghost" type="button" onClick={clearSession}>
            Log out
          </button>
        </div>
      </header>

      <section className="hero-banner">
        <div className="hero-copy">
          <span className="eyebrow">Private workspace</span>
          <h1>Smart document Q&A for your team.</h1>
          <p>
            Upload files, build private indexes, and ask context-aware questions.
            DocMind keeps your documents secure while delivering sleek AI-powered insights.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={handleBuildIndex}
              disabled={busy || indexing}
            >
              {indexing ? 'Indexing…' : 'Build document index'}
            </button>
            <label className="button button-secondary">
              {uploadLabel}
              <input
                type="file"
                accept=".txt,.md,.json,.csv"
                onChange={handleUpload}
                disabled={busy}
              />
            </label>
          </div>
        </div>

        <div className="hero-graphics">
          <div className="floating-card">
            <div className="card-header">
              <span>Workspace stats</span>
              <strong>{documents.length}</strong>
            </div>
            <div className="card-body">
              <p>
                {summary ||
                  'Build an index to unlock summaries, answer generation, and a more powerful document workflow.'}
              </p>
            </div>
          </div>
          <div className="graphic-glow" />
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="workspace-panel slide-up">
          <header>
            <div>
              <h2>Document library</h2>
              <p>Browse your uploaded files and history.</p>
            </div>
            <span className="badge">{documents.length} files</span>
          </header>

          <div className="document-list">
            {documents.length ? (
              documents.map((document) => (
                <div key={document.id} className="document-item">
                  <div>
                    <strong>{document.name}</strong>
                    <span>{document.size.toLocaleString()} chars</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <p>No documents uploaded yet. Add one to begin.</p>
              </div>
            )}
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>Total characters</span>
              <strong>{totalChars.toLocaleString()}</strong>
            </div>
            <div className="stat-card">
              <span>AI ready</span>
              <strong>{answer ? 'Yes' : 'No'}</strong>
            </div>
          </div>
        </article>

        <article className="workspace-panel slide-up delay-1">
          <header>
            <div>
              <h2>Ask DocMind</h2>
              <p>Submit a question and receive a concise answer from your indexed files.</p>
            </div>
          </header>

          <form className="query-form" onSubmit={handleAsk}>
            <textarea
              rows="5"
              placeholder="Ask about document insights, key findings, or next steps."
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={busy}
            />
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? 'Answering…' : 'Ask DocMind'}
            </button>
          </form>

          <div className="answer-card">
            <span>AI answer</span>
            <p>
              {answer ||
                'Your answer will appear here once the system has processed your indexed documents.'}
            </p>
          </div>
        </article>

        <article className="workspace-panel slide-up delay-2">
          <header>
            <div>
              <h2>Index overview</h2>
              <p>Monitor your workspace summary and system status.</p>
            </div>
          </header>

          <div className="index-card">
            <p>
              {summary ||
                'No index exists yet. Build one to generate intelligent summaries and fast search across your files.'}
            </p>
          </div>

          <div className="progress-group">
            <div>
              <span>Current status</span>
              <strong>{status}</strong>
            </div>
            <button className="button button-ghost" type="button" onClick={() => fetchDocuments()}>
              Refresh workspace
            </button>
          </div>
        </article>
      </section>
    </div>
  )
}

export default App
