import { defineStore } from 'pinia'
import { getConfig, normalizeBoothType, type AppConfig } from '../lib/api/config'
import { useFlowStore } from './flow'
import { showModal, hideModal } from '../lib/modal'

let planExpiredHandled = false

// Hết gói (BE 403 + code PLAN_EXPIRED): hiện modal + tự logout sau 5s
function notifyPlanExpired(message: string): void {
  if (planExpiredHandled) return
  planExpiredHandled = true
  const safeMsg = message || 'Gói dịch vụ của booth đã hết hạn.'
  let remain = 5
  showModal(
    `<p>${safeMsg}</p><p style="font-size:0.9vw;opacity:0.7;">Thiết bị sẽ tự đăng xuất sau <b id="plan-expired-count">5</b>s</p>`,
    false,
  )
  const timer = setInterval(() => {
    remain -= 1
    const el = document.getElementById('plan-expired-count')
    if (el) el.textContent = String(Math.max(remain, 0))
    if (remain <= 0) {
      clearInterval(timer)
      hideModal()
      try {
        localStorage.clear()
      } catch {}
      window.location.reload()
    }
  }, 1000)
}

function syncBoothInfo(config: AppConfig): void {
  const boothType = config.booth_type
  if (boothType !== undefined && boothType !== null) {
    localStorage.setItem('booth_type', normalizeBoothType(boothType))
  }
  const eventId = config.event_id
  if (eventId !== undefined && eventId !== null) {
    localStorage.setItem('event_id', String(eventId))
  } else if (boothType !== undefined && boothType !== null && normalizeBoothType(boothType) !== 'event') {
    localStorage.removeItem('event_id')
  }
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    config: null as AppConfig | null,
    loading: false,
    loaded: false,
    error: '',
  }),
  getters: {
    isEvent: (state) => localStorage.getItem('booth_type') === 'event',
  },
  actions: {
    async fetchConfig(): Promise<AppConfig | null> {
      if (this.loading) return this.config
      this.loading = true
      this.error = ''
      try {
        const cfg = await getConfig()
        this.config = cfg
        this.loaded = true
        syncBoothInfo(cfg)
        try {
          useFlowStore().reload()
        } catch {
          /* flow store chưa khởi tạo: bỏ qua */
        }
        return cfg
      } catch (e) {
        this.error = (e as Error).message
        if ((e as { code?: string }).code === 'PLAN_EXPIRED') {
          notifyPlanExpired((e as Error).message)
        }
        return null
      } finally {
        this.loading = false
      }
    },
  },
})