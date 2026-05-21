'use client'

import { useCallback, useMemo, useState } from 'react'
import { AuthContext } from './authStore.js'
import { apiRequest } from '../api.js'


export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    if (typeof window === 'undefined') return { token: '', user: null }
    return {
      token: localStorage.getItem('helpdesk_token') || '',
      user: JSON.parse(localStorage.getItem('helpdesk_user') || 'null'),
    }
  })

  const login = useCallback(async (email, password) => {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    localStorage.setItem('helpdesk_token', data.token)
    localStorage.setItem('helpdesk_user', JSON.stringify(data.user))
    setSession(data)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('helpdesk_token')
    localStorage.removeItem('helpdesk_user')
    setSession({ token: '', user: null })
  }, [])

  const value = useMemo(() => ({ ...session, login, logout }), [login, logout, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
