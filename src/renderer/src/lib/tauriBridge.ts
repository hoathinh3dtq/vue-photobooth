// Tauri bridge for Vue frontend — drop-in electronAPI replacement when running under Tauri (Rust + WebView2).
// If neither Electron nor Tauri is present (browser dev), functions resolve safely.

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

async function tauriInvoke(cmd: string, args?: Record<string, unknown>) {
  try {
    // Tauri shell injected by Rust WebView2 - no static import (keeps Vite/Electron build clean)
    const mod: any = (window as any).__TAURI__?.core || null
    if (mod?.invoke) return await mod.invoke(cmd, args)
    const g: any = window as any
    if (g.__TAURI_INTERNALS__?.invoke) return await g.__TAURI_INTERNALS__.invoke(cmd, args)
    if (g.__TAURI__?.core?.invoke) return await g.__TAURI__.core.invoke(cmd, args)
  } catch (e) {
    return { ok: false, error: String(e) }
  }
  return { ok: false, error: 'NOT_TAURI' }
}

function sidecarHelper() {
  // Sidecar camera (.NET 8) — stub: tries Tauri shell command, falls back to camera status stub
  return {
    detect: () => tauriInvoke('sidecar:detect'),
    capture: () => tauriInvoke('sidecar:capture'),
    liveview: () => tauriInvoke('sidecar:liveview'),
  }
}

export function installTauriBridge(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as any).electronAPI) return true // Electron already present
  if (!isTauri && !((window as any).__TAURI__)) {
    // Still install fetch-based fallback for browser preview (web only).
    // Keep a minimal electronAPI so UI doesn't crash on plain vite dev in browser.
    const fallback: any = {
      getVersion: async () => 'web-dev',
      log: async () => null,
      camera: {
        capture: async () => ({ ok: false, error: 'NO_CAMERA' }),
        status: async () => ({ brand: null, provider: null, available: false }),
        detect: async () => ({ brand: null, provider: null, available: false }),
        sidecarDetect: async () => ({ available: false, exePath: null, raw: '', lines: [], fujiLoaded: false, fujiInit: false, sonyInit: false, sonyVersion: null, cameras: [], error: null, elapsedMs: 0 }),
        canonEdsdk: {
          init: async () => ({ ok: false }),
          status: async () => ({ ok: false }),
          liveViewStart: async () => ({ ok: false }),
          liveViewFrame: async () => ({ ok: false }),
          liveViewStop: async () => ({ ok: false }),
          capture: async () => ({ ok: false }),
          captureDataUrl: async () => ({ ok: false }),
          lens: async () => ({ ok: false }),
          get: async () => ({ ok: false }),
          set: async () => ({ ok: false }),
          importRecent: async () => ({ ok: false }),
        },
      },
      printImage: async () => ({ ok: false, error: 'PRINTER_NOT_FOUND' }),
      saveTimeLapse: async () => null,
      saveEventPhoto: async () => null,
      listEventPhotos: async () => [],
      readEventPhoto: async () => null,
      settings: {
        get: async () => ({ printerName: '', zoom: 0.98, offsetX: 0, offsetY: 0 }),
        save: async (p: Record<string, unknown>) => p,
      },
      printer: {
        list: async () => ({ ok: true, printers: [] }),
        openPreferences: async () => ({ ok: true }),
      },
    }
    ;(window as any).electronAPI = fallback
    return true
  }

  // Tauri: map electronAPI -> tauri commands (snake_case names matching Tauri commands)
  const api: any = {
    getVersion: () => tauriInvoke('get_version'),
    log: (level: string, msg: string) => tauriInvoke('log', { level, msg }),
    camera: {
      capture: () => tauriInvoke('camera_capture'),
      status: () => tauriInvoke('camera_status'),
      detect: () => tauriInvoke('camera_detect'),
      sidecarDetect: () => tauriInvoke('camera_sidecar_detect'),
      canonEdsdk: {
        init: () => tauriInvoke('camera_canon_edsdk_init'),
        status: () => tauriInvoke('camera_canon_edsdk_status'),
        liveViewStart: () => tauriInvoke('camera_canon_edsdk_liveview_start'),
        liveViewFrame: () => tauriInvoke('camera_canon_edsdk_liveview_frame'),
        liveViewStop: () => tauriInvoke('camera_canon_edsdk_liveview_stop'),
        capture: (outputPath: string, autofocus?: boolean, timeoutMs?: number) =>
          tauriInvoke('camera_canon_edsdk_capture', { outputPath, autofocus, timeoutMs }),
        captureDataUrl: (autofocus?: boolean, timeoutMs?: number) =>
          tauriInvoke('camera_canon_edsdk_capture_dataurl', { autofocus, timeoutMs }),
        lens: (step: number) => tauriInvoke('camera_canon_edsdk_lens', { step }),
        get: (prop: number) => tauriInvoke('camera_canon_edsdk_get', { prop }),
        set: (prop: number, value: number) => tauriInvoke('camera_canon_edsdk_set', { prop, value }),
        importRecent: (dir: string, count?: number) => tauriInvoke('camera_canon_edsdk_import_recent', { dir, count }),
      },
    },
    printImage: (dataUrl: string, opts: any) => tauriInvoke('print_image', { dataUrl, opts }),
    saveTimeLapse: (base64: string) => tauriInvoke('save_timelapse', { base64 }),
    saveEventPhoto: (base64: string, eventId: any) => tauriInvoke('save_event_photo', { base64, eventId }),
    listEventPhotos: (eventId: any) => tauriInvoke('list_event_photos', { eventId }),
    readEventPhoto: (filePath: string) => tauriInvoke('read_event_photo', { filePath }),
    settings: {
      get: () => tauriInvoke('settings_get'),
      save: (patch: Record<string, unknown>) => tauriInvoke('settings_save', { patch }),
    },
    printer: {
      list: () => tauriInvoke('printer_list'),
      openPreferences: (name: string) => tauriInvoke('printer_open_preferences', { name }),
    },
    sidecar: sidecarHelper(),
  }

  ;(window as any).electronAPI = api
  return true
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && !!((window as any).electronAPI && !(window as any).electronAPI?.camera?.sidecarDetect?.toString().includes('ipcRenderer'))
}
