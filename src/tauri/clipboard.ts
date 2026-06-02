import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'

/** Write `text` to the system clipboard. */
export const writeClipboard = (text: string): Promise<void> => writeText(text)

/** Read the system clipboard as plain text (empty string if unavailable). */
export async function readClipboard(): Promise<string> {
  const text = await readText()
  return text ?? ''
}
