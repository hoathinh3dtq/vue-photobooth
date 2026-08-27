import { request, BASE_URL, getToken } from './client'

function getEventId(): string | null {
  if (localStorage.getItem('booth_type') !== 'event') return null
  return localStorage.getItem('event_id')
}

export async function printSession(sessionId: string, categoryId: number | null): Promise<string | null> {
  const body: Record<string, unknown> = { session_id: sessionId }
  if (categoryId) body.category_id = categoryId
  const eventId = getEventId()
  if (eventId) body.event_id = eventId
  const res = await request<{ qr_code?: string; data?: { qr_code?: string } }>(
    'POST',
    '/sessions/print',
    body,
    30000,
  )
  return res.qr_code || res.data?.qr_code || null
}

export async function uploadImg(
  sessionId: string,
  categoryId: number | null,
  printedImage: string,
  photos: Array<{ image: string }>,
  videoBlob: Blob | null,
): Promise<unknown> {
  const token = getToken()
  const body = new URLSearchParams()
  body.append('session_id', sessionId)
  if (categoryId) body.append('category_id', String(categoryId))
  const eventId = getEventId()
  if (eventId) body.append('event_id', String(eventId))
  body.append('printed_image', printedImage)
  photos.forEach((p) => body.append('raw_photos[]', p.image))
  if (videoBlob) {
    const b64 = await new Promise<string>((r) => {
      const rd = new FileReader()
      rd.onload = () => r(rd.result as string)
      rd.readAsDataURL(videoBlob)
    })
    body.append('timelapse_video', b64)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const res = await fetch(`${BASE_URL}/sessions/upload_img`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body.toString(),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('auth_token')
        window.location.reload()
        return null
      }
      throw new Error(await res.text())
    }
    return res.json()
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}