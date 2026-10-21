export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="100%" height="100%">
          <defs>
            <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8b5cf6" />
              <stop offset="0.5" stopColor="#6366f1" />
              <stop offset="1" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="18" fill="url(#logo-gradient)" />
          <path
            d="M18 22c0-3.3 2.7-6 6-6h16c3.3 0 6 2.7 6 6v12c0 3.3-2.7 6-6 6H30l-8 7v-7.4c-2.3-.8-4-3-4-5.6V22z"
            fill="#fff"
            opacity=".95"
          />
          <circle cx="26" cy="28" r="2.6" fill="#6366f1" />
          <circle cx="32" cy="28" r="2.6" fill="#7c3aed" />
          <circle cx="38" cy="28" r="2.6" fill="#06b6d4" />
        </svg>
      </span>
      {!compact && <span className="logo-text">Ujjwal's App</span>}
    </span>
  )
}
