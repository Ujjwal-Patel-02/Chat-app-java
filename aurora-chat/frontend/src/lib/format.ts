import type { Conversation, User } from './types'

const GRADIENTS = [
  ['#8b5cf6', '#6366f1'],
  ['#ec4899', '#8b5cf6'],
  ['#06b6d4', '#3b82f6'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#06b6d4'],
  ['#6366f1', '#06b6d4'],
  ['#f43f5e', '#f59e0b'],
  ['#14b8a6', '#8b5cf6'],
  ['#a855f7', '#ec4899'],
  ['#3b82f6', '#10b981'],
]

function hash(value: string): number {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function avatarGradient(seed: string | number): string {
  const [from, to] = GRADIENTS[hash(String(seed)) % GRADIENTS.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}

/** "Maya Patel" → "MP", "🚀 Launch Squad" → "LS". */
export function initials(name: string): string {
  const words = name.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? []
  if (words.length === 0) return Array.from(name.trim())[0] ?? '?'
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0])
  return letters.join('').toUpperCase()
}

/** Leading emoji of a name ("🚀 Launch Squad" → "🚀"), used as a group avatar. */
export function leadingEmoji(name: string): string | null {
  const match = name.trim().match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/u)
  return match ? match[1] : null
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const longDayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const fullDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const daysAgo = (date: Date) => Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso))
}

/** Compact timestamp for the conversation list. */
export function formatListTime(iso: string): string {
  const date = new Date(iso)
  const diff = daysAgo(date)
  if (diff <= 0) return timeFormat.format(date)
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return weekdayFormat.format(date)
  if (date.getFullYear() === new Date().getFullYear()) return shortDateFormat.format(date)
  return fullDateFormat.format(date)
}

/** Label for day separators inside a conversation. */
export function dayLabel(iso: string): string {
  const date = new Date(iso)
  const diff = daysAgo(date)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (date.getFullYear() === new Date().getFullYear()) return longDayFormat.format(date)
  return fullDateFormat.format(date)
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b))
}

export function lastSeenLabel(iso: string | null): string {
  if (!iso) return 'Offline'
  const date = new Date(iso)
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'Last seen just now'
  if (minutes < 60) return `Last seen ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && daysAgo(date) === 0) return `Last seen ${hours}h ago`
  if (daysAgo(date) === 1) return `Last seen yesterday at ${timeFormat.format(date)}`
  return `Last seen ${shortDateFormat.format(date)}`
}

export function conversationTitle(conversation: Conversation, meId: number): string {
  if (conversation.type === 'GROUP') return conversation.name ?? 'Group'
  return otherMember(conversation, meId)?.displayName ?? 'Conversation'
}

export function otherMember(conversation: Conversation, meId: number): User | undefined {
  return conversation.members.find((member) => member.id !== meId) ?? conversation.members[0]
}

export function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : null

/** 1–3 emoji with no other text get rendered large, like in modern messengers. */
export function isJumboEmoji(text: string | null): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!/^[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\s]+$/u.test(trimmed)) return false
  if (/^[\d#*\s]+$/.test(trimmed)) return false
  const count = segmenter
    ? Array.from(segmenter.segment(trimmed.replace(/\s/g, ''))).length
    : Array.from(trimmed.replace(/\s/g, '')).length
  return count > 0 && count <= 3
}

export function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
