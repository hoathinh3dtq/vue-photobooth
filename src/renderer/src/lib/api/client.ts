export const API_HOST: string =
  import.meta.env.VITE_API_HOST || (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://admin.photobooth.top')

export const BASE_URL = `${API_HOST}/api`
export const STORAGE_URL = API_HOST

export function getToken(): string {
  return localStorage.getItem('auth_token') || ''
}

export async function request<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts: RequestInit = { method, headers }
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    opts.body = new URLSearchParams(body as Record<string, string>).toString()
  }

  const controller = new AbortController()
  opts.signal = controller.signal
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${BASE_URL}${path}`, opts)
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text()
      let code = ''
      let message = ''
      try {
        const parsed = JSON.parse(text) as { code?: unknown; message?: unknown }
        code = String(parsed?.code || '')
        message = String(parsed?.message || '')
      } catch {
        /* response không phải JSON: giữ text gốc */
      }
      // Hết gói BE trả 403 + code PLAN_EXPIRED: ném lỗi có cấu trúc để
      // tầng trên hiện modal gia hạn, KHÔNG xóa token/reload như 401
      if (code === 'PLAN_EXPIRED') {
        const err = new Error(message || 'PLAN_EXPIRED') as Error & { code?: string; status?: number }
        err.code = code
        err.status = res.status
        throw err
      }
      if ((res.status === 401 || res.status === 403) && path !== '/login') {
        localStorage.removeItem('auth_token')
        window.location.reload()
        throw new Error('UNAUTHORIZED')
      }
      throw new Error(text)
    }
    return (await res.json()) as T
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}