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
  shopQr: string
  // Chung & Trải nghiệm
  countdownSeconds: number
  enableDefaultBeep: boolean
  customCountdownMp3: string
  hideSettingsButton: boolean
  manualCapture: boolean
  autoFillAfterCapture: boolean
  allowRetake: boolean
  previewScale: number
  retakeBtnScale: number
  autoStartCountdown: boolean
  allowCancelOnPrint: boolean
  skipPrintConfirm: boolean
  autoSwitchToPrint: boolean
  photoCountRules: string
  language: 'vi' | 'en'
  mode: 'photobooth' | 'selfbooth'
  // Làm đẹp AI
  beautySkin: boolean
  beautyTone: boolean
  beautyBlush: boolean
  beautyLip: boolean
  // Filter
  filters: string[]
  // Camera / Hardware
  cameraVendor: string
  cameraId: string
  mirror: boolean
  // Đồng bộ & Offline
  cloudSync: boolean
  offlineFirst: boolean
  disablePaymentOffline: boolean
  // Bản quyền
  machineApiKey: string
  activeEventId: string
  activeEventName: string
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
  shopQr: '',
  countdownSeconds: 10,
  enableDefaultBeep: true,
  customCountdownMp3: '',
  hideSettingsButton: false,
  manualCapture: false,
  autoFillAfterCapture: false,
  allowRetake: true,
  previewScale: 100,
  retakeBtnScale: 100,
  autoStartCountdown: false,
  allowCancelOnPrint: true,
  skipPrintConfirm: false,
  autoSwitchToPrint: false,
  photoCountRules: '',
  language: 'vi',
  mode: 'photobooth',
  beautySkin: false,
  beautyTone: false,
  beautyBlush: false,
  beautyLip: false,
  filters: [],
  cameraVendor: 'canon',
  cameraId: '',
  mirror: true,
  cloudSync: true,
  offlineFirst: false,
  disablePaymentOffline: false,
  machineApiKey: '',
  activeEventId: '',
  activeEventName: '',
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
