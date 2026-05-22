'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

  const register = useCallback(async ({ name, email, password, companyName }) => {
    return apiRequest('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, companyName },
    })
  }, [])

  const updateUser = useCallback((user) => {
    localStorage.setItem('helpdesk_user', JSON.stringify(user))
    setSession((current) => ({ ...current, user }))
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('helpdesk_token')
    localStorage.removeItem('helpdesk_user')
    setSession({ token: '', user: null })
  }, [])

  useEffect(() => {
    if (!session.token) return
    let active = true

    async function refreshUser() {
      try {
        const user = await apiRequest('/api/auth/me', { token: session.token })
        if (active) updateUser(user)
      } catch {
        if (active) logout()
      }
    }

    refreshUser()
    return () => {
      active = false
    }
  }, [logout, session.token, updateUser])

  const value = useMemo(() => ({ ...session, login, logout, register, updateUser }), [login, logout, register, session, updateUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
