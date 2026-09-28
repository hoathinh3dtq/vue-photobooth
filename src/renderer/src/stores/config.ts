import { defineStore } from 'pinia'
import { getConfig, normalizeBoothType, type AppConfig } from '../lib/api/config'
import { useFlowStore } from './flow'

function syncBoothInfo(config: AppConfig): void {
  const boothType = config.booth_type
  if (boothType !== undefined && boothType !== null) {
    localStorage.setItem('booth_type', normalizeBoothType(boothType))
  }
  const eventId = config.event_id
  if (eventId !== undefined && eventId !== null) {
    localStorage.setItem('event_id', String(eventId))
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
        return null
      } finally {
        this.loading = false
      }
    },
  },
})