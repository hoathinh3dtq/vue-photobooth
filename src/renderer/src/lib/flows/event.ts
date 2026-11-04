import type { BoothFlow } from './types'
import { listThemesByCategory } from '../api/themes'
import { printSession as printSessionApi } from '../api/print'
import { useConfigStore } from '../../stores/config'

export const eventFlow: BoothFlow = {
  screens: ['home', 'event-action', 'camera', 'select-theme', 'finish'],
  camera: {
    totalTake() {
      const cfg = useConfigStore()
      return cfg.config?.total_take_photo || 5
    },
  },
  selectTheme: {
    listThemes(page) {
      const eventId = localStorage.getItem('event_id')
      return listThemesByCategory(null, page, 10, eventId)
    },
    printSession(sessionId) {
      return printSessionApi(sessionId, null)
    },
    previewLabel: () => 'IN ẢNH',
    copies: () => 1,
    isTwoBySix(ratio) {
      // Phân loại theo TỈ LỄ thay vì chiều ngang === 1200:
      // 2x6 là 1:3 (~0.33), 4x6 là 2:3 (~0.67). Cũ so `rw === 1200` khiến
      // theme "1200 / 1800" (2:3) nhầm thành 2x6 -> ghép đôi + cắt đôi giấy.
      if (!ratio) return false
      const [rw, rh] = ratio.split('/').map((s) => parseFloat(s.trim()))
      if (!rw || !rh) return false
      return Math.abs(rw / rh - 1 / 3) < 0.08
    },
    beforePrint: async () => true,
  },
}