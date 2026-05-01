import { useContext } from 'react'
import { AuthContext } from './authStore.js'

export function useAuth() {
  return useContext(AuthContext)
}
