import type { NotificationKind } from '@/lib/notification-flow'

/**
 * Synthesized two-note chimes — no bundled audio asset, no license, and they
 * work even when OS notification permission is denied. Attention rises like a
 * question; completion falls to a resolution. One lazy AudioContext for the
 * app lifetime; every failure path (autoplay policy, missing WebAudio) is
 * silent because the state dots remain the primary channel.
 */
const NOTES: Record<NotificationKind, [number, number]> = {
  attention: [660, 880],
  completion: [880, 660]
}

let ctx: AudioContext | null = null

function note(ac: AudioContext, freq: number, at: number): void {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
  osc.connect(gain).connect(ac.destination)
  osc.start(at)
  osc.stop(at + 0.2)
}

export function playChime(kind: NotificationKind): void {
  try {
    if (typeof AudioContext === 'undefined') return
    ctx ??= new AudioContext()
    const play = (): void => {
      const [a, b] = NOTES[kind]
      const t = ctx!.currentTime
      note(ctx!, a, t)
      note(ctx!, b, t + 0.16)
    }
    // The context starts suspended until the page has had user interaction —
    // the app always has (you typed into a terminal), so resume() succeeds.
    if (ctx.state === 'suspended') void ctx.resume().then(play, () => undefined)
    else play()
  } catch {
    // WebAudio unavailable — dots stay the signal.
  }
}
