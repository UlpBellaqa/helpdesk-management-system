import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { API_BASE_URL, apiRequest } from './api.js'
import { useAuth } from './state/useAuth.js'

const statuses = ['open', 'triage', 'in_progress', 'waiting_customer', 'resolved', 'closed']
const navItems = ['Overview', 'Tickets', 'Customers', 'Services', 'Knowledge', 'Activity', 'Automation', 'Admin']
const viewDescriptions = {
  Overview: 'Operational summary, workload signals and quick access to key workflows.',
  Tickets: 'Review the support queue, update status and keep ticket communication moving.',
  Customers: 'Maintain customer records connected to helpdesk activity.',
  Services: 'Manage the service catalog and SLA expectations.',
  Knowledge: 'Create reusable support articles for faster resolution.',
  Activity: 'Track ticket history and background jobs.',
  Automation: 'Use global search, Redis cache and the AI assistant endpoint.',
  Admin: 'Review users and API coverage for the system.',
}

function formatLabel(value) {
  return String(value || 'unassigned').replaceAll('_', ' ')
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function App() {
  const { token, user, login, logout } = useAuth()
  const [activeView, setActiveView] = useState('Overview')
  const [email, setEmail] = useState('admin@demo.com')
  const [password, setPassword] = useState('admin123')
  const [dashboard, setDashboard] = useState(null)
  const [tickets, setTickets] = useState([])
  const [customers, setCustomers] = useState([])
  const [articles, setArticles] = useState([])
  const [services, setServices] = useState([])
  const [slaPolicies, setSlaPolicies] = useState([])
  const [jobs, setJobs] = useState([])
  const [histories, setHistories] = useState([])
  const [users, setUsers] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [comments, setComments] = useState([])
  const [ticketSearch, setTicketSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('laptop')
  const [searchResult, setSearchResult] = useState(null)
  const [aiMessage, setAiMessage] = useState('Summarize open ticket risks')
  const [aiReply, setAiReply] = useState('')
  const [error, setError] = useState('')
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'Medium', category: 'Software' })
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', company: '' })
  const [newArticle, setNewArticle] = useState({ title: '', body: '', category: 'General', published: true })
  const [newService, setNewService] = useState({ name: '', departmentId: '' })
  const [newSla, setNewSla] = useState({ name: '', priority: 'High', responseHours: 4, resolutionHours: 24 })
  const [newJob, setNewJob] = useState({ type: 'email', payload: '{"reason":"manual follow-up"}' })

  const visibleNavItems = useMemo(() => {
    if (user?.role === 'customer') return navItems.filter((item) => !['Automation', 'Admin'].includes(item))
    if (user?.role !== 'admin') return navItems.filter((item) => item !== 'Admin')
    return navItems
  }, [user])

  const statusEntries = Object.entries(dashboard?.byStatus || {})
  const priorityEntries = Object.entries(dashboard?.byPriority || {})
  const openTicketCount = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).length
  const highPriorityCount = tickets.filter((ticket) => ticket.priority === 'High').length
  const resolvedTicketCount = tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status)).length

  async function loadDashboard() {
    setDashboard(await apiRequest('/api/dashboard/summary', { token }))
  }

  async function loadCustomers() {
    setCustomers(await apiRequest('/api/customers', { token }))
  }

  async function loadArticles() {
    setArticles(await apiRequest('/api/articles', { token }))
  }

  async function loadOperations() {
    const [serviceRows, slaRows, jobRows, historyRows] = await Promise.all([
      apiRequest('/api/services', { token }),
      apiRequest('/api/sla-policies', { token }),
      apiRequest('/api/jobs', { token }),
      apiRequest('/api/histories', { token }),
    ])
    setServices(serviceRows)
    setSlaPolicies(slaRows)
    setJobs(jobRows)
    setHistories(historyRows.slice(-8).reverse())
  }

  async function loadUsers() {
    if (user?.role !== 'admin') return
    setUsers(await apiRequest('/api/users', { token }))
  }

  async function refreshWorkspace() {
    await Promise.all([loadDashboard(), loadCustomers(), loadArticles(), loadOperations(), loadUsers(), reloadTickets()])
  }

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
    if (!token) return
    let active = true

    async function loadWorkspace() {
      try {
        const [summary, customerRows, articleRows, serviceRows, slaRows, jobRows, historyRows, userRows] = await Promise.all([
          apiRequest('/api/dashboard/summary', { token }),
          apiRequest('/api/customers', { token }),
          apiRequest('/api/articles', { token }),
          apiRequest('/api/services', { token }),
          apiRequest('/api/sla-policies', { token }),
          apiRequest('/api/jobs', { token }),
          apiRequest('/api/histories', { token }),
          user?.role === 'admin' ? apiRequest('/api/users', { token }) : Promise.resolve([]),
        ])
        if (!active) return
        setDashboard(summary)
        setCustomers(customerRows)
        setArticles(articleRows)
        setServices(serviceRows)
        setSlaPolicies(slaRows)
        setJobs(jobRows)
        setHistories(historyRows.slice(-8).reverse())
        setUsers(userRows)
      } catch (requestError) {
        if (active) setError(requestError.message)
      }
    }

    loadWorkspace()
    return () => {
      active = false
    }
  }, [token, user?.role])

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
    await refreshWorkspace()
  }

  async function updateStatus(status) {
    const ticket = await apiRequest(`/api/tickets/${selectedTicket.id}/status`, { token, method: 'PATCH', body: { status } })
    setSelectedTicket(ticket)
    await refreshWorkspace()
  }

  async function addComment(event) {
    event.preventDefault()
    const body = event.currentTarget.elements.comment.value.trim()
    if (!body || !selectedTicket) return
    const comment = await apiRequest(`/api/tickets/${selectedTicket.id}/comments`, { token, method: 'POST', body: { body } })
    event.currentTarget.reset()
    setComments((rows) => [...rows, comment])
    await loadDashboard()
  }

  async function searchAll(event) {
    event.preventDefault()
    setSearchResult(await apiRequest(`/api/search?q=${encodeURIComponent(globalSearch)}`, { token }))
  }

  async function askAi() {
    const data = await apiRequest('/api/ai/chat', { token, method: 'POST', body: { message: aiMessage } })
    setAiReply(data.reply)
    await loadDashboard()
  }

  async function createCustomer(event) {
    event.preventDefault()
    if (!newCustomer.name.trim() || !newCustomer.email.trim()) return
    await apiRequest('/api/customers', { token, method: 'POST', body: newCustomer })
    setNewCustomer({ name: '', email: '', company: '' })
    await Promise.all([loadCustomers(), loadDashboard()])
  }

  async function createArticle(event) {
    event.preventDefault()
    if (!newArticle.title.trim() || !newArticle.body.trim()) return
    await apiRequest('/api/articles', { token, method: 'POST', body: newArticle })
    setNewArticle({ title: '', body: '', category: 'General', published: true })
    await Promise.all([loadArticles(), loadDashboard()])
  }

  async function createService(event) {
    event.preventDefault()
    if (!newService.name.trim()) return
    await apiRequest('/api/services', { token, method: 'POST', body: newService })
    setNewService({ name: '', departmentId: '' })
    await loadOperations()
  }

  async function createSla(event) {
    event.preventDefault()
    if (!newSla.name.trim()) return
    await apiRequest('/api/sla-policies', { token, method: 'POST', body: newSla })
    setNewSla({ name: '', priority: 'High', responseHours: 4, resolutionHours: 24 })
    await loadOperations()
  }

  async function enqueueJob(event) {
    event.preventDefault()
    let payload = {}
    try {
      payload = newJob.payload ? JSON.parse(newJob.payload) : {}
    } catch {
      setError('Job payload must be valid JSON')
      return
    }
    await apiRequest('/api/jobs', { token, method: 'POST', body: { type: newJob.type, payload } })
    await Promise.all([loadOperations(), loadDashboard()])
  }

  if (!token) {
    return (
      <main className="login-page">
        <form className="panel login-panel" onSubmit={submitLogin}>
          <div>
            <span className="eyebrow">Support operations</span>
            <h1>Helpdesk Management</h1>
            <p className="muted">Manage tickets, customers, articles and automation from one workspace.</p>
          </div>
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
      <header className="topbar">
        <div>
          <span className="eyebrow">Tenant workspace</span>
          <h1>Helpdesk Management</h1>
          <p className="muted">{user.name} / {user.role}</p>
        </div>
        <nav>
          <span className="system-pill">API {API_BASE_URL.replace('http://', '')}</span>
          <a href={`${API_BASE_URL}/api-docs`} target="_blank" rel="noreferrer">Swagger</a>
          <button onClick={logout}>Logout</button>
        </nav>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="shell">
        <aside className="sidebar">
          <div className="brand-mark">
            <strong>HD</strong>
            <span>Support Console</span>
          </div>
          <div className="profile-card">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <span className="role-badge">{user.role}</span>
          </div>
          <div className="nav-list">
            {visibleNavItems.map((item) => (
              <button key={item} className={activeView === item ? 'active' : ''} onClick={() => setActiveView(item)}>
                {item}
              </button>
            ))}
          </div>
        </aside>

        <div className="workspace">
          <section className="workspace-head">
            <div>
              <span className="eyebrow">{activeView}</span>
              <h2>{activeView === 'Overview' ? 'Operations dashboard' : activeView}</h2>
              <p className="muted">{viewDescriptions[activeView]}</p>
            </div>
            <div className="quick-actions">
              <button onClick={() => setActiveView('Tickets')}>New ticket</button>
              <button onClick={() => setActiveView('Customers')}>Customer</button>
              <button onClick={() => setActiveView('Knowledge')}>Article</button>
            </div>
          </section>

          <section className="metrics">
            <div className="metric-card">
              <span>Open tickets</span>
              <strong>{openTicketCount}</strong>
              <small>{resolvedTicketCount} resolved or closed</small>
            </div>
            <div className="metric-card">
              <span>Customers</span>
              <strong>{dashboard?.totals?.customers ?? customers.length}</strong>
              <small>{customers.length ? 'Directory active' : 'No records yet'}</small>
            </div>
            <div className="metric-card">
              <span>High priority</span>
              <strong>{highPriorityCount}</strong>
              <small>Needs fast response</small>
            </div>
            <div className="metric-card">
              <span>Queued jobs</span>
              <strong>{dashboard?.totals?.openJobs ?? 0}</strong>
              <small>{jobs.length} total jobs</small>
            </div>
          </section>

          {activeView === 'Overview' && (
            <>
              <section className="grid">
                <div className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">Live overview</span>
                      <h2>Ticket health</h2>
                    </div>
                  </div>
                  <div className="bar-list">
                    {statusEntries.length ? statusEntries.map(([status, count]) => (
                      <div key={status} className="bar-row">
                        <span>{formatLabel(status)}</span>
                        <div><i style={{ width: `${Math.max(12, count * 18)}%` }} /></div>
                        <strong>{count}</strong>
                      </div>
                    )) : <EmptyState title="No ticket data" text="Create or import tickets to populate this view." />}
                  </div>
                </div>

                <div className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">Priority mix</span>
                      <h2>Workload signals</h2>
                    </div>
                  </div>
                  <div className="tag-cloud">
                    {priorityEntries.length ? priorityEntries.map(([priority, count]) => (
                      <span key={priority}>{priority}: {count}</span>
                    )) : <span>No priorities yet</span>}
                  </div>
                  <div className="recent-list">
                    {(dashboard?.recentTickets || []).map((ticket) => (
                      <button key={ticket.id} onClick={() => { setSelectedTicket(ticket); setActiveView('Tickets') }}>
                        <strong>#{ticket.id} {ticket.title}</strong>
                        <span>{formatLabel(ticket.status)} / {ticket.priority}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid three-col">
                <div className="panel compact-panel">
                  <span className="eyebrow">Queue focus</span>
                  <h2>{openTicketCount} active tickets</h2>
                  <p className="muted">Use the ticket workspace to triage, comment and move cases through status states.</p>
                  <button onClick={() => setActiveView('Tickets')}>Open tickets</button>
                </div>

                <div className="panel compact-panel">
                  <span className="eyebrow">Customer coverage</span>
                  <h2>{customers.length} customers</h2>
                  <p className="muted">Keep customer context visible when support volume grows.</p>
                  <button onClick={() => setActiveView('Customers')}>Open directory</button>
                </div>

                <div className="panel compact-panel">
                  <span className="eyebrow">Knowledge base</span>
                  <h2>{articles.length} articles</h2>
                  <p className="muted">Capture repeat fixes so agents solve issues faster.</p>
                  <button onClick={() => setActiveView('Knowledge')}>Open articles</button>
                </div>
              </section>

              <section className="grid">
                <form className="panel" onSubmit={searchAll}>
                  <h2>Global search</h2>
                  <div className="inline-form">
                    <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} />
                    <button type="submit">Search</button>
                  </div>
                  {searchResult && <p className="muted">{searchResult.cached ? 'Cached' : 'Fresh'} results: {searchResult.results.length}</p>}
                </form>

                <div className="panel">
                  <h2>AI assistant</h2>
                  <div className="inline-form">
                    <input value={aiMessage} onChange={(event) => setAiMessage(event.target.value)} />
                    <button onClick={askAi}>Ask</button>
                  </div>
                  {aiReply && <p className="assistant-reply">{aiReply}</p>}
                </div>
              </section>
            </>
          )}

          {activeView === 'Tickets' && (
            <>
              <section className="grid tickets-grid">
                <div className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">Queue</span>
                      <h2>Tickets</h2>
                    </div>
                    <span className="count-pill">{tickets.length}</span>
                  </div>
                  <input placeholder="Search tickets" value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} />
                  <div className="ticket-list">
                    {tickets.map((ticket) => (
                      <button key={ticket.id} className={ticket.id === selectedTicket?.id ? 'selected' : ''} onClick={() => setSelectedTicket(ticket)}>
                        <strong>#{ticket.id} {ticket.title}</strong>
                        <span>{formatLabel(ticket.status)} / {ticket.priority}</span>
                      </button>
                    ))}
                    {!tickets.length && <EmptyState title="No tickets found" text="Try a different search or create a ticket." />}
                  </div>
                </div>

                <div className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">Case detail</span>
                      <h2>{selectedTicket?.title || 'Ticket detail'}</h2>
                    </div>
                  </div>
                  {selectedTicket ? (
                    <>
                      <div className="status-row">
                        {statuses.map((status) => (
                          <button key={status} className={selectedTicket.status === status ? 'active' : ''} onClick={() => updateStatus(status)}>
                            {formatLabel(status)}
                          </button>
                        ))}
                      </div>
                      <div className="detail-box">
                        <p>{selectedTicket.description || selectedTicket.category}</p>
                        <span>{selectedTicket.category} / {selectedTicket.priority}</span>
                      </div>
                      <div className="comments">
                        {comments.map((comment) => <p key={comment.id}>{comment.body}</p>)}
                        {!comments.length && <EmptyState title="No comments" text="Add the first update for this ticket." />}
                      </div>
                      <form className="inline-form" onSubmit={addComment}>
                        <input name="comment" placeholder="Add comment" />
                        <button type="submit">Add</button>
                      </form>
                    </>
                  ) : <EmptyState title="Select a ticket" text="Ticket details and comments will appear here." />}
                </div>
              </section>

              <section className="panel">
                <h2>Create ticket</h2>
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
            </>
          )}

          {activeView === 'Customers' && (
            <section className="grid">
              <div className="panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Directory</span>
                    <h2>Customers</h2>
                  </div>
                  <span className="count-pill">{customers.length}</span>
                </div>
                <div className="table-list">
                  {customers.map((customer) => (
                    <div key={customer.id} className="table-row">
                      <strong>{customer.name}</strong>
                      <span>{customer.email}</span>
                      <span>{customer.company || 'No company'}</span>
                    </div>
                  ))}
                  {!customers.length && <EmptyState title="No customers" text="Create a customer profile to start tracking cases." />}
                </div>
              </div>

              <form className="panel" onSubmit={createCustomer}>
                <h2>Add customer</h2>
                <input placeholder="Name" value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} />
                <input placeholder="Email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} />
                <input placeholder="Company" value={newCustomer.company} onChange={(event) => setNewCustomer({ ...newCustomer, company: event.target.value })} />
                <button type="submit">Create customer</button>
              </form>
            </section>
          )}

          {activeView === 'Services' && (
            <>
              <section className="grid">
                <div className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">Catalog</span>
                      <h2>Services</h2>
                    </div>
                    <span className="count-pill">{services.length}</span>
                  </div>
                  <div className="table-list">
                    {services.map((service) => (
                      <div key={service.id} className="table-row compact">
                        <strong>{service.name}</strong>
                        <span>Department #{service.departmentId || 'n/a'}</span>
                        <span>Service ID {service.id}</span>
                      </div>
                    ))}
                    {!services.length && <EmptyState title="No services" text="Create service catalog entries for support teams." />}
                  </div>
                </div>

                <form className="panel" onSubmit={createService}>
                  <h2>Add service</h2>
                  <input placeholder="Service name" value={newService.name} onChange={(event) => setNewService({ ...newService, name: event.target.value })} />
                  <input placeholder="Department ID" value={newService.departmentId} onChange={(event) => setNewService({ ...newService, departmentId: event.target.value })} />
                  <button type="submit">Create service</button>
                </form>
              </section>

              <section className="grid">
                <div className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">Response targets</span>
                      <h2>SLA policies</h2>
                    </div>
                    <span className="count-pill">{slaPolicies.length}</span>
                  </div>
                  <div className="table-list">
                    {slaPolicies.map((policy) => (
                      <div key={policy.id} className="table-row">
                        <strong>{policy.name}</strong>
                        <span>{policy.priority} priority</span>
                        <span>{policy.responseHours}h response / {policy.resolutionHours}h resolve</span>
                      </div>
                    ))}
                    {!slaPolicies.length && <EmptyState title="No SLA policies" text="Add SLA targets to make the service catalog operational." />}
                  </div>
                </div>

                <form className="panel" onSubmit={createSla}>
                  <h2>Add SLA policy</h2>
                  <input placeholder="Policy name" value={newSla.name} onChange={(event) => setNewSla({ ...newSla, name: event.target.value })} />
                  <select value={newSla.priority} onChange={(event) => setNewSla({ ...newSla, priority: event.target.value })}>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <input type="number" min="1" placeholder="Response hours" value={newSla.responseHours} onChange={(event) => setNewSla({ ...newSla, responseHours: Number(event.target.value) })} />
                  <input type="number" min="1" placeholder="Resolution hours" value={newSla.resolutionHours} onChange={(event) => setNewSla({ ...newSla, resolutionHours: Number(event.target.value) })} />
                  <button type="submit">Create SLA</button>
                </form>
              </section>
            </>
          )}

          {activeView === 'Knowledge' && (
            <section className="grid">
              <div className="panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Self service</span>
                    <h2>Knowledge articles</h2>
                  </div>
                  <span className="count-pill">{articles.length}</span>
                </div>
                <div className="article-list">
                  {articles.map((article) => (
                    <article key={article.id}>
                      <span>{article.category}</span>
                      <h3>{article.title}</h3>
                      <p>{article.body}</p>
                    </article>
                  ))}
                  {!articles.length && <EmptyState title="No articles" text="Publish common fixes to help agents resolve tickets faster." />}
                </div>
              </div>

              <form className="panel" onSubmit={createArticle}>
                <h2>New article</h2>
                <input placeholder="Title" value={newArticle.title} onChange={(event) => setNewArticle({ ...newArticle, title: event.target.value })} />
                <input placeholder="Category" value={newArticle.category} onChange={(event) => setNewArticle({ ...newArticle, category: event.target.value })} />
                <textarea placeholder="Body" value={newArticle.body} onChange={(event) => setNewArticle({ ...newArticle, body: event.target.value })} />
                <label className="checkbox-row">
                  <input type="checkbox" checked={newArticle.published} onChange={(event) => setNewArticle({ ...newArticle, published: event.target.checked })} />
                  Published
                </label>
                <button type="submit">Publish article</button>
              </form>
            </section>
          )}

          {activeView === 'Activity' && (
            <section className="grid">
              <div className="panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Audit trail</span>
                    <h2>Ticket history</h2>
                  </div>
                  <span className="count-pill">{histories.length}</span>
                </div>
                <div className="timeline">
                  {histories.map((history) => (
                    <div key={history.id}>
                      <strong>{formatLabel(history.action)}</strong>
                      <span>Ticket #{history.ticketId} {history.fromStatus ? `${formatLabel(history.fromStatus)} to ${formatLabel(history.toStatus)}` : formatLabel(history.toStatus)}</span>
                    </div>
                  ))}
                  {!histories.length && <EmptyState title="No history yet" text="Ticket changes will appear in this activity stream." />}
                </div>
              </div>

              <div className="panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Background queue</span>
                    <h2>Jobs</h2>
                  </div>
                  <span className="count-pill">{jobs.length}</span>
                </div>
                <div className="table-list">
                  {jobs.slice(-6).reverse().map((job) => (
                    <div key={job.id} className="table-row compact">
                      <strong>{job.type}</strong>
                      <span>{job.status}</span>
                      <span>{job.result || 'Pending'}</span>
                    </div>
                  ))}
                  {!jobs.length && <EmptyState title="No jobs" text="Automations and notifications will be queued here." />}
                </div>
                <form className="stack-form" onSubmit={enqueueJob}>
                  <input placeholder="Job type" value={newJob.type} onChange={(event) => setNewJob({ ...newJob, type: event.target.value })} />
                  <textarea value={newJob.payload} onChange={(event) => setNewJob({ ...newJob, payload: event.target.value })} />
                  <button type="submit">Queue job</button>
                </form>
              </div>
            </section>
          )}

          {activeView === 'Automation' && (
            <section className="grid">
              <form className="panel" onSubmit={searchAll}>
                <div>
                  <span className="eyebrow">Redis backed</span>
                  <h2>Search and cache</h2>
                </div>
                <div className="inline-form">
                  <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} />
                  <button type="submit">Search</button>
                </div>
                {searchResult && (
                  <div className="result-box">
                    <strong>{searchResult.cached ? 'Cached response' : 'Fresh response'}</strong>
                    <span>{searchResult.results.length} results returned</span>
                  </div>
                )}
              </form>

              <div className="panel">
                <div>
                  <span className="eyebrow">OpenAI endpoint</span>
                  <h2>AI assistant</h2>
                </div>
                <div className="inline-form">
                  <input value={aiMessage} onChange={(event) => setAiMessage(event.target.value)} />
                  <button onClick={askAi}>Ask</button>
                </div>
                {aiReply && <p className="assistant-reply">{aiReply}</p>}
              </div>
            </section>
          )}

          {activeView === 'Admin' && (
            <section className="grid">
              <div className="panel">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">Access control</span>
                    <h2>Users</h2>
                  </div>
                  <span className="count-pill">{users.length}</span>
                </div>
                <div className="table-list">
                  {users.map((row) => (
                    <div key={row.id} className="table-row">
                      <strong>{row.name}</strong>
                      <span>{row.email}</span>
                      <span>{row.role}</span>
                    </div>
                  ))}
                  {!users.length && <EmptyState title="No admin data" text="Admin users can review account access here." />}
                </div>
              </div>

              <div className="panel">
                <div>
                  <span className="eyebrow">System docs</span>
                  <h2>API coverage</h2>
                </div>
                <p className="muted">The backend exposes authenticated CRUD resources, search, AI chat, job queue and Swagger documentation.</p>
                <a className="button-link" href={`${API_BASE_URL}/api-docs`} target="_blank" rel="noreferrer">Open Swagger</a>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
