import { AuthProvider, useAuth } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { AuroraBackground } from './components/AuroraBackground'
import { AuthScreen } from './components/AuthScreen'
import { ChatLayout } from './components/ChatLayout'
import { Logo } from './components/Logo'
import { ServerStatusBanner } from './components/ServerStatusBanner'

function Splash() {
  return (
    <div className="splash">
      <div className="splash-logo">
        <Logo compact />
      </div>
      <p>Connecting to Aurora…</p>
    </div>
  )
}

function Root() {
  const { user, initializing } = useAuth()
  if (initializing) return <Splash />
  if (!user) return <AuthScreen />
  return (
    <ChatProvider key={user.id}>
      <ChatLayout />
    </ChatProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuroraBackground />
        <div className="app-shell">
          <ServerStatusBanner />
          <AuthProvider>
            <Root />
          </AuthProvider>
        </div>
      </ToastProvider>
    </ThemeProvider>
  )
}
