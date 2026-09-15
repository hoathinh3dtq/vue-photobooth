import { defineStore } from 'pinia'
import type { Category } from '../lib/api/categories'

export interface CapturedPhoto {
  image: string
  retakeCount: number
  filteredImage?: string
}

export interface IdolIcon {
  url: string
  side: 'left' | 'right'
}

// Vị trí idol theo từng icon: 0/'left' = trái, 1/'right' = phải, thiếu thì trái
export function normalizeIdolSide(value: unknown): 'left' | 'right' {
  const v = String(value ?? 'left').trim().toLowerCase()
  if (v === '1' || v === 'right' || v === 'r') return 'right'
  return 'left'
}

function normalizeIdolIcons(value: unknown): IdolIcon[] {
  if (!Array.isArray(value)) return []
  return (value as unknown[])
    .map((it): IdolIcon | null => {
      if (typeof it === 'string') return it ? { url: it, side: 'left' } : null
      const o = it as Record<string, unknown>
      const url = String(o.url ?? o.image_url ?? o.src ?? '')
      if (!url) return null
      return { url, side: normalizeIdolSide(o.side ?? o.position ?? o.pos ?? o.align) }
    })
    .filter((it): it is IdolIcon => it !== null)
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
      idolIcons: normalizeIdolIcons(p.idolIcons),
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
    saveIdolTheme(themeKey: string, frameUrl: string, icons: IdolIcon[]): void {
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