import { request } from './client'

export interface Category {
  id: number
  type: string
  type_name: string
  price?: number
  thumbnail_url?: string
  print_name?: string
  total_photo?: number
}

export async function listCategories(userId: number): Promise<Category[]> {
  const res = await request<Category[] | { data?: Category[] }>(
    'GET',
    `/theme-types/list-by-user/${userId}`,
  )
  return Array.isArray(res) ? res : (res?.data || [])
}