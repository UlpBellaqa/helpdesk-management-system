'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { API_BASE_URL, ApiRequestError, apiRequest } from './api.js'
import { useAuth } from './state/useAuth.js'

const statuses = ['open', 'triage', 'in_progress', 'waiting_customer', 'resolved', 'closed']
const navItems = ['Overview', 'Tickets', 'Customers', 'Knowledge', 'Services', 'Automation', 'Activity', 'Settings']
const maxAttachmentBytes = 5 * 1024 * 1024
const defaultPreferenceSettings = { defaultPriority: 'Medium', defaultCategory: 'Software', startPage: 'Overview', compactMode: false }
const defaultNotificationSettings = { emailAlerts: true, highPriorityAlerts: true, dailySummary: false }

function formatLabel(value) {
  return String(value || 'unassigned').replaceAll('_', ' ')
}

function formatBytes(bytes = 0) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function initials(name = 'HD') {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function readStoredJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  const saved = localStorage.getItem(key)
  return saved ? JSON.parse(saved) : fallback
}

function readStoredTheme() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('helpdesk-theme') === 'dark'
}

function userStorageKey(user, key) {
  return user?.id ? `helpdesk-${key}-settings:${user.id}` : `helpdesk-${key}-settings`
}

function userProfileSettings(user, fallback = {}) {
  const data = user?.data && typeof user.data === 'object' && !Array.isArray(user.data) ? user.data : {}
  return {
    name: user?.name || fallback.name || '',
    email: user?.email || fallback.email || '',
    role: user?.role || fallback.role || '',
    department: data.department || fallback.department || 'Support Operations',
    avatar: data.avatar || fallback.avatar || '',
  }
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const size = 384
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const minSide = Math.min(image.width, image.height)
        const sx = (image.width - minSide) / 2
        const sy = (image.height - minSide) / 2

        canvas.width = size
        canvas.height = size
        context.drawImage(image, sx, sy, minSide, minSide, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      }
      image.onerror = () => reject(new Error('Could not read this image.'))
      image.src = reader.result
    }
    reader.onerror = () => reject(new Error('Could not read this file.'))
    reader.readAsDataURL(file)
  })
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function SearchResultSummary({ result }) {
  if (!result) return null
  return (
    <div className="result-summary">
      <div>
        <strong>{result.results.length}</strong>
        <span>{result.results.length === 1 ? 'result' : 'results'}</span>
      </div>
      <p>{result.cached ? 'Returned from Redis cache.' : 'Returned from API search.'}</p>
    </div>
  )
}

