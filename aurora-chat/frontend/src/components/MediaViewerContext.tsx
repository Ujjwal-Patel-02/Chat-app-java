import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Attachment, UserSummary } from '../lib/types'

export interface ViewerItem {
  attachment: Attachment
  sender?: UserSummary
  createdAt?: string
  caption?: string | null
}

interface MediaViewerValue {
  open: (items: ViewerItem[], startIndex: number) => void
}

const MediaViewer = lazy(() => import('./MediaViewer'))
const MediaViewerContext = createContext<MediaViewerValue | null>(null)

export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null)
  const open = useCallback((items: ViewerItem[], index: number) => setViewer({ items, index }), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <MediaViewerContext.Provider value={value}>
      {children}
      {viewer && (
        <Suspense fallback={<div className="viewer viewer-loading" />}>
          <MediaViewer items={viewer.items} startIndex={viewer.index} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </MediaViewerContext.Provider>
  )
}

export function useMediaViewer(): MediaViewerValue {
  const context = useContext(MediaViewerContext)
  if (!context) throw new Error('useMediaViewer must be used inside <MediaViewerProvider>')
  return context
}
