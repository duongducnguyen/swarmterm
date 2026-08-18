import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

/**
 * The only IPC surface for OS notifications (components/lib never import the
 * plugin directly). Permission is resolved lazily on first send; a denial is
 * remembered for the session so we never re-prompt. Banners are sent silent —
 * the in-app WebAudio chime is the audible channel, and firing both would
 * double up. Every failure is swallowed: notifications are best-effort.
 */
let denied = false

export async function sendSystemNotification(opts: { title: string; body: string }): Promise<void> {
  if (denied) return
  try {
    let granted = await isPermissionGranted()
    if (!granted) {
      granted = (await requestPermission()) === 'granted'
      if (!granted) {
        denied = true
        return
      }
    }
    sendNotification({ title: opts.title, body: opts.body, silent: true })
  } catch (err) {
    console.warn('system notification failed', err)
  }
}
