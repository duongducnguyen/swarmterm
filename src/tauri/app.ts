import { getVersion } from '@tauri-apps/api/app'

/** The app version baked into tauri.conf.json (e.g. "0.1.0"). */
export const getAppVersion = (): Promise<string> => getVersion()