function App() {
  const { token, user, login, logout, register, updateUser } = useAuth()
  const [activeView, setActiveView] = useState('Overview')
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', companyName: '' })
  const [darkMode, setDarkMode] = useState(readStoredTheme)
  const [settingsTab, setSettingsTab] = useState('Profile')
  const [profileSettings, setProfileSettings] = useState(() => userProfileSettings(user, readStoredJson(userStorageKey(user, 'profile'), {})))
  const [profileSaveStatus, setProfileSaveStatus] = useState('')
  const [preferenceSettings, setPreferenceSettings] = useState(() => readStoredJson(userStorageKey(user, 'preference'), defaultPreferenceSettings))
  const [notificationSettings, setNotificationSettings] = useState(() => readStoredJson(userStorageKey(user, 'notification'), defaultNotificationSettings))
  const [dashboard, setDashboard] = useState(null)
  const [tickets, setTickets] = useState([])
  const [customers, setCustomers] = useState([])
  const [articles, setArticles] = useState([])
  const [services, setServices] = useState([])
  const [jobs, setJobs] = useState([])
  const [histories, setHistories] = useState([])
  const [notifications, setNotifications] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [comments, setComments] = useState([])
  const [attachments, setAttachments] = useState([])
  const [attachmentStatus, setAttachmentStatus] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [aiMessage, setAiMessage] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [error, setError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'Medium', category: 'Software', customerName: '', customerEmail: '', customerCompany: '' })
  const [newArticle, setNewArticle] = useState({ title: '', body: '', category: 'General', published: true })
  const [newService, setNewService] = useState({ name: '', departmentId: '' })
  const [newJob, setNewJob] = useState({ type: 'email', payload: '{"reason":"manual follow-up"}' })

  const visibleNavItems = useMemo(() => {
    if (user?.role === 'customer') return navItems.filter((item) => !['Automation'].includes(item))
    return navItems
  }, [user])

  const openTickets = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status))
  const highPriorityTickets = tickets.filter((ticket) => ticket.priority === 'High')
  const selectedCustomer = customers.find((customer) => customer.id === selectedTicket?.customerId)
  const statusEntries = Object.entries(dashboard?.byStatus || {})
  const unreadNotifications = notifications.filter((notification) => notification.status !== 'read')

  useEffect(() => {
    localStorage.setItem('helpdesk-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (!user) return
    const timeout = window.setTimeout(() => {
      setProfileSettings(userProfileSettings(user, readStoredJson(userStorageKey(user, 'profile'), {})))
      setPreferenceSettings(readStoredJson(userStorageKey(user, 'preference'), defaultPreferenceSettings))
      setNotificationSettings(readStoredJson(userStorageKey(user, 'notification'), defaultNotificationSettings))
      setProfileSaveStatus('')
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [user])

  useEffect(() => {
    if (user) localStorage.setItem(userStorageKey(user, 'profile'), JSON.stringify(profileSettings))
  }, [profileSettings, user])

  useEffect(() => {
    if (user) localStorage.setItem(userStorageKey(user, 'preference'), JSON.stringify(preferenceSettings))
  }, [preferenceSettings, user])

  useEffect(() => {
    if (user) localStorage.setItem(userStorageKey(user, 'notification'), JSON.stringify(notificationSettings))
  }, [notificationSettings, user])

  async function reloadTickets() {
    const rows = await apiRequest(`/api/tickets?q=${encodeURIComponent(ticketSearch)}`, { token })
    setTickets(rows)
    setSelectedTicket((current) => rows.find((ticket) => ticket.id === current?.id) || rows[0] || null)
  }

  const loadWorkspace = useCallback(async () => {
    const [summary, customerRows, articleRows, serviceRows, jobRows, historyRows, notificationRows] = await Promise.all([
      apiRequest('/api/dashboard/summary', { token }),
      apiRequest('/api/customers', { token }),
      apiRequest('/api/articles', { token }),
      apiRequest('/api/services', { token }),
      apiRequest('/api/jobs', { token }),
      apiRequest('/api/histories', { token }),
      apiRequest('/api/notifications', { token }),
    ])
    setDashboard(summary)
    setCustomers(customerRows)
    setArticles(articleRows)
    setServices(serviceRows)
    setJobs(jobRows)
    setHistories(historyRows)
    setNotifications(notificationRows)
  }, [token])

  async function refreshWorkspace() {
    await Promise.all([loadWorkspace(), reloadTickets()])
  }

  const handleRequestError = useCallback((requestError) => {
    if (requestError instanceof ApiRequestError && requestError.status === 401) {
      logout()
      setError('Session expired. Please sign in again.')
      return
    }
    setError(requestError.message)
  }, [logout])

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
        if (active) handleRequestError(requestError)
      }
    }

    loadTickets()
    return () => {
      active = false
    }
  }, [handleRequestError, ticketSearch, token])

  useEffect(() => {
    if (!token) return
    let active = true

    async function load() {
      try {
        await loadWorkspace()
      } catch (requestError) {
        if (active) handleRequestError(requestError)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [handleRequestError, loadWorkspace, token])

  useEffect(() => {
    if (!token || !selectedTicket) return
    let active = true

    async function loadComments() {
      try {
        const [commentRows, attachmentRows] = await Promise.all([
          apiRequest(`/api/tickets/${selectedTicket.id}/comments`, { token }),
          apiRequest(`/api/tickets/${selectedTicket.id}/attachments`, { token }),
        ])
        if (active) {
          setComments(commentRows)
          setAttachments(attachmentRows)
        }
      } catch (requestError) {
        if (active) handleRequestError(requestError)
      }
    }

    loadComments()
    return () => {
      active = false
    }
  }, [handleRequestError, selectedTicket, token])

  async function submitLogin(event) {
    event.preventDefault()
    setError('')
    setAuthNotice('')
    try {
      await login(email, password)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createTicket(event) {
    event.preventDefault()
    if (!newTicket.title.trim()) return
    try {
      const ticket = await apiRequest('/api/tickets', {
        token,
        method: 'POST',
        body: {
          title: newTicket.title,
          description: newTicket.description,
          priority: newTicket.priority,
          category: newTicket.category,
          status: 'open',
          customer: {
            name: newTicket.customerName,
            email: newTicket.customerEmail,
            company: newTicket.customerCompany,
          },
        },
      })
      setNewTicket({ title: '', description: '', priority: 'Medium', category: 'Software', customerName: '', customerEmail: '', customerCompany: '' })
      setSelectedTicket(ticket)
      await refreshWorkspace()
    } catch (requestError) {
      handleRequestError(requestError)
    }
  }

  async function updateStatus(status) {
    if (!selectedTicket) return
    const ticket = await apiRequest(`/api/tickets/${selectedTicket.id}/status`, { token, method: 'PATCH', body: { status } })
    setSelectedTicket(ticket)
    await refreshWorkspace()
  }

  async function addComment(event) {
    event.preventDefault()
    const form = event.currentTarget
    const body = form.elements.comment.value.trim()
    if (!body || !selectedTicket) return
    const comment = await apiRequest(`/api/tickets/${selectedTicket.id}/comments`, { token, method: 'POST', body: { body } })
    form.reset()
    setComments((rows) => [...rows, comment])
  }

  async function deleteTicket(ticketId) {
    if (!window.confirm('Delete this ticket? This action cannot be undone.')) return
    await apiRequest(`/api/tickets/${ticketId}`, { token, method: 'DELETE' })
    setSelectedTicket(null)
    setComments([])
    setAttachments([])
    await refreshWorkspace()
  }

  async function deleteResource(resource, id, refresh = loadWorkspace) {
    if (!window.confirm(`Delete this ${resource.replace('-', ' ')}?`)) return
    await apiRequest(`/api/${resource}/${id}`, { token, method: 'DELETE' })
    await refresh()
  }

  async function deleteComment(commentId) {
    if (!selectedTicket || !window.confirm('Delete this comment?')) return
    await apiRequest(`/api/tickets/${selectedTicket.id}/comments/${commentId}`, { token, method: 'DELETE' })
    setComments((rows) => rows.filter((comment) => comment.id !== commentId))
    await loadWorkspace()
  }

  async function uploadTicketAttachments(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length || !selectedTicket) return

    const oversized = files.find((file) => file.size > maxAttachmentBytes)
    if (oversized) {
      setError(`${oversized.name} is too large. Attachments must be 5MB or smaller.`)
      return
    }

    setError('')
    setAttachmentStatus(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`)
    try {
      const created = []
      for (const file of files) {
        const url = await readFileAsDataUrl(file)
        const attachment = await apiRequest(`/api/tickets/${selectedTicket.id}/attachments`, {
          token,
          method: 'POST',
          body: {
            fileName: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            url,
          },
        })
        created.push(attachment)
      }
      setAttachments((rows) => [...rows, ...created])
      setAttachmentStatus('Uploaded')
      await loadWorkspace()
    } catch (requestError) {
      setAttachmentStatus('')
      handleRequestError(requestError)
    }
  }

  async function submitRegister(event) {
    event.preventDefault()
    setError('')
    setAuthNotice('')
    try {
      const data = await register(registerForm)
      const registeredEmail = data.user?.email || registerForm.email.trim().toLowerCase()
      setEmail(registeredEmail)
      setPassword('')
      setRegisterForm({ name: '', email: '', password: '', companyName: '' })
      setAuthMode('login')
      setAuthNotice(`Account created for ${registeredEmail}. Sign in to continue.`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function confirmLogout() {
    if (!window.confirm('Do you want to log out?')) return
    logout()
  }

  function resetLocalSettings() {
    if (!user) return
    localStorage.removeItem(userStorageKey(user, 'profile'))
    localStorage.removeItem(userStorageKey(user, 'preference'))
    localStorage.removeItem(userStorageKey(user, 'notification'))
    setProfileSettings(userProfileSettings(user))
    setPreferenceSettings(defaultPreferenceSettings)
    setNotificationSettings(defaultNotificationSettings)
  }

  async function deleteAttachment(attachmentId) {
    if (!selectedTicket || !window.confirm('Delete this attachment?')) return
    await apiRequest(`/api/tickets/${selectedTicket.id}/attachments/${attachmentId}`, { token, method: 'DELETE' })
    setAttachments((rows) => rows.filter((attachment) => attachment.id !== attachmentId))
    await loadWorkspace()
  }

  async function createArticle(event) {
    event.preventDefault()
    if (!newArticle.title.trim() || !newArticle.body.trim()) return
    await apiRequest('/api/articles', { token, method: 'POST', body: newArticle })
    setNewArticle({ title: '', body: '', category: 'General', published: true })
    await loadWorkspace()
  }

  async function createService(event) {
    event.preventDefault()
    if (!newService.name.trim()) return
    await apiRequest('/api/services', { token, method: 'POST', body: newService })
    setNewService({ name: '', departmentId: '' })
    await loadWorkspace()
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
    await loadWorkspace()
  }

  async function markNotificationRead(notificationId) {
    const updated = await apiRequest(`/api/notifications/${notificationId}/read`, { token, method: 'PATCH' })
    setNotifications((rows) => rows.map((row) => row.id === updated.id ? updated : row))
  }

  async function deleteNotification(notificationId) {
    await apiRequest(`/api/notifications/${notificationId}`, { token, method: 'DELETE' })
    setNotifications((rows) => rows.filter((row) => row.id !== notificationId))
  }

  async function searchAll(event) {
    event.preventDefault()
    if (!globalSearch.trim()) return
    setSearchResult(await apiRequest(`/api/search?q=${encodeURIComponent(globalSearch)}`, { token }))
  }

  async function askAi() {
    if (!aiMessage.trim()) return
    setError('')
    setAiReply('')
    try {
      const data = await apiRequest('/api/ai/chat', { token, method: 'POST', body: { message: aiMessage } })
      setAiReply(data.reply)
    } catch (requestError) {
      handleRequestError(requestError)
    }
  }

  async function uploadProfilePhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file for your profile photo.')
      return
    }

    setError('')
    try {
      const avatar = await resizeAvatar(file)
      setProfileSettings((settings) => ({ ...settings, avatar }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveProfileSettings() {
    setError('')
    setProfileSaveStatus('Saving...')
    try {
      const updated = await apiRequest('/api/auth/me', {
        token,
        method: 'PATCH',
        body: {
          name: profileSettings.name,
          email: profileSettings.email,
          department: profileSettings.department,
          avatar: profileSettings.avatar,
        },
      })
      updateUser(updated)
      setProfileSaveStatus('Saved')
    } catch (requestError) {
      setProfileSaveStatus('')
      handleRequestError(requestError)
    }
  }

  if (!token) {
    return (
      <main className={`login-page ${darkMode ? 'theme-dark' : ''}`}>
        <form className="login-card" onSubmit={authMode === 'login' ? submitLogin : submitRegister}>
          <div className="login-brand"><span>HD</span><div><h1>Helpdesk</h1><p>{authMode === 'login' ? 'Sign in to continue.' : 'Create a new workspace account.'}</p></div></div>
          <div className="auth-tabs">
            <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setError(''); setAuthNotice('') }}>Sign in</button>
            <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setError(''); setAuthNotice('') }}>Sign up</button>
          </div>
          {authMode === 'login' ? (
            <>
              <label>Email<input placeholder="admin@demo.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input placeholder="admin123" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <div className="demo-credentials"><span>Demo login</span><button className="button-link" type="button" onClick={() => { setEmail('admin@demo.com'); setPassword('admin123') }}>Use admin@demo.com</button></div>
            </>
          ) : (
            <>
              <label>Full name<input placeholder="Your name" value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} /></label>
              <label>Company<input placeholder="Company or workspace" value={registerForm.companyName} onChange={(event) => setRegisterForm({ ...registerForm, companyName: event.target.value })} /></label>
              <label>Email<input placeholder="you@company.com" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} /></label>
              <label>Password<input placeholder="At least 6 characters" type="password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} /></label>
            </>
          )}
          <div className="actions"><button type="submit">{authMode === 'login' ? 'Sign in' : 'Create account'}</button><button className="secondary-button" type="button" onClick={() => setDarkMode((value) => !value)}>{darkMode ? 'Light' : 'Dark'}</button></div>
          {authNotice && <p className="success">{authNotice}</p>}
          {error && <p className="error">{error}</p>}
        </form>
      </main>
    )
  }

  return (
    <main className={`app ${darkMode ? 'theme-dark' : ''}`}>
      <aside className="sidebar">
        <div className="brand"><span>HD</span><strong>Helpdesk</strong></div>
        <nav className="main-nav">
          {visibleNavItems.map((item) => (
            <button key={item} className={activeView === item ? 'active' : ''} onClick={() => { setActiveView(item); if (item === 'Settings') setSettingsTab('Profile') }}>
              {item === 'Settings' && <span className="nav-icon settings-mark" aria-hidden="true" />}
              {item}
            </button>
          ))}
        </nav>
        <button className="sidebar-user" onClick={() => { setActiveView('Settings'); setSettingsTab('Profile') }}>
          <strong>{user.name}</strong>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><h1>{activeView}</h1><p>{openTickets.length} open tickets / {highPriorityTickets.length} high priority / {unreadNotifications.length} unread notifications</p></div>
          <div className="actions"><button className="secondary-button" onClick={() => setDarkMode((value) => !value)}>{darkMode ? 'Light' : 'Dark'}</button></div>
        </header>

        {error && <p className="error">{error}</p>}

        {activeView === 'Overview' && (
          <>
            <section className="metric-grid">
              <div className="card metric"><span>Open</span><strong>{openTickets.length}</strong></div>
              <div className="card metric"><span>Customers</span><strong>{customers.length}</strong></div>
              <div className="card metric"><span>Articles</span><strong>{articles.length}</strong></div>
              <div className="card metric"><span>Jobs</span><strong>{jobs.length}</strong></div>
            </section>
            <section className="grid-two">
              <div className="card"><div className="card-head"><h2>Ticket status</h2></div><div className="status-list">{statusEntries.map(([status, count]) => <div key={status}><span>{formatLabel(status)}</span><strong>{count}</strong></div>)} {!statusEntries.length && <EmptyState title="No queue activity" text="Ticket status data will appear here when work begins." />}</div></div>
              <div className="card"><div className="card-head"><h2>Recent tickets</h2></div><div className="stack-list">{(dashboard?.recentTickets || tickets.slice(0, 5)).map((ticket) => <button key={ticket.id} onClick={() => { setSelectedTicket(ticket); setActiveView('Tickets') }}><strong>{ticket.title}</strong><span>{formatLabel(ticket.status)} / {ticket.priority}</span></button>)}</div></div>
            </section>
          </>
        )}

        {activeView === 'Tickets' && (
          <section className="tickets-layout">
            <div className="card list-card">
              <div className="card-head"><h2>Queue</h2><span>{tickets.length}</span></div>
              <input placeholder="Search tickets" value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} />
              <div className="ticket-list">{tickets.map((ticket) => <button key={ticket.id} className={ticket.id === selectedTicket?.id ? 'selected' : ''} onClick={() => setSelectedTicket(ticket)}><strong>{ticket.title}</strong><span>{ticket.priority} / {formatLabel(ticket.status)}</span></button>)} {!tickets.length && <EmptyState title="Queue is empty" text="New support requests will appear here." />}</div>
            </div>

            <div className="card detail-card">
              {selectedTicket ? (
                <>
                  <div className="detail-head"><div><span>Ticket #{selectedTicket.id}</span><h2>{selectedTicket.title}</h2></div><div className="detail-actions"><strong>{formatLabel(selectedTicket.status)}</strong><button className="danger-button" onClick={() => deleteTicket(selectedTicket.id)}>Delete</button></div></div>
                  <p className="description">{selectedTicket.description || 'No description provided.'}</p>
                  <div className="meta-grid"><div><span>Priority</span><strong>{selectedTicket.priority}</strong></div><div><span>Category</span><strong>{selectedTicket.category || 'General'}</strong></div><div><span>Customer</span><strong>{selectedCustomer?.name || 'Unassigned'}</strong></div></div>
                  <div className="status-row">{statuses.map((status) => <button key={status} className={selectedTicket.status === status ? 'active' : ''} onClick={() => updateStatus(status)}>{formatLabel(status)}</button>)}</div>
                  <div className="attachments">
                    <div className="section-head">
                      <h3>Attachments</h3>
                      <label className="upload-button compact-upload">
                        Upload
                        <input type="file" multiple onChange={uploadTicketAttachments} />
                      </label>
                    </div>
                    {attachments.map((attachment) => (
                      <div key={attachment.id} className="attachment-row">
                        <div>
                          <strong>{attachment.fileName}</strong>
                          <span>{formatBytes(attachment.data?.size)} / {attachment.data?.type || 'file'}</span>
                        </div>
                        <div className="attachment-actions">
                          <a className="button-link" href={attachment.url} target="_blank" rel="noreferrer">Open</a>
                          <a className="button-link" href={attachment.url} download={attachment.fileName}>Download</a>
                          <button className="danger-button ghost-danger" onClick={() => deleteAttachment(attachment.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                    {!attachments.length && <EmptyState title="No attachments" text="Upload screenshots, logs, invoices, or any file needed to resolve this ticket." />}
                    {attachmentStatus && <span className="save-status">{attachmentStatus}</span>}
                  </div>
                  <div className="comments"><h3>Comments</h3>{comments.map((comment) => <div key={comment.id} className="comment-row with-action"><p>{comment.body}</p><button className="danger-button ghost-danger" onClick={() => deleteComment(comment.id)}>Delete</button></div>)} {!comments.length && <EmptyState title="No comments" text="Add the first update." />}</div>
                  <form className="inline-form" onSubmit={addComment}><input name="comment" placeholder="Add comment..." /><button type="submit">Add</button></form>
                </>
              ) : <EmptyState title="Select a ticket" text="Details will appear here." />}
            </div>

            <form className="card side-card" onSubmit={createTicket}>
              <h2>New ticket</h2>
              <input placeholder="Title" value={newTicket.title} onChange={(event) => setNewTicket({ ...newTicket, title: event.target.value })} />
              <textarea placeholder="Description" value={newTicket.description} onChange={(event) => setNewTicket({ ...newTicket, description: event.target.value })} />
              <select value={newTicket.priority} onChange={(event) => setNewTicket({ ...newTicket, priority: event.target.value })}><option>High</option><option>Medium</option><option>Low</option></select>
              <input placeholder="Category" value={newTicket.category} onChange={(event) => setNewTicket({ ...newTicket, category: event.target.value })} />
              <div className="form-section">
                <h3>Customer</h3>
                <input placeholder="Customer name" value={newTicket.customerName} onChange={(event) => setNewTicket({ ...newTicket, customerName: event.target.value })} />
                <input placeholder="Customer email" value={newTicket.customerEmail} onChange={(event) => setNewTicket({ ...newTicket, customerEmail: event.target.value })} />
                <input placeholder="Company" value={newTicket.customerCompany} onChange={(event) => setNewTicket({ ...newTicket, customerCompany: event.target.value })} />
              </div>
              <button type="submit">Create ticket</button>
            </form>
          </section>
        )}

        {activeView === 'Customers' && (
          <section>
            <div className="card"><div className="card-head"><h2>Customers</h2><span>{customers.length}</span></div><div className="table-list">{customers.map((customer) => <div key={customer.id} className="table-row with-action"><strong>{customer.name}</strong><span>{customer.email}</span><span>{customer.company || 'No company'}</span><button className="danger-button ghost-danger" onClick={() => deleteResource('customers', customer.id)}>Delete</button></div>)}</div></div>
          </section>
        )}

        {activeView === 'Knowledge' && (
          <section className="grid-main-side">
            <div className="card"><div className="card-head"><h2>Knowledge base</h2><span>{articles.length}</span></div><div className="article-list">{articles.map((article) => <article key={article.id}><div className="article-head"><span>{article.category}</span></div><h3>{article.title}</h3><p>{article.body}</p></article>)}</div></div>
            <form className="card side-card" onSubmit={createArticle}><h2>New article</h2><input placeholder="Title" value={newArticle.title} onChange={(event) => setNewArticle({ ...newArticle, title: event.target.value })} /><input placeholder="Category" value={newArticle.category} onChange={(event) => setNewArticle({ ...newArticle, category: event.target.value })} /><textarea placeholder="Body" value={newArticle.body} onChange={(event) => setNewArticle({ ...newArticle, body: event.target.value })} /><button type="submit">Publish</button></form>
          </section>
        )}

        {activeView === 'Services' && (
          <section className="grid-main-side">
            <div className="card"><div className="card-head"><h2>Services</h2><span>{services.length}</span></div><div className="table-list">{services.map((service) => <div key={service.id} className="resource-row with-action"><div><strong>{service.name}</strong><span>Department #{service.departmentId || 'n/a'} / Service</span></div><button className="danger-button ghost-danger" onClick={() => deleteResource('services', service.id)}>Delete</button></div>)}</div></div>
            <div className="side-stack"><form className="card side-card" onSubmit={createService}><h2>Add service</h2><input placeholder="Service name" value={newService.name} onChange={(event) => setNewService({ ...newService, name: event.target.value })} /><input placeholder="Department ID" value={newService.departmentId} onChange={(event) => setNewService({ ...newService, departmentId: event.target.value })} /><button type="submit">Create</button></form></div>
          </section>
        )}

        {activeView === 'Automation' && (
          <section className="grid-two">
            <form className="card" onSubmit={searchAll}><div className="card-head"><h2>Search and cache</h2>{searchResult && <span>{searchResult.cached ? 'Cached' : 'Fresh'}</span>}</div><div className="inline-form"><input placeholder="Search tickets, customers, articles..." value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} /><button type="submit">Search</button></div><SearchResultSummary result={searchResult} /></form>
            <div className="card"><div className="card-head"><h2>AI assistant</h2></div><textarea placeholder="Ask about ticket priority, customer follow-up, queue risks..." value={aiMessage} onChange={(event) => setAiMessage(event.target.value)} /><button onClick={askAi}>Ask assistant</button>{aiReply && <div className="assistant-reply">{aiReply}</div>}</div>
          </section>
        )}

        {activeView === 'Activity' && (
          <section className="grid-main-side">
            <div className="card"><div className="card-head"><h2>Ticket history</h2><span>{histories.length}</span></div><div className="timeline">{histories.map((history) => <div key={history.id}><strong>{formatLabel(history.action)}</strong><span>Ticket #{history.ticketId}</span></div>)}</div></div>
            <form className="card side-card" onSubmit={enqueueJob}><h2>Queue job</h2><input value={newJob.type} onChange={(event) => setNewJob({ ...newJob, type: event.target.value })} /><textarea value={newJob.payload} onChange={(event) => setNewJob({ ...newJob, payload: event.target.value })} /><button type="submit">Queue</button><div className="table-list">{jobs.slice(-4).reverse().map((job) => <div key={job.id} className="table-row with-action"><strong>{job.type}</strong><span>{job.status}</span><span>{job.result || 'Pending'}</span></div>)}</div></form>
          </section>
        )}

        {activeView === 'Settings' && (
          <section className="settings-page">
            <div className="card settings-shell">
              <div className="card-head"><div><h2>Settings</h2><p className="muted">Manage your profile, workspace preferences and notification defaults.</p></div><button className="danger-outline-button" type="button" onClick={confirmLogout}>Logout</button></div>
              <div className="settings-tabs">
                {['Profile', 'Preferences', 'Notifications', 'System'].map((tab) => <button key={tab} className={settingsTab === tab ? 'active' : ''} onClick={() => setSettingsTab(tab)}>{tab}</button>)}
              </div>

              {settingsTab === 'Profile' && (
                <div className="settings-section">
                  <div className="profile-header">
                    <div className="profile-avatar">
                      {profileSettings.avatar ? <img src={profileSettings.avatar} alt="" /> : <span>{initials(profileSettings.name || user.name)}</span>}
                    </div>
                    <div>
                      <strong>{profileSettings.name || user.name}</strong>
                      <small>{profileSettings.email || user.email}</small>
                    </div>
                  </div>
                  <div className="profile-photo-actions">
                    <label className="upload-button">
                      Upload photo
                      <input type="file" accept="image/*" onChange={uploadProfilePhoto} />
                    </label>
                    {profileSettings.avatar && <button className="secondary-button" type="button" onClick={() => setProfileSettings({ ...profileSettings, avatar: '' })}>Remove photo</button>}
                    <button type="button" onClick={saveProfileSettings}>Save profile</button>
                    {profileSaveStatus && <span className="save-status">{profileSaveStatus}</span>}
                  </div>
                  <div className="settings-form-grid">
                    <label>Full name<input value={profileSettings.name || user.name || ''} onChange={(event) => setProfileSettings({ ...profileSettings, name: event.target.value })} /></label>
                    <label>Email<input value={profileSettings.email || user.email || ''} onChange={(event) => setProfileSettings({ ...profileSettings, email: event.target.value })} /></label>
                    <label>Role<input value={profileSettings.role || user.role || ''} disabled /></label>
                    <label>Department<input value={profileSettings.department} onChange={(event) => setProfileSettings({ ...profileSettings, department: event.target.value })} /></label>
                  </div>
                </div>
              )}

              {settingsTab === 'Preferences' && (
                <div className="settings-section">
                  <label className="setting-row"><span><strong>Dark mode</strong><small>Switch between light and dark workspace themes.</small></span><input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} /></label>
                  <label className="setting-row"><span><strong>Compact mode</strong><small>Use tighter spacing for dense ticket work.</small></span><input type="checkbox" checked={preferenceSettings.compactMode} onChange={(event) => setPreferenceSettings({ ...preferenceSettings, compactMode: event.target.checked })} /></label>
                  <div className="settings-form-grid">
                    <label>Start page<select value={preferenceSettings.startPage} onChange={(event) => setPreferenceSettings({ ...preferenceSettings, startPage: event.target.value })}>{visibleNavItems.map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label>Default priority<select value={preferenceSettings.defaultPriority} onChange={(event) => setPreferenceSettings({ ...preferenceSettings, defaultPriority: event.target.value })}><option>High</option><option>Medium</option><option>Low</option></select></label>
                    <label>Default category<input value={preferenceSettings.defaultCategory} onChange={(event) => { setPreferenceSettings({ ...preferenceSettings, defaultCategory: event.target.value }); setNewTicket((ticket) => ({ ...ticket, category: event.target.value })) }} /></label>
                  </div>
                </div>
              )}

              {settingsTab === 'Notifications' && (
                <div className="settings-section">
                  <label className="setting-row"><span><strong>Email alerts</strong><small>Receive updates when tickets are created or changed.</small></span><input type="checkbox" checked={notificationSettings.emailAlerts} onChange={(event) => setNotificationSettings({ ...notificationSettings, emailAlerts: event.target.checked })} /></label>
                  <label className="setting-row"><span><strong>High priority alerts</strong><small>Highlight urgent tickets as soon as they enter the queue.</small></span><input type="checkbox" checked={notificationSettings.highPriorityAlerts} onChange={(event) => setNotificationSettings({ ...notificationSettings, highPriorityAlerts: event.target.checked })} /></label>
                  <label className="setting-row"><span><strong>Daily summary</strong><small>Prepare a daily overview of open tickets and queue health.</small></span><input type="checkbox" checked={notificationSettings.dailySummary} onChange={(event) => setNotificationSettings({ ...notificationSettings, dailySummary: event.target.checked })} /></label>
                  <div className="section-head"><h3>Inbox</h3><span className="save-status">{unreadNotifications.length} unread</span></div>
                  <div className="notification-list">
                    {notifications.map((notification) => (
                      <div key={notification.id} className={`notification-row ${notification.status !== 'read' ? 'unread' : ''}`}>
                        <div>
                          <strong>{notification.data?.title || formatLabel(notification.type)}</strong>
                          <span>{formatLabel(notification.type)} / {notification.status || 'unread'}</span>
                        </div>
                        <p>{notification.payload?.title || notification.payload?.fileName || notification.payload?.email || `Ticket #${notification.payload?.ticketId || 'n/a'}`}</p>
                        <div className="notification-actions">
                          {notification.status !== 'read' && <button className="secondary-button" type="button" onClick={() => markNotificationRead(notification.id)}>Mark read</button>}
                          <button className="danger-button ghost-danger" type="button" onClick={() => deleteNotification(notification.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                    {!notifications.length && <EmptyState title="No notifications" text="Ticket and admin events will appear here." />}
                  </div>
                </div>
              )}

              {settingsTab === 'System' && (
                <div className="settings-section">
                  <div className="settings-info-grid">
                    <div><span>API base URL</span><strong>{API_BASE_URL}</strong></div>
                    <div><span>Theme</span><strong>{darkMode ? 'Dark' : 'Light'}</strong></div>
                    <div><span>Signed in as</span><strong>{user.email}</strong></div>
                    <div><span>Role</span><strong>{user.role}</strong></div>
                  </div>
                  <div className="actions"><button className="secondary-button" onClick={resetLocalSettings}>Reset local settings</button><button className="danger-outline-button" type="button" onClick={confirmLogout}>Logout</button></div>
                </div>
              )}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
