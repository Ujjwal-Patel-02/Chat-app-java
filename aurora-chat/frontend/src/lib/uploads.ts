import { useSyncExternalStore } from 'react'
import { ApiError, uploadFile } from './api'
import { MediaError, kindOf, processFile, rememberLocalPreview, type ProcessedMedia } from './media'
import type { Attachment, AttachmentKind } from './types'

export type UploadStatus = 'processing' | 'uploading' | 'done' | 'error'

export interface UploadState {
  id: string
  name: string
  kind: AttachmentKind
  status: UploadStatus
  progress: number
  error?: string
  media?: ProcessedMedia
  result?: Attachment
}

const uploads = new Map<string, UploadState>()
const files = new Map<string, File>()
const promises = new Map<string, Promise<Attachment>>()
const controllers = new Map<string, AbortController>()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function patch(id: string, changes: Partial<UploadState>) {
  const current = uploads.get(id)
  if (!current) return
  uploads.set(id, { ...current, ...changes })
  emit()
}

function messageOf(error: unknown): string {
  if (error instanceof MediaError || error instanceof ApiError) return error.message
  return 'Upload failed. Tap to retry.'
}

async function run(id: string): Promise<Attachment> {
  const file = files.get(id)!
  try {
    let media = uploads.get(id)?.media
    if (!media) {
      media = await processFile(file)
      patch(id, { media })
    }
    patch(id, { status: 'uploading', progress: 0, error: undefined })
    const form = new FormData()
    form.append('file', media.file, media.name)
    if (media.poster) form.append('poster', media.poster, 'poster.jpg')
    if (media.width) form.append('width', String(media.width))
    if (media.height) form.append('height', String(media.height))
    if (media.durationMs) form.append('durationMs', String(media.durationMs))
    if (media.placeholder) form.append('placeholder', media.placeholder)
    const controller = new AbortController()
    controllers.set(id, controller)
    const attachment = await uploadFile(form, (progress) => patch(id, { progress }), controller.signal)
    rememberLocalPreview(attachment.id, media.previewUrl, media.posterUrl ?? undefined)
    patch(id, { status: 'done', progress: 1, result: attachment })
    return attachment
  } catch (error) {
    patch(id, { status: 'error', error: messageOf(error) })
    throw error
  } finally {
    controllers.delete(id)
  }
}

function track(id: string): Promise<Attachment> {
  const promise = run(id)
  promise.catch(() => {}) // surfaced through the state; avoid unhandled-rejection noise
  promises.set(id, promise)
  return promise
}

/** Starts processing + uploading a file right away, so sending is instant. */
export function startUpload(file: File): string {
  const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  uploads.set(id, { id, name: file.name, kind: kindOf(file) ?? 'IMAGE', status: 'processing', progress: 0 })
  files.set(id, file)
  emit()
  track(id)
  return id
}

export function retryUpload(id: string): Promise<Attachment> {
  const state = uploads.get(id)
  if (!state) return Promise.reject(new Error('Upload not found'))
  if (state.status === 'done' && state.result) return Promise.resolve(state.result)
  if (state.status === 'error') return track(id)
  return promises.get(id)!
}

/** Resolves when the upload is done; retries it first if it had failed. */
export function awaitUpload(id: string): Promise<Attachment> {
  const state = uploads.get(id)
  if (state?.status === 'error') return retryUpload(id)
  return promises.get(id) ?? Promise.reject(new Error('Upload not found'))
}

export function removeUpload(id: string, keepPreview = false) {
  controllers.get(id)?.abort()
  const state = uploads.get(id)
  if (state?.media && !keepPreview) {
    URL.revokeObjectURL(state.media.previewUrl)
    if (state.media.posterUrl) URL.revokeObjectURL(state.media.posterUrl)
  }
  uploads.delete(id)
  files.delete(id)
  promises.delete(id)
  emit()
}

export function getUpload(id: string): UploadState | undefined {
  return uploads.get(id)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useUpload(id: string | undefined): UploadState | undefined {
  return useSyncExternalStore(subscribe, () => (id ? uploads.get(id) : undefined))
}

/** Placeholder attachment shown in the optimistic message while the upload runs. */
export function pendingAttachment(id: string): Attachment {
  const state = uploads.get(id)
  const media = state?.media
  return {
    id,
    uploadId: id,
    kind: state?.kind ?? 'IMAGE',
    url: media?.previewUrl ?? '',
    thumbnailUrl: media?.posterUrl ?? null,
    mimeType: media?.file.type ?? '',
    size: media?.file.size ?? 0,
    width: media?.width ?? null,
    height: media?.height ?? null,
    durationMs: media?.durationMs ?? null,
    placeholder: media?.placeholder ?? null,
    name: state?.name ?? null,
  }
}
