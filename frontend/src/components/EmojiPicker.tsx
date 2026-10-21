import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { EMOJI_CATEGORIES } from '../lib/emoji'
import { Popover } from './Popover'

interface EmojiPickerProps {
  anchor: HTMLElement | null
  onPick: (emoji: string) => void
  onClose: () => void
  placement?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
}

const KEYWORDS: Record<string, string> = {
  '😂': 'laugh lol funny tears', '🤣': 'rofl laugh', '😍': 'love heart eyes', '🥰': 'love', '😎': 'cool sunglasses',
  '😭': 'cry sob sad', '😢': 'sad tear', '😡': 'angry mad', '🤔': 'think hmm', '😴': 'sleep tired', '🥳': 'party celebrate',
  '👍': 'like yes ok thumbs up', '👎': 'no dislike thumbs down', '👏': 'clap applause', '🙏': 'thanks please pray',
  '🙌': 'hooray praise', '💪': 'strong muscle', '👀': 'eyes look', '❤️': 'heart love red', '🔥': 'fire lit hot',
  '🎉': 'party tada celebrate', '✨': 'sparkles magic', '🚀': 'rocket launch ship', '✅': 'done check yes', '❌': 'no cross',
  '💯': 'hundred perfect', '☕': 'coffee', '🍕': 'pizza', '🎂': 'birthday cake', '🌈': 'rainbow', '⭐': 'star',
}

export function EmojiPicker({ anchor, onPick, onClose, placement = 'top', align = 'end' }: EmojiPickerProps) {
  const [category, setCategory] = useState(0)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return EMOJI_CATEGORIES[category].emojis
    const all = EMOJI_CATEGORIES.flatMap((c) =>
      c.emojis.map((emoji) => ({ emoji, text: `${c.name} ${KEYWORDS[emoji] ?? ''}`.toLowerCase() })),
    )
    return all.filter((item) => item.text.includes(q) || item.emoji === q).map((item) => item.emoji)
  }, [category, query])

  return (
    <Popover anchor={anchor} onClose={onClose} placement={placement} align={align} className="emoji-picker">
      <div className="emoji-search">
        <Search size={15} />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search emoji" />
      </div>
      {!query && (
        <div className="emoji-tabs" role="tablist">
          {EMOJI_CATEGORIES.map((c, index) => (
            <button
              key={c.name}
              type="button"
              role="tab"
              aria-selected={index === category}
              className={`emoji-tab${index === category ? ' active' : ''}`}
              onClick={() => setCategory(index)}
              title={c.name}
            >
              {c.icon}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-grid">
        {results.length === 0 && <p className="emoji-empty">No emoji found</p>}
        {results.map((emoji) => (
          <button key={emoji} type="button" className="emoji-cell" onClick={() => onPick(emoji)} aria-label={emoji}>
            {emoji}
          </button>
        ))}
      </div>
    </Popover>
  )
}
