import { contextBridge, ipcRenderer } from 'electron'

export interface PrintOptions {
  type?: string
  printName?: string
  zoom?: number
  offsetX?: number
  offsetY?: number
}

export interface PrintResult {
  ok: boolean
  error?: string
  detail?: string
}

export interface EventPhotoFile {
  filename: string
  path: string
}

export interface CameraCaptureResult {
  ok: boolean
  imageDataUrl?: string
  code?: string
  error?: string
}

export interface SidecarCamera {
  id: string
  name: string
  port?: string
  protocol?: string
  selectionId?: string
}

export interface CanonEdsdkStatus {
  connected: boolean
  model?: string
  serial?: string
  battery?: number
  error?: string
  eds?: number
}

export interface CanonEdsdkResult {
  ok: boolean
  result?: unknown
  code?: string
  eds?: number
  message?: string
  event?: string
}

export interface CameraStatusResult {
  brand: string | null
  provider: string | null
  available: boolean
}

export interface SidecarCamera {
  id: string
  name: string
  port?: string
  protocol?: string
  selectionId?: string
}

export interface SidecarDetectResult {
  available: boolean
  exePath: string | null
  raw: string
  lines: string[]
  fujiLoaded: boolean
  fujiInit: boolean
  sonyInit: boolean
  sonyVersion: string | null
  cameras: SidecarCamera[]
  error: string | null
  elapsedMs: number
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  log: (level: string, msg: string): Promise<null> =>
    ipcRenderer.invoke('app:log', level, msg),
  camera: {
    capture: (): Promise<CameraCaptureResult> => ipcRenderer.invoke('camera:capture'),
    status: (): Promise<CameraStatusResult> => ipcRenderer.invoke('camera:status'),
    detect: (): Promise<CameraStatusResult> => ipcRenderer.invoke('camera:detect'),
    sidecarDetect: (): Promise<SidecarDetectResult> => ipcRenderer.invoke('camera:sidecar-detect'),
    canonEdsdk: {
      init: (): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-init'),
      status: (): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-status'),
      liveViewStart: (): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-liveview-start'),
      liveViewFrame: (): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-liveview-frame'),
      liveViewStop: (): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-liveview-stop'),
      capture: (outputPath: string, autofocus?: boolean, timeoutMs?: number): Promise<CanonEdsdkResult> =>
        ipcRenderer.invoke('camera:canon-edsdk-capture', { outputPath, autofocus, timeoutMs }),
      captureDataUrl: (autofocus?: boolean, timeoutMs?: number): Promise<CanonEdsdkResult & { imageDataUrl?: string }> =>
        ipcRenderer.invoke('camera:canon-edsdk-capture-dataurl', { autofocus, timeoutMs }),
      lens: (step: number): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-lens', step),
      get: (prop: number): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-get', prop),
      set: (prop: number, value: number): Promise<CanonEdsdkResult> => ipcRenderer.invoke('camera:canon-edsdk-set', prop, value),
      importRecent: (dir: string, count?: number): Promise<CanonEdsdkResult> =>
        ipcRenderer.invoke('camera:canon-edsdk-import-recent', { dir, count }),
    },
  },
  printImage: (dataUrl: string, opts: PrintOptions): Promise<PrintResult> =>
    ipcRenderer.invoke('print-image', dataUrl, opts),
  saveTimeLapse: (base64: string): Promise<string | null> =>
    ipcRenderer.invoke('save-timelapse', base64),
  saveEventPhoto: (base64: string, eventId: number | string): Promise<string | null> =>
    ipcRenderer.invoke('save-event-photo', base64, eventId),
  listEventPhotos: (eventId: number | string): Promise<EventPhotoFile[]> =>
    ipcRenderer.invoke('list-event-photos', eventId),
  readEventPhoto: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('read-event-photo', filePath),
  settings: {
    get: (): Promise<any> => ipcRenderer.invoke('settings:get'),
    save: (patch: Record<string, unknown>): Promise<any> => ipcRenderer.invoke('settings:save', patch),
  },
  printer: {
    list: (): Promise<{ ok: boolean; printers: string[] }> => ipcRenderer.invoke('printer:list'),
    openPreferences: (name: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('printer:open-preferences', name),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api