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
      if (!ratio) return false
      const [rw] = ratio.split('/').map((s) => parseFloat(s.trim()))
      return rw === 1200
    },
    beforePrint: async () => true,
  },
}