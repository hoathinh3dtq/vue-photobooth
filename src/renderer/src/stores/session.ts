import { defineStore } from 'pinia'

export interface PendingUpload {
  sessionId: string
  status: 'uploading' | 'done' | 'failed'
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    pendingUploads: [] as PendingUpload[],
    sessionQR: '',
    timeLapsePath: '',
    timeLapseBlob: null as Blob | null,
    lastPrintedImage: '',
    lastPrintOptions: {} as { type?: string; printName?: string },
  }),
  actions: {
    resetSession(): void {
      this.pendingUploads = []
      this.sessionQR = ''
      this.timeLapsePath = ''
      this.timeLapseBlob = null
      this.lastPrintedImage = ''
      this.lastPrintOptions = {}
    },
  },
})