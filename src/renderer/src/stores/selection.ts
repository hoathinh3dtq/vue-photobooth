import { defineStore } from 'pinia'
import type { Category } from '../lib/api/categories'

export interface CapturedPhoto {
  image: string
  retakeCount: number
  filteredImage?: string
}

export const useSelectionStore = defineStore('selection', {
  state: () => ({
    type: '',
    printName: '',
    categoryId: 0,
    totalPhoto: 0,
    capturedPhotos: [] as CapturedPhoto[],
    selectedTheme: '',
    selectedTone: 'none',
  }),
  actions: {
    select(cat: Category): void {
      this.type = cat.type
      this.printName = cat.print_name || ''
      this.categoryId = cat.id
      this.totalPhoto = cat.total_photo || 0
    },
    reset(): void {
      this.capturedPhotos = []
      this.selectedTheme = ''
      this.selectedTone = 'none'
    },
  },
})