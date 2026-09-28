import { contextBridge, ipcRenderer } from 'electron'

export interface PrintOptions {
  type?: string
  printName?: string
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

export interface CameraStatusResult {
  brand: string | null
  provider: string | null
  available: boolean
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  log: (level: string, msg: string): Promise<null> =>
    ipcRenderer.invoke('app:log', level, msg),
  camera: {
    capture: (): Promise<CameraCaptureResult> => ipcRenderer.invoke('camera:capture'),
    status: (): Promise<CameraStatusResult> => ipcRenderer.invoke('camera:status'),
    detect: (): Promise<CameraStatusResult> => ipcRenderer.invoke('camera:detect'),
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
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api