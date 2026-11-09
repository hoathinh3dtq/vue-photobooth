import { API_HOST } from './client'

const host = () => import.meta.env.VITE_API_HOST || API_HOST.replace(/\/api$/, '') || 'http://127.0.0.1:8000'

function token(): string {
  return localStorage.getItem('auth_token') || ''
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = token()
  return {
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...(extra || {}),
  }
}

export interface FrameHole {
  x: number
  y: number
  w: number
  h: number
  orientation: string
}

export interface FrameMeta {
  holes: FrameHole[]
  fw: number
  fh: number
}

export interface FrameRecord {
  id: number | string
  name: string
  image_path?: string
  frame_shape?: string
  category_id?: number | string | null
  layout_id?: number | string | null
  holes_metadata?: FrameMeta | null
  qr_x?: number | null
  qr_y?: number | null
  qr_size?: number | null
  is_active?: boolean | number | string
  enable_overlay?: boolean | number | string
  [key: string]: unknown
}

export interface PlatformFrame {
  id: number | string
  name: string
  url?: string
  image_path?: string
  holes_metadata?: FrameMeta | null
  [key: string]: unknown
}

export interface FrameLayout {
  id: number | string
  name: string
  [key: string]: unknown
}

export interface UploadFrameOptions {
  name: string
  shape: string
  holes: FrameMeta
  categoryId?: number | string | null
  layoutId?: number | string | null
  qrX?: number | null
  qrY?: number | null
  qrSize?: number | null
  enableOverlay?: boolean
  eventId?: number | string | null
}

/**
 * Vendor `ly()` helper, ported to the Vue backend (/api prefix).
 * Sends the full multipart payload expected by HihiBooth.
 */
export async function uploadFrame(file: File, options: UploadFrameOptions): Promise<unknown> {
  const fd = new FormData()
  fd.append('image', file)
  fd.append('name', options.name)
  fd.append('frame', options.shape)

  if (options.categoryId != null && options.categoryId !== '') {
    fd.append('category_id', String(options.categoryId))
  }
  if (options.layoutId != null && options.layoutId !== '') {
    fd.append('layout_id', String(options.layoutId))
  }
  if (options.eventId != null && options.eventId !== '') {
    fd.append('event_id', String(options.eventId))
  }

  fd.append('holes_metadata', JSON.stringify(options.holes))

  if (options.qrX !== null && options.qrX !== undefined) {
    fd.append('qr_x', String(options.qrX))
  }
  if (options.qrY !== null && options.qrY !== undefined) {
    fd.append('qr_y', String(options.qrY))
  }
  if (options.qrSize !== null && options.qrSize !== undefined) {
    fd.append('qr_size', String(options.qrSize))
  }

  fd.append('enable_overlay', options.enableOverlay ? '1' : '0')

  const res = await fetch(`${host()}/api/frames/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: fd,
  })

  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getUserInfo(): Promise<unknown> {
  const res = await fetch(`${host()}/api/admin/user-info`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function listFrames(includeAdmin = false): Promise<FrameRecord[]> {
  const path = includeAdmin ? '/api/admin/images' : '/api/frames/all'
  const res = await fetch(`${host()}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  const data = json?.data ?? json
  return Array.isArray(data) ? data : []
}

export async function getFrame(frame: string | number): Promise<unknown> {
  const res = await fetch(`${host()}/api/frame?frame=${encodeURIComponent(String(frame))}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateFrame(
  id: string | number,
  payload: Partial<FrameRecord>,
): Promise<FrameRecord> {
  const res = await fetch(`${host()}/api/frames/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return (json?.data ?? json) as FrameRecord
}

export async function deleteFrame(filename: string): Promise<unknown> {
  const res = await fetch(`${host()}/api/frames/delete/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json().catch(() => null)
}

export async function deleteAllFrames(): Promise<unknown> {
  const res = await fetch(`${host()}/api/frames/delete-all`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json().catch(() => null)
}

export async function bulkVisibility(ids: Array<string | number>, isActive: boolean): Promise<unknown> {
  const res = await fetch(`${host()}/api/frames/bulk-visibility`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids, is_active: isActive }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json().catch(() => null)
}

export async function listPlatformFrames(): Promise<PlatformFrame[]> {
  const res = await fetch(`${host()}/api/admin/platform/frame-library`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  const data = json?.data ?? json
  return Array.isArray(data) ? data : []
}

export async function listLayouts(): Promise<FrameLayout[]> {
  const res = await fetch(`${host()}/api/admin/layouts`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  const data = json?.data ?? json
  return Array.isArray(data) ? data : []
}

export async function importPlatformFrame(
  frameId: string | number,
  layoutId: string | number,
  qrX = 0,
  qrY = 0,
  qrSize = 200,
): Promise<unknown> {
  const res = await fetch(`${host()}/api/admin/platform/frame-library/import`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      frame_ids: [frameId],
      layout_id: layoutId,
      qr_x: qrX,
      qr_y: qrY,
      qr_size: qrSize,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
