<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  listPlatformFrames,
  listLayouts,
  importPlatformFrame,
  type PlatformFrame,
  type FrameLayout,
} from '../lib/api/frames'

const router = useRouter()
const platformFrames = ref<PlatformFrame[]>([])
const layouts = ref<FrameLayout[]>([])
const selectedFrame = ref<PlatformFrame | null>(null)
const selectedLayout = ref<FrameLayout | null>(null)
const loading = ref(false)
const importing = ref(false)
const status = ref('')

const qrEnabled = ref(false)
const qrX = ref(0)
const qrY = ref(0)
const qrSize = ref(200)

async function loadData() {
  loading.value = true
  status.value = ''
  try {
    const [frames, layoutsData] = await Promise.all([listPlatformFrames(), listLayouts()])
    platformFrames.value = frames
    layouts.value = layoutsData
    if (layouts.value.length && !selectedLayout.value) {
      selectedLayout.value = layouts.value[0]
    }
  } catch (e) {
    status.value = 'Lỗi tải dữ liệu: ' + String(e)
  } finally {
    loading.value = false
  }
}

async function importSelected() {
  if (!selectedFrame.value || !selectedLayout.value) {
    status.value = 'Chọn frame và layout trước.'
    return
  }
  importing.value = true
  status.value = ''
  try {
    await importPlatformFrame(
      selectedFrame.value.id,
      selectedLayout.value.id,
      qrEnabled.value ? qrX.value : 0,
      qrEnabled.value ? qrY.value : 0,
      qrEnabled.value ? qrSize.value : 200,
    )
    status.value = 'Import frame thành công.'
  } catch (e) {
    status.value = 'Lỗi import: ' + String(e)
  } finally {
    importing.value = false
  }
}

function goBack() {
  router.push('/my-frames')
}

onMounted(() => {
  void loadData()
})
</script>

<template>
  <div style="padding: 2vw; color: #333; font-family: sans-serif;">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:1vw;">
      <button @click="goBack">← Quay lại</button>
      <h1 style="margin:0;">Kho frame dùng chung</h1>
    </div>

    <div v-if="loading">Đang tải...</div>
    <p v-if="status" style="color:#b45309;">{{ status }}</p>

    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px; margin-top:16px;">
      <div>
        <h3>Frame platform ({{ platformFrames.length }})</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:12px;">
          <div
            v-for="frame in platformFrames"
            :key="frame.id"
            @click="selectedFrame = frame"
            :style="{
              border: selectedFrame?.id === frame.id ? '2px solid #2563eb' : '1px solid #ddd',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
            }"
          >
            <img
              v-if="frame.url || frame.image_path"
              :src="frame.url || frame.image_path"
              style="width:100%; height:120px; object-fit:cover; border:1px solid #eee;"
            />
            <div style="font-size:12px; margin-top:6px;">{{ frame.name }}</div>
          </div>
        </div>
      </div>

      <div style="border:1px solid #ddd; border-radius:8px; padding:12px;">
        <h3 style="margin-top:0;">Import vào layout</h3>

        <label style="display:block; margin-bottom:8px;">Layout</label>
        <select v-model="selectedLayout" style="width:100%; margin-bottom:12px;">
          <option v-for="layout in layouts" :key="layout.id" :value="layout">
            {{ layout.name }}
          </option>
        </select>

        <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <input type="checkbox" v-model="qrEnabled" />
          Bật QR
        </label>

        <div v-if="qrEnabled" style="display:grid; gap:8px; margin-bottom:12px;">
          <label>QR X <input type="number" v-model.number="qrX" style="width:80px;" /></label>
          <label>QR Y <input type="number" v-model.number="qrY" style="width:80px;" /></label>
          <label>QR Size <input type="number" v-model.number="qrSize" style="width:80px;" /></label>
        </div>

        <button
          @click="importSelected"
          :disabled="importing || !selectedFrame || !selectedLayout"
          style="width:100%;"
        >
          {{ importing ? 'Đang import...' : 'Import frame' }}
        </button>
      </div>
    </div>
  </div>
</template>
