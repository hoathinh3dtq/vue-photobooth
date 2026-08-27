export const API_HOST: string =
  import.meta.env.VITE_API_HOST || 'https://admin.photobooth.top'

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
      if ((res.status === 401 || res.status === 403) && path !== '/login') {
        localStorage.removeItem('auth_token')
        window.location.reload()
        throw new Error('UNAUTHORIZED')
      }
      throw new Error(await res.text())
    }
    return (await res.json()) as T
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}