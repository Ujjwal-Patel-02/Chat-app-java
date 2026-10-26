import { getPref } from './prefs'

type AudioCtor = typeof AudioContext
let context: AudioContext | null = null

function audioContext(): AudioContext | null {
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  context ??= new Ctor()
  return context
}

/** Browsers only allow audio after a user gesture: warm the context up on the first tap. */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    audioContext()?.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

/** A soft two-note "pop" generated on the fly (no audio file to download). */
export function playMessageSound() {
  if (!getPref('sound')) return
  const ctx = audioContext()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  ;[
    [740, 0],
    [1110, 0.085],
  ].forEach(([frequency, offset]) => {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + offset)
    gain.gain.exponentialRampToValueAtTime(0.09, now + offset + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now + offset)
    oscillator.stop(now + offset + 0.2)
  })
}
