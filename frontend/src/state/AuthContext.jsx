import { useMemo, useState } from 'react'
import { AuthContext } from './authStore.js'


export function AuthProvider({ children }) {
  const [session, setSession] = useState({
    token: localStorage.getItem('helpdesk_token') || '',
    user: JSON.parse(localStorage.getItem('helpdesk_user') || 'null'),
  })

  const login = async (email, password) => {
    const response = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!response.ok) throw new Error('Login failed')
    const data = await response.json()
    localStorage.setItem('helpdesk_token', data.token)
    localStorage.setItem('helpdesk_user', JSON.stringify(data.user))
    setSession(data)
    return data
  }

  const logout = () => {
    localStorage.removeItem('helpdesk_token')
    localStorage.removeItem('helpdesk_user')
    setSession({ token: '', user: null })
  }

  const value = useMemo(() => ({ ...session, login, logout }), [session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
