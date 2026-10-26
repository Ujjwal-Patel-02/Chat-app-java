import { API_URL } from './config'
import { displaySrc } from './media'
import type { Attachment } from './types'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}
const PREFETCH_LIMIT_BYTES = 30 * 1024 * 1024
const CACHE_SIZE = 8

export interface SaveItem {
  attachment: Attachment
  createdAt?: string
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

const pad = (n: number) => String(n).padStart(2, '0')

/** "aurora-20261026-153812-1a2b.jpg": neutral, sortable and never the sender's own file name. */
export function fileNameFor(attachment: Attachment, createdAt?: string): string {
  const date = createdAt ? new Date(createdAt) : new Date()
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  const extension = EXTENSIONS[attachment.mimeType] ?? (attachment.kind === 'VIDEO' ? 'mp4' : 'jpg')
  return `aurora-${stamp}-${attachment.id.replace(/[^a-z0-9]/gi, '').slice(0, 4)}.${extension}`
}

/** Server URL that answers with "Content-Disposition: attachment" (works without CORS, also for Cloudinary files). */
export function serverDownloadUrl(attachment: Attachment): string | null {
  if (attachment.uploadId || /^(blob:|data:)/.test(attachment.url)) return null
  return `${API_URL}/api/media/${encodeURIComponent(attachment.id)}?download=true`
}

// Small LRU cache so "Save" can hand files to the share sheet right after a tap (Safari requires that).
const blobs = new Map<string, Promise<Blob>>()

function getBlob(attachment: Attachment): Promise<Blob> {
  const cached = blobs.get(attachment.id)
  if (cached) {
    blobs.delete(attachment.id)
    blobs.set(attachment.id, cached)
    return cached
  }
  const src = displaySrc(attachment, 'full')
  const promise = (async () => {
    if (!src) throw new Error('No file')
    const response = await fetch(src, { mode: 'cors', credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.blob()
  })()
  promise.catch(() => blobs.delete(attachment.id))
  blobs.set(attachment.id, promise)
  while (blobs.size > CACHE_SIZE) blobs.delete(blobs.keys().next().value as string)
  return promise
}

/** Starts downloading the file in the background (e.g. when the viewer or the long-press menu opens). */
export function prefetchAttachment(attachment: Attachment) {
  if (attachment.uploadId || attachment.size > PREFETCH_LIMIT_BYTES) return
  void getBlob(attachment).catch(() => {})
}

function clickLink(href: string, fileName?: string) {
  const link = document.createElement('a')
  link.href = href
  if (fileName) link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function downloadOne(item: SaveItem): Promise<void> {
  const name = fileNameFor(item.attachment, item.createdAt)
  try {
    const blob = await getBlob(item.attachment)
    const url = URL.createObjectURL(blob)
    clickLink(url, name)
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  } catch {
    const fallback = serverDownloadUrl(item.attachment)
    if (!fallback) throw new Error('This file is not available yet.')
    clickLink(fallback) // the server forces a download, no CORS needed
  }
}

export function canShareFiles(): boolean {
  return typeof navigator.canShare === 'function' && typeof navigator.share === 'function'
}

/**
 * Saves photos/videos to the device. On phones (preferShare) it opens the share sheet, which offers
 * "Save Image" / "Save Video" (iPhone → Photos, Android → Gallery); otherwise it downloads the files.
 */
export async function saveAttachments(items: SaveItem[], { preferShare = false } = {}): Promise<SaveResult> {
  if (items.length === 0) return 'cancelled'
  if (preferShare && canShareFiles()) {
    try {
      const files = await Promise.all(
        items.map(async (item) => {
          const blob = await getBlob(item.attachment)
          return new File([blob], fileNameFor(item.attachment, item.createdAt), { type: blob.type || item.attachment.mimeType })
        }),
      )
      if (navigator.canShare({ files })) {
        await navigator.share({ files })
        return 'shared'
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // NotAllowedError (tap expired), unsupported type, network…: fall back to a normal download.
    }
  }
  for (const [index, item] of items.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 450)) // browsers block rapid multi-downloads
    await downloadOne(item)
  }
  return 'downloaded'
}

export function saveLabel(count: number, kind: 'IMAGE' | 'VIDEO' | 'MIXED', verb: 'Download' | 'Save'): string {
  if (count > 1) return `${verb} all ${count}`
  return `${verb} ${kind === 'VIDEO' ? 'video' : 'photo'}`
}
