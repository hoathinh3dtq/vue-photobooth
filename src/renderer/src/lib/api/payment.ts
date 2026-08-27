import { request } from './client'

export function createPaymentQR(themeTypeId: number, extra: Record<string, unknown> = {}) {
  return request('POST', '/invoices', { theme_type_id: themeTypeId, ...extra })
}

export function checkPaymentStatus(paymentId: number | string) {
  return request('GET', `/invoices/${paymentId}/status`)
}