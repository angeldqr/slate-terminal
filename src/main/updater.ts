import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

// Actualizaciones desde GitHub Releases: cada push a develop publica una versión (ver
// .github/workflows/release.yml). Nada se descarga sin que la persona lo pida.

let state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported' }
let notify: (s: UpdateState) => void = () => {}

const set = (patch: UpdateState): void => {
  state = patch
  notify(state)
}

export function initUpdater(onChange: (s: UpdateState) => void): void {
  notify = onChange
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false // instalar cierra las sesiones: solo cuando se pide
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => set({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => set({ status: 'current' }))
  autoUpdater.on('download-progress', (p) =>
    set({ status: 'downloading', version: state.version, progress: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (err) =>
    set({ status: 'error', version: state.version, error: friendly(err) })
  )
}

// Sin conexión o sin versiones publicadas, el error de electron-updater es largo y técnico.
function friendly(err: Error): string {
  const text = String(err?.message ?? err)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(text)) return 'Sin conexión con GitHub.'
  if (/404|latest\.yml|No published versions/i.test(text)) {
    return 'Todavía no hay versiones publicadas.'
  }
  return text.split('\n')[0].slice(0, 200)
}

export const updateState = (): UpdateState => state

export function checkForUpdates(): void {
  if (!app.isPackaged || state.status === 'checking' || state.status === 'downloading') return
  autoUpdater.checkForUpdates().catch(() => {}) // el error llega también por el evento
}

export function downloadUpdate(): void {
  if (state.status !== 'available' && state.status !== 'error') return
  autoUpdater.downloadUpdate().catch(() => {})
}

// El instalador cierra Slate (y su host de sesiones), instala sin preguntar y lo vuelve a abrir.
export const installUpdate = (): void => autoUpdater.quitAndInstall(true, true)
