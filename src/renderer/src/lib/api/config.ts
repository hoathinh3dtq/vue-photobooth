import { request } from './client'

export interface AppConfig {
  total_take_photo?: number
  time_to_take?: number
  mirror_camera?: number
  idol_position?: string
  re_take?: number
  hide_logout_button?: number
  booth_type?: number | string
  event_id?: number | string
  [key: string]: unknown
}

export async function getConfig(): Promise<AppConfig> {
  const res = await request<{ data?: AppConfig }>('GET', '/setting')
  return res.data ?? {}
}