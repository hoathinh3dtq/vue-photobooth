import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppSettings {
  printerName: string
  stripPrinter: string
  fullPrinter: string
  zoom: number
  offsetX: number
  offsetY: number
  paperLoaded: number
  paperRemaining: number
  warningThreshold: number
  allowCancelOnPreview: boolean
  autoPrintOnPreview: boolean
  printQr: boolean
}

const DEFAULTS: AppSettings = {
  printerName: '',
  stripPrinter: '',
  fullPrinter: '',
  zoom: 0.98,
  offsetX: 0,
  offsetY: 0,
  paperLoaded: 400,
  paperRemaining: 400,
  warningThreshold: 50,
  allowCancelOnPreview: true,
  autoPrintOnPreview: false,
  printQr: true,
}

let state: AppSettings = { ...DEFAULTS }

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const p = settingsPath()
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
      state = { ...DEFAULTS, ...raw }
    }
  } catch (e) {
    console.warn('[settings] load failed:', e)
  }
  return state
}

export function getSettings(): AppSettings {
  return { ...state }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  state = { ...state, ...patch }
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[settings] save failed:', e)
  }
  return { ...state }
}

export function listPrinters(): string[] {
  // Synchronous via PowerShell would block; return empty here, caller uses IPC async.
  return []
}
