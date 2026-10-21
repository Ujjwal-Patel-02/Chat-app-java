import { avatarGradient, initials } from '../lib/format'

interface AvatarProps {
  name: string
  seed: string | number
  size?: number
  online?: boolean
  /** Overrides the initials, e.g. a group's emoji. */
  
  label?: string | null
  ring?: boolean
}

export function Avatar({ name, seed, size = 40, online, label, ring }: AvatarProps) {
  return (
    <span
      className={`avatar${ring ? ' avatar-ring' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (label ? 0.48 : 0.38)), backgroundImage: avatarGradient(seed) }}
      aria-hidden="true"
    >
      <span className="avatar-label">{label ?? initials(name)}</span>
      {online && <span className="presence-dot" style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }} />}
    </span>
  )
}
