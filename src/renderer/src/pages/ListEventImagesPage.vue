<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useFlowStore } from '../stores/flow'
import { useSelectionStore } from '../stores/selection'
import FlowerLoader from '../components/FlowerLoader.vue'

interface EventPhoto {
  filename: string
  path: string
}

const flowStore = useFlowStore()
const selectionStore = useSelectionStore()

const allPhotos = ref<EventPhoto[]>([])
const loading = ref(true)
const selected = ref<Set<number>>(new Set())
const maxSelect = 5
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
  <div class="ev-root">
    <svg class="ev-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f0b9cd"
      />
      <path
        d="M1680,560 C1500,600 1440,720 1470,840 C1490,910 1550,940 1610,960 L1680,960 L1680,560 Z"
        fill="#f0b9cd"
      />
    </svg>

    <svg class="ev-heart ev-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>

    <header class="ev-head">
      <h1>Chọn ảnh để in</h1>
      <p>Chọn tối đa 5 ảnh (bấm vào ảnh để chọn)</p>
    </header>

    <FlowerLoader v-if="loading" />
    <p v-else-if="allPhotos.length === 0" class="ev-empty">
      Chưa có ảnh nào. Hãy chụp ảnh trước.
    </p>

    <div v-else class="ev-grid">
      <div
        v-for="(photo, index) in allPhotos"
        :key="photo.filename"
        class="ev-item"
        :class="{ selected: selected.has(index) }"
        @click="toggle(index)"
      >
        <img v-if="thumbs[index]" class="ev-thumb" :src="thumbs[index]" :alt="photo.filename" />
        <span v-if="selected.has(index)" class="ev-check" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="#fff"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>

    <div class="ev-actions">
      <button class="ev-btn ev-btn-ghost" id="event-list-back" type="button" @click="goBack">Quay lại</button>
      <button
        class="ev-btn ev-btn-primary"
        id="event-list-next"
        type="button"
        :disabled="selected.size === 0"
        @click="goNext"
      >
        Chọn theme
      </button>
    </div>

    <div class="ev-sign" aria-hidden="true">for your smile ♡</div>
  </div>
</template>

<style scoped>
.ev-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #f2d3de;
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3vh 4vw;
  box-sizing: border-box;
}
.ev-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ev-heart {
  position: absolute;
  z-index: 1;
  width: 2.8vmin;
  left: 8%;
  top: 22%;
}
.ev-head {
  position: relative;
  z-index: 2;
  text-align: center;
  margin-bottom: 1vh;
}
.ev-head h1 {
  margin: 0;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 4.6vmin;
  font-weight: 800;
  color: #5b3a44;
}
.ev-head p {
  margin: 0.5vh 0 0;
  font-size: 2vmin;
  font-weight: 600;
  color: #9a8f94;
}
.ev-empty {
  position: relative;
  z-index: 2;
  margin: auto;
  font-size: 2.2vmin;
  font-weight: 600;
  color: #9a8f94;
}
.ev-grid {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-content: flex-start;
  gap: 1.4vw;
  overflow-y: auto;
  padding: 1vh 0.5vw 2vh;
  box-sizing: border-box;
  scrollbar-width: none;
}
.ev-grid::-webkit-scrollbar {
  display: none;
}
.ev-item {
  position: relative;
  flex: 0 0 auto;
  width: 27vh;
  height: 20vh;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  border: 2px solid transparent;
  padding: 6px;
  box-sizing: border-box;
  cursor: pointer;
  box-shadow: 0 0.5vh 1.5vh rgba(190, 100, 140, 0.16);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.ev-item:hover {
  transform: translateY(-0.4vh);
}
.ev-item.selected {
  border-color: #ef5b8d;
  box-shadow: 0 0.8vh 2.2vh rgba(239, 91, 141, 0.35);
}
.ev-thumb {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 10px;
  background: #f9e7ee;
}
.ev-check {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 3.4vh;
  height: 3.4vh;
  border-radius: 50%;
  background: linear-gradient(135deg, #f7a9c6, #ef5b8d);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0.4vh 1.2vh rgba(239, 91, 141, 0.5);
}
.ev-check svg {
  width: 55%;
  height: 55%;
}
.ev-actions {
  position: relative;
  z-index: 2;
  display: flex;
  gap: 1.6vw;
  margin-top: 2vh;
}
.ev-btn {
  padding: 1.4vh 3vw;
  border-radius: 999px;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 2.2vmin;
  font-weight: 800;
  cursor: pointer;
}
.ev-btn-primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #ef5b8d, #f2709c);
  box-shadow: 0 0.6vh 1.8vh rgba(239, 91, 141, 0.4);
}
.ev-btn-primary:disabled {
  opacity: 0.45;
  filter: grayscale(0.5);
  cursor: not-allowed;
  box-shadow: none;
}
.ev-btn-ghost {
  border: 1px solid #f4a9c6;
  color: #b04a68;
  background: #fff;
  box-shadow: 0 0.4vh 1.2vh rgba(239, 91, 141, 0.12);
}
.ev-sign {
  position: absolute;
  right: 3vw;
  bottom: 2.6vh;
  z-index: 2;
  transform: rotate(-6deg);
  font-family: 'Segoe Script', 'Segoe Print', cursive;
  font-size: 2.4vmin;
  color: #ef8fae;
}
</style>
