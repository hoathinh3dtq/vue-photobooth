import { defineStore } from 'pinia'
import type { BoothFlow, BoothType, StepName } from '../lib/flows/types'
import { storeFlow } from '../lib/flows/store'
import { eventFlow } from '../lib/flows/event'
import router from '../router'

const ROUTE_BY_STEP: Record<StepName, string> = {
  home: '/home',
  'select-type': '/select-type',
  'event-action': '/event-action',
  'list-event-images': '/list-event-images',
  camera: '/camera',
  'select-theme': '/select-theme',
  finish: '/finish',
}

function pickFlow(): BoothFlow {
  return localStorage.getItem('booth_type') === 'event' ? eventFlow : storeFlow
}

export const useFlowStore = defineStore('flow', {
  state: () => ({
    flow: pickFlow() as BoothFlow,
  }),
  getters: {
    // Đọc booth_type LIVE thay vì so loại flow object được ghim lúc mở app:
    // flow object có thể là storeFlow nếu app mở trước khi booth_type được lưu.
    type: (): BoothType => (localStorage.getItem('booth_type') === 'event' ? 'event' : 'store'),
  },
  actions: {
    reload(): void {
      this.flow = pickFlow()
    },
    go(name: StepName): void {
      this.routerPush(ROUTE_BY_STEP[name])
    },
    next(from: StepName): void {
      const idx = this.flow.screens.indexOf(from)
      const target = this.flow.screens[idx + 1] || 'home'
      this.routerPush(ROUTE_BY_STEP[target])
    },
    back(from: StepName): void {
      const idx = this.flow.screens.indexOf(from)
      const target = this.flow.screens[idx - 1] || 'home'
      this.routerPush(ROUTE_BY_STEP[target])
    },
    routerPush(path: string): void {
      void router.push(path)
    },
  },
})