import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

// Datos persistentes en JSON dentro de userData (prefs.json, projects.json…).
const file = (name: string): string => join(app.getPath('userData'), `${name}.json`)

export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return fallback
  }
}

// Escritura atómica: si la app se cae a mitad, el archivo anterior sigue entero.
export function writeJson(name: string, data: unknown): void {
  const tmp = `${file(name)}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file(name))
}
