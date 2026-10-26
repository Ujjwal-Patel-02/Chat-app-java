import { lazy, Suspense, useState } from 'react'
import { useChat } from '../context/ChatContext'
import { ChatWindow } from './ChatWindow'
import { EmptyState } from './EmptyState'
import { InAppNotifications } from './InAppNotifications'
import { MediaViewerProvider } from './MediaViewerContext'
import { Sidebar } from './Sidebar'

const NewChatModal = lazy(() => import('./NewChatModal').then((m) => ({ default: m.NewChatModal })))
const SettingsSheet = lazy(() => import('./SettingsSheet').then((m) => ({ default: m.SettingsSheet })))

export function ChatLayout() {
  const { activeConversation, selectConversation } = useChat()
  const [showNewChat, setShowNewChat] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <MediaViewerProvider>
      <div className={`chat-layout${activeConversation ? ' has-active' : ''}`}>
        <Sidebar onNewChat={() => setShowNewChat(true)} onOpenSettings={() => setShowSettings(true)} />
        <main className="chat-main glass">
          {activeConversation ? (
            <ChatWindow key={activeConversation.id} conversation={activeConversation} />
          ) : (
            <EmptyState onNewChat={() => setShowNewChat(true)} />
          )}
        </main>
        <Suspense fallback={null}>
          {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
          {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
        </Suspense>
        <InAppNotifications onOpen={(id) => selectConversation(id, activeConversation ? 'replace' : 'push')} />
      </div>
    </MediaViewerProvider>
  )
}
