import { useEffect, useState } from 'react'
import './App.css'
import { useAuth } from './state/useAuth.js'

function App() {
  const { token, user, login, logout } = useAuth()
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('admin123')
  const [tickets, setTickets] = useState([])
  const [search, setSearch] = useState('')
  const [aiMessage, setAiMessage] = useState('Summarize open ticket risks')
  const [aiReply, setAiReply] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`http://localhost:4000/api/tickets?q=${encodeURIComponent(search)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then(setTickets)
      .catch(() => setError('API is not running on port 4000'))
  }, [token, search])

  const submitLogin = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
    } catch {
      setError('Invalid credentials or backend is offline')
    }
  }

  const askAi = async () => {
    const response = await fetch('http://localhost:4000/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: aiMessage }),
    })
    const data = await response.json()
    setAiReply(data.reply)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Distributed Systems</p>
          <h1>Helpdesk Management</h1>
        </div>
        <nav>
          <a href="#tickets">Tickets</a>
          <a href="#search">Search</a>
          <a href="#ai">AI Module</a>
          <a href="http://localhost:4000/api-docs" target="_blank">Swagger</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <strong>{user ? user.name : 'Demo login'}</strong>
            <span>{user ? `${user.role} tenant ${user.tenantId}` : 'React Context auth state'}</span>
          </div>
          {token && <button onClick={logout}>Logout</button>}
        </header>

        {!token ? (
          <form className="panel login-panel" onSubmit={submitLogin}>
            <h2>Login</h2>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit">Login</button>
            {error && <p className="error">{error}</p>}
          </form>
        ) : (
          <>
            <section id="tickets" className="metrics">
              <article>
                <span>REST endpoints</span>
                <strong>70+</strong>
              </article>
              <article>
                <span>Models</span>
                <strong>22</strong>
              </article>
              <article>
                <span>Tenancy</span>
                <strong>tenantId</strong>
              </article>
              <article>
                <span>Cache</span>
                <strong>In memory</strong>
              </article>
            </section>

            <section id="search" className="panel">
              <div className="panel-heading">
                <h2>Tickets</h2>
                <input placeholder="Search or filter tickets" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <div className="table">
                {tickets.map((ticket) => (
                  <div className="row" key={ticket.id}>
                    <span>#{ticket.id}</span>
                    <strong>{ticket.title}</strong>
                    <span>{ticket.status}</span>
                    <span>{ticket.priority}</span>
                  </div>
                ))}
              </div>
            </section>

            <section id="ai" className="panel ai-panel">
              <h2>OpenAI Module</h2>
              <div className="ai-controls">
                <input value={aiMessage} onChange={(event) => setAiMessage(event.target.value)} />
                <button onClick={askAi}>Ask AI</button>
              </div>
              {aiReply && <p className="ai-reply">{aiReply}</p>}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

export default App
