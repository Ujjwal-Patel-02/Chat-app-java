import { API_URL } from './config'
import type { Attachment, AttachmentKind } from './types'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const MAX_ATTACHMENTS = 10
const MAX_IMAGE_EDGE = 2048
const POSTER_EDGE = 720

/** Media URLs from the API may be relative (local storage); make them absolute. */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (/^(https?:|blob:|data:)/i.test(url)) return url
  return `${API_URL}${url}`
}

// After an upload finishes we keep showing the local copy (already decoded) instead of re-downloading it.
const localPreviews = new Map<string, { full?: string; thumb?: string }>()

export function rememberLocalPreview(attachmentId: string, full?: string, thumb?: string) {
  localPreviews.set(attachmentId, { full, thumb })
}

export function displaySrc(attachment: Attachment, variant: 'full' | 'thumb'): string | undefined {
  const local = localPreviews.get(attachment.id)
  if (variant === 'thumb') {
    if (attachment.kind === 'IMAGE') return local?.full ?? mediaUrl(attachment.thumbnailUrl ?? attachment.url)
    return local?.thumb ?? mediaUrl(attachment.thumbnailUrl)
  }
  return local?.full ?? mediaUrl(attachment.url)
}

export interface ProcessedMedia {
  kind: AttachmentKind
  file: Blob
  name: string
  width: number | null
  height: number | null
  durationMs: number | null
  placeholder: string | null
  poster: Blob | null
  previewUrl: string
  posterUrl: string | null
}

export class MediaError extends Error {}

export function kindOf(file: File): AttachmentKind | null {
  if (file.type.startsWith('image/')) return 'IMAGE'
  if (file.type.startsWith('video/')) return 'VIDEO'
  if (/\.(jpe?g|png|gif|webp|avif|heic|heif)$/i.test(file.name)) return 'IMAGE'
  if (/\.(mp4|m4v|mov|webm)$/i.test(file.name)) return 'VIDEO'
  return null
}

/** Compresses photos, grabs a poster frame for videos and builds a tiny blurred placeholder. */
export async function processFile(file: File): Promise<ProcessedMedia> {
  const kind = kindOf(file)
  if (!kind) throw new MediaError('Only photos and videos can be shared.')
  return kind === 'IMAGE' ? processImage(file) : processVideo(file)
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLVideoElement

function sizeOf(source: Drawable): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight }
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight }
  return { width: source.width, height: source.height }
}

function draw(source: Drawable, maxEdge: number, background?: string): HTMLCanvasElement {
  const { width, height } = sizeOf(source)
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')!
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function placeholderOf(source: Drawable): string | null {
  try {
    const url = draw(source, 24, '#ffffff').toDataURL('image/jpeg', 0.5)
    return url.length <= 3800 ? url : null
  } catch {
    return null
  }
}

async function decodeImage(file: Blob): Promise<Drawable> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall back to <img> (e.g. HEIC on Safari) */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } catch {
    throw new MediaError("This photo format can't be opened here. Try a JPEG or PNG.")
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function processImage(file: File): Promise<ProcessedMedia> {
  const source = await decodeImage(file)
  const { width, height } = sizeOf(source)
  const placeholder = placeholderOf(source)
  const isGif = file.type === 'image/gif'
  const keepsAlpha = file.type === 'image/png' || file.type === 'image/webp'
  const fits = Math.max(width, height) <= MAX_IMAGE_EDGE
  const passthrough = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)

  let output: Blob = file
  let outWidth = width
  let outHeight = height
  // Animated GIFs and small PNG/WebP files are sent untouched; everything else is resized + re-encoded.
  if (!isGif && !(keepsAlpha && fits && file.size <= 1.5 * 1024 * 1024)) {
    const canvas = draw(source, MAX_IMAGE_EDGE, keepsAlpha ? undefined : '#ffffff')
    let encoded: Blob | null = null
    if (keepsAlpha) {
      encoded = await canvasToBlob(canvas, 'image/webp', 0.86)
      if (encoded && encoded.type !== 'image/webp') encoded = null
    }
    if (!encoded) {
      const flat = keepsAlpha ? draw(source, MAX_IMAGE_EDGE, '#ffffff') : canvas
      encoded = await canvasToBlob(flat, 'image/jpeg', 0.85)
    }
    if (encoded && !(passthrough && fits && encoded.size >= file.size)) {
      output = encoded
      outWidth = canvas.width
      outHeight = canvas.height
    }
  }
  if ('close' in source) source.close()
  if (output.size > MAX_IMAGE_BYTES) throw new MediaError('Photos can be up to 10 MB.')
  const extension = output.type === 'image/webp' ? 'webp' : output.type === 'image/png' ? 'png' : output.type === 'image/gif' ? 'gif' : 'jpg'
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return {
    kind: 'IMAGE',
    file: output,
    name: output === file ? file.name : `${base}.${extension}`,
    width: outWidth,
    height: outHeight,
    durationMs: null,
    placeholder,
    poster: null,
    previewUrl: URL.createObjectURL(output),
    posterUrl: null,
  }
}

function waitFor(target: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      target.removeEventListener(event, done)
      reject(new Error(`${event} timed out`))
    }, timeoutMs)
    const done = () => {
      window.clearTimeout(timer)
      resolve()
    }
    target.addEventListener(event, done, { once: true })
  })
}

async function processVideo(file: File): Promise<ProcessedMedia> {
  if (file.size > MAX_VIDEO_BYTES) throw new MediaError('Videos can be up to 50 MB.')
  const previewUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = previewUrl
  let width: number | null = null
  let height: number | null = null
  let durationMs: number | null = null
  let poster: Blob | null = null
  let placeholder: string | null = null
  try {
    await waitFor(video, 'loadedmetadata', 8000)
    if (Number.isFinite(video.duration)) durationMs = Math.round(video.duration * 1000)
    if (video.videoWidth > 0) {
      width = video.videoWidth
      height = video.videoHeight
      if (video.readyState < 2) await waitFor(video, 'loadeddata', 6000).catch(() => {})
      const seekTo = Math.min(0.5, (video.duration || 0) / 3)
      if (seekTo > 0) {
        video.currentTime = seekTo
        await waitFor(video, 'seeked', 5000).catch(() => {})
      }
      const canvas = draw(video, POSTER_EDGE, '#000000')
      poster = await canvasToBlob(canvas, 'image/jpeg', 0.8)
      placeholder = placeholderOf(video)
    }
  } catch {
    /* the browser can't decode this codec; send it without a preview */
  } finally {
    video.removeAttribute('src')
    video.load()
  }
  return {
    kind: 'VIDEO',
    file,
    name: file.name || 'video.mp4',
    width,
    height,
    durationMs,
    placeholder,
    poster,
    previewUrl,
    posterUrl: poster ? URL.createObjectURL(poster) : null,
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return ''
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

export function describeAttachments(attachments: Attachment[]): string {
  if (attachments.length === 0) return ''
  const videos = attachments.filter((a) => a.kind === 'VIDEO').length
  const photos = attachments.length - videos
  if (videos === 0) return photos === 1 ? '📷 Photo' : `📷 ${photos} photos`
  if (photos === 0) return videos === 1 ? '🎥 Video' : `🎥 ${videos} videos`
  return `📎 ${attachments.length} photos & videos`
}
