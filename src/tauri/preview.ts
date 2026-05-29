import { invoke } from '@tauri-apps/api/core'

export interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

export const previewShow = (url: string, bounds: PreviewBounds): Promise<void> =>
  invoke('preview_show', { url, bounds })

export const previewSetBounds = (bounds: PreviewBounds): Promise<void> =>
  invoke('preview_set_bounds', { bounds })

export const previewNavigate = (url: string): Promise<void> =>
  invoke('preview_navigate', { url })

export const previewReload = (): Promise<void> => invoke('preview_reload')
export const previewBack = (): Promise<void> => invoke('preview_back')
export const previewForward = (): Promise<void> => invoke('preview_forward')
export const previewSetVisible = (visible: boolean): Promise<void> =>
  invoke('preview_set_visible', { visible })
export const previewClose = (): Promise<void> => invoke('preview_close')
