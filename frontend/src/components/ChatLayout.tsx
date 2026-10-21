import { useState } from 'react'
import { useChat } from '../context/ChatContext'
import { ChatWindow } from './ChatWindow'
import { EmptyState } from './EmptyState'
import { NewChatModal } from './NewChatModal'
import { Sidebar } from './Sidebar'

export function ChatLayout() {
  const { activeConversation } = useChat()
  const [showNewChat, setShowNewChat] = useState(false)

  return (
    <div className={`chat-layout${activeConversation ? ' has-active' : ''}`}>
      <Sidebar onNewChat={() => setShowNewChat(true)} />
      <main className="chat-main glass">
        {activeConversation ? (
          <ChatWindow key={activeConversation.id} conversation={activeConversation} />
        ) : (
          <EmptyState onNewChat={() => setShowNewChat(true)} />
        )}
      </main>
      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} />}
    </div>
  )
}
