import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

const authState = {
  token: '',
  user: null,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updateUser: vi.fn(),
}

vi.mock('./state/useAuth.js', () => ({
  useAuth: () => authState,
}))

describe('App authentication screen', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    authState.token = ''
    authState.user = null
    authState.login = vi.fn()
    authState.logout = vi.fn()
    authState.register = vi.fn()
    authState.updateUser = vi.fn()
    localStorage.clear()
  })

  it('renders the sign-in form for anonymous users', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Helpdesk' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(2)
    expect(screen.getByPlaceholderText('admin@demo.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('admin123')).toBeInTheDocument()
  })

  it('submits credentials through the auth hook', async () => {
    const user = userEvent.setup()
    authState.login.mockResolvedValue({ token: 'token', user: { name: 'Admin User' } })
    render(<App />)

    await user.type(screen.getByPlaceholderText('admin@demo.com'), 'admin@demo.com')
    await user.type(screen.getByPlaceholderText('admin123'), 'admin123')
    await user.click(screen.getAllByRole('button', { name: 'Sign in' })[1])

    expect(authState.login).toHaveBeenCalledWith('admin@demo.com', 'admin123')
  })
})
