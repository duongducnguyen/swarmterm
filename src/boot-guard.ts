import { formatBootError } from '@/lib/boot-error'

/**
 * Last-resort visible failure for a boot that never reached React.
 *
 * A throw while the module graph evaluates (a missing build-time env var, a bad
 * import) happens before ReactDOM.createRoot, so no error boundary can catch it
 * and release builds have no devtools to inspect. Without this the app is just
 * the window's background colour — the failure is silent and unattributable.
 *
 * Imported first in main.tsx so the listeners are installed before any module
 * that can fail. Styles are inline: a boot this broken may not have CSS either.
 */
function paintBootError(error: unknown): void {
  const root = document.getElementById('root')
  // React mounted, so the app is alive and this is an ordinary runtime error —
  // leave the UI alone rather than replacing a working app with a crash screen.
  if (!root || root.childElementCount > 0) return

  const { title, detail, hint } = formatBootError(error)

  root.style.cssText =
    'padding:48px;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'color:#cccccc;background:#09090b;height:100vh;overflow:auto;box-sizing:border-box'

  const h = document.createElement('div')
  h.style.cssText = 'font-size:16px;font-weight:600;color:#f48771;margin-bottom:16px'
  h.textContent = title
  root.appendChild(h)

  if (hint) {
    const p = document.createElement('div')
    p.style.cssText =
      'margin-bottom:16px;padding:12px;border-left:2px solid #f48771;background:#1e1e1e;color:#e0e0e0'
    p.textContent = hint
    root.appendChild(p)
  }

  // textContent, never innerHTML — the message may contain arbitrary markup.
  const pre = document.createElement('pre')
  pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;color:#9cdcfe'
  pre.textContent = detail
  root.appendChild(pre)

  // The window is created with `visible: false` and normally revealed by App's
  // mount effect — which never ran. Reveal it here or the error stays unseen.
  // Imported lazily and swallowed on failure: the guard must not depend on any
  // module that can throw at import time, since that is the case it exists for.
  void import('@/tauri/window')
    .then((m) => m.showWindow())
    .catch(() => {})
}

window.addEventListener('error', (e: ErrorEvent) => paintBootError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
  paintBootError(e.reason)
)
