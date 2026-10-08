import { request } from './client'

export type BoothTypeName = 'event' | 'normal'

// Chuẩn hóa loại booth từ BE (chấp nhận 1/'1'/'event', không phân biệt hoa thường)
export function normalizeBoothType(value: unknown): BoothTypeName {
  if (value === 1 || value === true) return 'event'
  const s = String(value ?? '').trim().toLowerCase()
  return s === 'event' || s === '1' || s === 'true' ? 'event' : 'normal'
}

export interface AppConfig {
  total_take_photo?: number
  time_to_take?: number
  mirror_camera?: number
  re_take?: number
  hide_logout_button?: number
  booth_type?: number | string
  event_id?: number | string
  printer_26?: string
  printer_46?: string
  test_photo?: number | string | boolean
  [key: string]: unknown
}

export async function getConfig(boothCode?: string | null): Promise<AppConfig> {
  const code = boothCode ?? localStorage.getItem('booth_code') ?? ''
  const q = code ? `?booth_code=${encodeURIComponent(code)}` : ''
  const res = await request<{ data?: AppConfig }>('GET', `/setting${q}`)
  return res.data ?? {}
}