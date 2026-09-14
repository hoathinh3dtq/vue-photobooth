import { defineStore } from 'pinia'
import type { Category } from '../lib/api/categories'

export interface CapturedPhoto {
  image: string
  retakeCount: number
  filteredImage?: string
}

const SELECTION_STORAGE_KEY = 'pb_selection'

function loadPersistedSelection(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SELECTION_STORAGE_KEY) || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

export const useSelectionStore = defineStore('selection', {
  state: () => {
    const p = loadPersistedSelection()
    return {
      type: String(p.type || ''),
      printName: String(p.printName || ''),
      categoryId: Number(p.categoryId) || 0,
      totalPhoto: Number(p.totalPhoto) || 0,
      typeIdol: Number(p.typeIdol) || 0,
      idolIcons: Array.isArray(p.idolIcons) ? (p.idolIcons as unknown[]).map((u) => String(u || '')) : [],
      idolFrameUrl: String(p.idolFrameUrl || ''),
      capturedPhotos: [] as CapturedPhoto[],
      selectedTheme: String(p.selectedTheme || ''),
      selectedTone: 'none',
    }
  },
  actions: {
    select(cat: Category): void {
      this.type = cat.type
      this.printName = cat.print_name || ''
      this.categoryId = cat.id
      this.totalPhoto = cat.total_photo || 0
      this.typeIdol = Number(cat.type_idol) || 0
      this.idolIcons = []
      this.selectedTheme = ''
      this.persistSelection()
    },
    saveIdolTheme(themeKey: string, frameUrl: string, icons: string[]): void {
      this.selectedTheme = themeKey
      this.idolFrameUrl = frameUrl
      this.idolIcons = icons
      this.persistSelection()
    },
    persistSelection(): void {
      try {
        localStorage.setItem(
          SELECTION_STORAGE_KEY,
          JSON.stringify({
            type: this.type,
            printName: this.printName,
            categoryId: this.categoryId,
            totalPhoto: this.totalPhoto,
            typeIdol: this.typeIdol,
            selectedTheme: this.selectedTheme,
            idolFrameUrl: this.idolFrameUrl,
            idolIcons: this.idolIcons,
          }),
        )
      } catch {
        /* storage unavailable: keep in-memory only */
      }
    },
    reset(): void {
      this.capturedPhotos = []
      this.selectedTheme = ''
      this.selectedTone = 'none'
    },
  },
})