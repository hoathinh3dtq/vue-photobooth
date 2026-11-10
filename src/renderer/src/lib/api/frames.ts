import { API_HOST } from './client'
import { login, saveSession } from './auth'

const host = () => (import.meta.env.VITE_API_HOST || API_HOST || 'http://127.0.0.1:8000').replace(/\/$/, '')

function headers(extra?: Record<string, string>): Record<string, string> {
  const t = localStorage.getItem('auth_token') || ''
  return { ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(extra || {}) }
}

async function parseJson(res: Response) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { message: text }
  }
}

// Auto re-login on 401 then retry once
export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const res = await fetch(`${host()}${path}`, {
    ...init,
    headers: { ...headers(init.headers as Record<string, string>), ...(init.headers as Record<string, string> || {}) },
  })
  if (res.status === 401 && retry) {
    try {
      // re-login with stored booth info
      const email = localStorage.getItem('default_email') || 'admin@photobooth.com'
      const password = localStorage.getItem('default_password') || '123456'
      const booth = localStorage.getItem('booth_code') || 'LOCAL001'
      localStorage.removeItem('auth_token')
      const r = await login(email, password, booth)
      saveSession(r)
      return apiFetch(path, init, false)
    } catch {
      return res
    }
  }
  return res
}

export interface FrameItem {
  id: number | string
  name: string
  image_path?: string
  frame_shape?: string
  category_id?: number | string | null
  layout_id?: number | string | null
  holes_metadata?: any
  qr_x?: number
  qr_y?: number
  qr_size?: number
  enable_overlay?: boolean
  is_active?: boolean | number
  is_platform?: boolean
  event_id?: number | string | null
  [key: string]: unknown
}

export interface PlatformFrame {
  id?: number | string
  name?: string
  image_path?: string
  url?: string
  holes_metadata?: any
  category_id?: number | string | null
  [key: string]: unknown
}

export interface FrameLayout {
  id: number | string
  name: string
  [key: string]: unknown
}

export async function listFrames(eventId?: string | null): Promise<FrameItem[]> {
  const q = eventId ? `?event_id=${encodeURIComponent(eventId)}` : ''
  const res = await apiFetch(`/api/frames/all${q}`)
  const j = await parseJson(res)
  return j?.data || []
}

export async function uploadFrame(file: File, opts: { name?: string; frame?: string; categoryId?: number | null; layoutId?: number | null; eventId?: number | string | null; holesMetadata?: unknown; qrX?: number; qrY?: number; qrSize?: number; enableOverlay?: boolean }): Promise<FrameItem | null> {
  const fd = new FormData()
  fd.append('image', file)
  fd.append('name', opts.name || file.name)
  fd.append('frame', opts.frame || 'vertical')
  if (opts.categoryId != null) fd.append('category_id', String(opts.categoryId))
  if (opts.layoutId != null) fd.append('layout_id', String(opts.layoutId))
  if (opts.eventId != null) fd.append('event_id', String(opts.eventId))
  if (opts.holesMetadata) fd.append('holes_metadata', JSON.stringify(opts.holesMetadata))
  fd.append('qr_x', String(opts.qrX ?? 0))
  fd.append('qr_y', String(opts.qrY ?? 0))
  fd.append('qr_size', String(opts.qrSize ?? 200))
  fd.append('enable_overlay', opts.enableOverlay ? '1' : '0')
  const res = await apiFetch('/api/frames/upload', { method: 'POST', body: fd })
  const j = await parseJson(res)
  if (!res.ok) throw new Error(j?.message || 'Upload thất bại')
  return j?.data || null
}

export async function updateFrame(id: number | string, payload: Record<string, unknown>): Promise<FrameItem | null> {
  const res = await apiFetch(`/api/frames/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const j = await parseJson(res)
  if (!res.ok) throw new Error(j?.message || 'Cập nhật thất bại')
  return j?.data || null
}

export async function deleteFrame(id: number | string): Promise<boolean> {
  const res = await apiFetch(`/api/frames/${id}`, { method: 'DELETE' })
  return res.ok
}

export async function deleteFrameByFilename(filename: string): Promise<boolean> {
  const res = await apiFetch(`/api/frames/delete/${filename}`, { method: 'DELETE' })
  return res.ok
}

export async function bulkVisibility(ids: Array<number | string>, isActive: boolean): Promise<boolean> {
  const res = await apiFetch('/api/frames/bulk-visibility', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, is_active: isActive }),
  })
  return res.ok
}

export async function deleteAllFrames(): Promise<boolean> {
  const res = await apiFetch('/api/frames/delete-all', { method: 'DELETE' })
  return res.ok
}

export async function listPlatformFrames(): Promise<FrameItem[]> {
  const res = await apiFetch('/api/admin/platform/frame-library')
  const j = await parseJson(res)
  return j?.data || []
}

export async function listLayouts(): Promise<{ id: number; name: string }[]> {
  const res = await apiFetch('/api/admin/layouts')
  const j = await parseJson(res)
  return j?.data || []
}

export async function importPlatformFrame(
  frameIds: number | string | Array<number | string>,
  layoutId: number | string,
  qrX = 0,
  qrY = 0,
  qrSize = 200,
): Promise<boolean> {
  const ids = Array.isArray(frameIds) ? frameIds : [frameIds]
  const res = await apiFetch('/api/admin/platform/frame-library/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frame_ids: ids, layout_id: Number(layoutId), qr_x: qrX, qr_y: qrY, qr_size: qrSize }),
  })
  return res.ok
}
