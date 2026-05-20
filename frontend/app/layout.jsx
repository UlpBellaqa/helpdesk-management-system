import '../src/index.css'
import { AuthProvider } from '../src/state/AuthContext.jsx'

export const metadata = {
  title: 'Helpdesk',
  description: 'Support operations workspace',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
