import { CornerUpLeft, Keyboard, MessageSquarePlus, SmilePlus } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { firstName } from '../lib/format'

export function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  const { me } = useChat()
  return (
    <div className="empty-state">
      <div className="empty-orb" aria-hidden="true">
        <span className="orb-ring r1" />
        <span className="orb-ring r2" />
        <span className="orb-core">💬</span>
      </div>
      <h2>
        Hey {firstName(me.displayName)}, <span className="gradient-text">say something nice.</span>
      </h2>
      <p>Pick a conversation on the left or start a new one. Everything syncs instantly across tabs and devices.</p>
      <button className="btn btn-primary" onClick={onNewChat}>
        <MessageSquarePlus size={18} /> New conversation
      </button>
      <ul className="tips">
        <li>
          <CornerUpLeft size={15} /> Hover a message to reply
        </li>
        <li>
          <SmilePlus size={15} /> React with any emoji
        </li>
        <li>
          <Keyboard size={15} /> Enter to send · Shift+Enter for a new line
        </li>
      </ul>
    </div>
  )
}
