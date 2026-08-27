<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useFlowStore } from '../stores/flow'
import { useSelectionStore } from '../stores/selection'

interface EventPhoto {
  filename: string
  path: string
}

const flowStore = useFlowStore()
const selectionStore = useSelectionStore()

const allPhotos = ref<EventPhoto[]>([])
const loading = ref(true)
const selected = ref<Set<number>>(new Set())
const maxSelect = 3
const thumbs = ref<Record<number, string>>({})

onMounted(async () => {
  const eventId = localStorage.getItem('event_id')
  if (!eventId) {
    flowStore.go('event-action')
    return
  }
  try {
    allPhotos.value = (await window.electronAPI.listEventPhotos(eventId)) || []
    allPhotos.value.forEach((photo, index) => {
      window.electronAPI
        .readEventPhoto(photo.path)
        .then((dataUrl) => {
          if (dataUrl) thumbs.value[index] = dataUrl
        })
        .catch(() => {})
    })
  } catch {
    allPhotos.value = []
  }
  loading.value = false
})

function toggle(index: number): void {
  const set = new Set(selected.value)
  if (set.has(index)) {
    set.delete(index)
  } else if (set.size < maxSelect) {
    set.add(index)
  }
  selected.value = set
}

async function goNext(): Promise<void> {
  const indices = [...selected.value].sort((a, b) => a - b)
  const photos: Array<{ image: string; retakeCount: number }> = []
  for (const idx of indices) {
    try {
      const dataUrl = await window.electronAPI.readEventPhoto(allPhotos.value[idx].path)
      if (dataUrl) photos.push({ image: dataUrl, retakeCount: 0 })
    } catch {}
  }
  if (photos.length === 0) return
  selectionStore.capturedPhotos = photos
  flowStore.go('select-theme')
}

function goBack(): void {
  flowStore.back('list-event-images')
}
</script>

<template>
  <div class="event-list-layout">
    <h2 class="event-list-title">Chọn ảnh để in</h2>
    <p class="event-list-sub">Chọn 2-3 ảnh (bấm vào ảnh để chọn)</p>

    <p v-if="loading" class="event-list-empty">Đang tải...</p>
    <p v-else-if="allPhotos.length === 0" class="event-list-empty">
      Chưa có ảnh nào. Hãy chụp ảnh trước.
    </p>

    <div v-else class="event-list-grid">
      <div
        v-for="(photo, index) in allPhotos"
        :key="photo.filename"
        class="event-list-item"
        :class="{ selected: selected.has(index) }"
        @click="toggle(index)"
      >
        <img v-if="thumbs[index]" class="event-list-thumb" :src="thumbs[index]" :alt="photo.filename" />
      </div>
    </div>

    <div class="event-list-actions">
      <button class="btn-camera" id="event-list-back" type="button" @click="goBack">Quay lại</button>
      <button class="btn-camera" id="event-list-next" type="button" :disabled="selected.size === 0" @click="goNext">
        Chọn theme
      </button>
    </div>
  </div>
</template>
