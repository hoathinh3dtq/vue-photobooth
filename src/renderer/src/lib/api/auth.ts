import { request } from './client'
import { normalizeBoothType } from './config'

export interface Booth {
  booth_code?: string
  type?: string
  events?: { id: string | number }[]
}

export interface LoginResponse {
  token?: string
  access_token?: string
  id?: string | number
  user?: {
    id?: string | number
    user_type?: string | number
  }
  user_type?: string | number
  booth?: Booth
}

export async function login(
  email: string,
  password: string,
  boothCode: string,
): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/login', { email, password, booth_code: boothCode })
}

export function saveSession(res: LoginResponse): void {
  const token = res.token || res.access_token || ''
  if (token) localStorage.setItem('auth_token', token)
  localStorage.setItem('user_id', String(res.user?.id ?? res.id ?? ''))
  localStorage.setItem('user_type', String(res.user?.user_type ?? res.user_type ?? ''))

  const booth = res.booth
  if (booth?.booth_code) localStorage.setItem('booth_code', booth.booth_code)
  if (booth?.type) localStorage.setItem('booth_type', normalizeBoothType(booth.type))
  // Reconcile event_id theo booth vừa login để khỏi lẫn ảnh event cũ:
  // - có events → lấy id mới; - biết booth mà không có event mới → xóa id cũ
  // (booth event nhưng BE không trả events thì thà báo thiếu còn hơn lẫn lung tung)
  if (booth?.events?.length) {
    localStorage.setItem('event_id', String(booth.events[0].id))
  } else if (booth?.type) {
    localStorage.removeItem('event_id')
  }
}