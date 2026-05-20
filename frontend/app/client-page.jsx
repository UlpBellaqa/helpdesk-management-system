'use client'

import dynamic from 'next/dynamic'

const App = dynamic(() => import('../src/App.jsx'), {
  ssr: false,
  loading: () => <main className="app-loading">Loading workspace...</main>,
})

export default function ClientPage() {
  return <App />
}
