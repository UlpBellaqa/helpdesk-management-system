import { useEffect, useState } from 'react'
import './App.css'
import { API_BASE_URL, apiRequest } from './api.js'
import { useAuth } from './state/useAuth.js'

const statuses = ['open', 'triage', 'in_progress', 'waiting_customer', 'resolved', 'closed']

function App() {
  const { token, user, login, logout } = useAuth()
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('admin123')
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [comments, setComments] = useState([])
  const [ticketSearch, setTicketSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('laptop')
  const [searchResult, setSearchResult] = useState(null)
  const [aiMessage, setAiMessage] = useState('Summarize open ticket risks')
  const [aiReply, setAiReply] = useState('')
  const [error, setError] = useState('')
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'Medium', category: 'Software' })

  useEffect(() => {
    if (!token) return
    let active = true

    async function loadTickets() {
      try {
        const rows = await apiRequest(`/api/tickets?q=${encodeURIComponent(ticketSearch)}`, { token })
        if (!active) return
        setTickets(rows)
        setSelectedTicket((current) => rows.find((ticket) => ticket.id === current?.id) || rows[0] || null)
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }

    loadTickets()
    return () => {
      active = false
    }
  }, [ticketSearch, token])

  useEffect(() => {
    if (!token || !selectedTicket) return
    let active = true

    async function loadComments() {
      try {
        const rows = await apiRequest(`/api/tickets/${selectedTicket.id}/comments`, { token })
        if (active) setComments(rows)
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }

    loadComments()
    return () => {
      active = false
    }
  }, [selectedTicket, token])

  async function reloadTickets() {
    const rows = await apiRequest(`/api/tickets?q=${encodeURIComponent(ticketSearch)}`, { token })
    setTickets(rows)
    setSelectedTicket((current) => rows.find((ticket) => ticket.id === current?.id) || rows[0] || null)
  }

  async function submitLogin(event) {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createTicket(event) {
    event.preventDefault()
    if (!newTicket.title.trim()) return
    const ticket = await apiRequest('/api/tickets', { token, method: 'POST', body: { ...newTicket, status: 'open' } })
    setNewTicket({ title: '', description: '', priority: 'Medium', category: 'Software' })
    setSelectedTicket(ticket)
    await reloadTickets()
  }

  async function updateStatus(status) {
    const ticket = await apiRequest(`/api/tickets/${selectedTicket.id}/status`, { token, method: 'PATCH', body: { status } })
    setSelectedTicket(ticket)
    await reloadTickets()
  }

  async function addComment(event) {
    event.preventDefault()
    const body = event.currentTarget.elements.comment.value.trim()
    if (!body || !selectedTicket) return
    const comment = await apiRequest(`/api/tickets/${selectedTicket.id}/comments`, { token, method: 'POST', body: { body } })
    event.currentTarget.reset()
    setComments((rows) => [...rows, comment])
  }

  async function searchAll(event) {
    event.preventDefault()
    setSearchResult(await apiRequest(`/api/search?q=${encodeURIComponent(globalSearch)}`, { token }))
  }

  async function askAi() {
    const data = await apiRequest('/api/ai/chat', { token, method: 'POST', body: { message: aiMessage } })
    setAiReply(data.reply)
  }

  if (!token) {
    return (
      <main className="login-page">
        <form className="panel login-panel" onSubmit={submitLogin}>
          <h1>Helpdesk Management</h1>
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit">Login</button>
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className="app">
      <header>
        <div>
          <h1>Helpdesk Management</h1>
          <p>{user.name} / {user.role}</p>
        </div>
        <nav>
          <a href={`${API_BASE_URL}/api-docs`} target="_blank" rel="noreferrer">Swagger</a>
          <button onClick={logout}>Logout</button>
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="grid">
        <div className="panel">
          <h2>Tickets</h2>
          <input placeholder="Search tickets" value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} />
          <div className="ticket-list">
            {tickets.map((ticket) => (
              <button key={ticket.id} className={ticket.id === selectedTicket?.id ? 'selected' : ''} onClick={() => setSelectedTicket(ticket)}>
                <strong>#{ticket.id} {ticket.title}</strong>
                <span>{ticket.status} / {ticket.priority}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>{selectedTicket?.title || 'Ticket detail'}</h2>
          {selectedTicket && (
            <>
              <div className="status-row">
                {statuses.map((status) => (
                  <button key={status} className={selectedTicket.status === status ? 'active' : ''} onClick={() => updateStatus(status)}>
                    {status.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <p>{selectedTicket.description || selectedTicket.category}</p>
              <div className="comments">
                {comments.map((comment) => <p key={comment.id}>{comment.body}</p>)}
              </div>
              <form className="inline-form" onSubmit={addComment}>
                <input name="comment" placeholder="Add comment" />
                <button type="submit">Add</button>
              </form>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Create Ticket</h2>
        <form className="ticket-form" onSubmit={createTicket}>
          <input placeholder="Title" value={newTicket.title} onChange={(event) => setNewTicket({ ...newTicket, title: event.target.value })} />
          <input placeholder="Description" value={newTicket.description} onChange={(event) => setNewTicket({ ...newTicket, description: event.target.value })} />
          <select value={newTicket.priority} onChange={(event) => setNewTicket({ ...newTicket, priority: event.target.value })}>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
          <input placeholder="Category" value={newTicket.category} onChange={(event) => setNewTicket({ ...newTicket, category: event.target.value })} />
          <button type="submit">Create</button>
        </form>
      </section>

      <section className="grid">
        <form className="panel" onSubmit={searchAll}>
          <h2>Search</h2>
          <div className="inline-form">
            <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} />
            <button type="submit">Search</button>
          </div>
          {searchResult && <p>{searchResult.cached ? 'Cached' : 'Fresh'} results: {searchResult.results.length}</p>}
        </form>

        <div className="panel">
          <h2>AI</h2>
          <div className="inline-form">
            <input value={aiMessage} onChange={(event) => setAiMessage(event.target.value)} />
            <button onClick={askAi}>Ask</button>
          </div>
          {aiReply && <p>{aiReply}</p>}
        </div>
      </section>
    </main>
  )
}

export default App
