export interface BootError {
  title: string
  detail: string
  /** Set when the failure has a known, actionable cause. */
  hint?: string
}

/**
 * Turn whatever was thrown during boot into something a human can read.
 *
 * Release builds ship without devtools, so an uncaught error while the module
 * graph evaluates leaves nothing but the window's background colour on screen.
 * This is the text we paint into #root instead of that blank window.
 */
export function formatBootError(error: unknown): BootError {
  const detail =
    error instanceof Error
      ? error.stack || `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : safeStringify(error)

  const boot: BootError = { title: 'Swarmterm failed to start', detail }

  // Vite inlines VITE_* at build time, so a value present in dev can still be
  // missing from a production bundle — the exact trap that made the app boot
  // to a black window. Name the fix rather than making the next person dig.
  if (detail.includes('VITE_')) {
    boot.hint =
      'A build-time environment variable was missing. Vite only reads .env.development in dev — ' +
      'put the VITE_* values in .env so production builds pick them up too, then rebuild.'
  }

  return boot
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
