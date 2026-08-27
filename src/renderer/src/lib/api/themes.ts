import { request } from './client'

export interface ThemeItem {
  id: number
  ratio?: string
  src?: string
  processedSrc?: string
  slots?: unknown[]
  [key: string]: unknown
}

export function listThemesByCategory(
  categoryId: number | null,
  page = 1,
  perPage = 10,
  eventId: number | string | null = null,
): Promise<ThemeItem[]> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  if (eventId) params.set('event_id', String(eventId))
  else if (categoryId) params.set('category_id', String(categoryId))
  return request('GET', `/themes/list-by-type?${params.toString()}`) as Promise<ThemeItem[]>
}