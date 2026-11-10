<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { STORAGE_URL } from '../lib/api/client'
import { uploadFrame, deleteAllFrames, bulkVisibility } from '../lib/api/frames'
import QREditor from '../components/QREditor.vue'

interface FrameHole { x: number; y: number; w: number; h: number; orientation: string }
interface FrameMeta { holes: FrameHole[]; fw: number; fh: number }

const router = useRouter()
const frames = ref<any[]>([])
const loading = ref(false)
const status = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const detected = ref<FrameMeta | null>(null)
const frameName = ref('')
const frameShape = ref('vertical')
const uploading = ref(false)

const ALLOWED_DIMS = [
  { w: 1200, h: 3600, label: 'Dải dọc 1200×3600' },
  { w: 2400, h: 3600, label: 'Nguyên khổ dọc 2400×3600' },
  { w: 3600, h: 2400, label: 'Nguyên khổ ngang 3600×2400' },
]

async function loadFrames() {
  loading.value = true
  try {
    const token = localStorage.getItem('auth_token') || ''
    const eventId = localStorage.getItem('event_id')
    const url = eventId
      ? `${import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'}/api/frames/all?event_id=${eventId}`
      : `${import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'}/api/frames/all`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    frames.value = json?.data || []
  } catch (e) {
    status.value = 'Lỗi tải frames: ' + String(e)
  } finally {
    loading.value = false
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  selectedFile.value = f
  detected.value = null
  previewUrl.value = URL.createObjectURL(f)
  const img = new Image()
  img.onload = () => {
    const ok = ALLOWED_DIMS.some((d) => d.w === img.naturalWidth && d.h === img.naturalHeight)
    if (!ok) {
      status.value = `Kích thước không hợp lệ (${img.naturalWidth}×${img.naturalHeight}). Cần: 1200×3600 / 2400×3600 / 3600×2400.`
      return
    }
    // run detector
    void detectHoles(f).then((m) => {
      detected.value = m
      if (m.holes.length === 0) {
        status.value = 'Không phát hiện lỗ (cần vùng trong suốt thật trong PNG).'
      } else {
        status.value = `Phát hiện ${m.holes.length} lỗ.`
      }
    })
  }
  img.src = URL.createObjectURL(f)
}

async function detectHoles(file: File): Promise<FrameMeta> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const r = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight))
      const aw = Math.max(1, Math.round(img.naturalWidth * r))
      const ah = Math.max(1, Math.round(img.naturalHeight * r))
      const canvas = document.createElement('canvas')
      canvas.width = aw; canvas.height = ah
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) { resolve({ holes: [], fw: img.naturalWidth, fh: img.naturalHeight }); return }
      ctx.clearRect(0, 0, aw, ah)
      ctx.drawImage(img, 0, 0, aw, ah)
      const data = ctx.getImageData(0, 0, aw, ah).data
      const total = aw * ah
      const alpha = new Uint8Array(total)
      for (let t = 0; t < total; t++) alpha[t] = data[t * 4 + 3] < 30 ? 1 : 0
      // union-find
      const uf = new Int32Array(total).fill(-1)
      function find(t: number): number { let root = t; while (uf[root] >= 0) root = uf[root]; while (uf[t] >= 0) { const nt = uf[t]; uf[t] = root; t = nt } return root }
      function union(a: number, b: number) { a = find(a); b = find(b); if (a === b) return; if (uf[a] > uf[b]) { const tmp = a; a = b; b = tmp } uf[a] += uf[b]; uf[b] = a }
      const compId = new Int32Array(total).fill(-1)
      let compCount = 0
      for (let y = 0; y < ah; y++) {
        for (let x = 0; x < aw; x++) {
          const idx = y * aw + x
          if (!alpha[idx]) continue
          const up = y > 0 ? compId[(y - 1) * aw + x] : -1
          const left = x > 0 ? compId[y * aw + (x - 1)] : -1
          if (up === -1 && left === -1) compId[idx] = compCount++
          else if (up !== -1 && left === -1) compId[idx] = up
          else if (up === -1 && left !== -1) compId[idx] = left
          else { compId[idx] = Math.min(up, left); union(up, left) }
        }
      }
      const compMap = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>()
      for (let y = 0; y < ah; y++) {
        for (let x = 0; x < aw; x++) {
          const idx = y * aw + x
          if (!alpha[idx]) continue
          const root = find(compId[idx])
          if (!compMap.has(root)) compMap.set(root, { minX: x, minY: y, maxX: x, maxY: y, count: 1 })
          else { const c = compMap.get(root)!; c.minX = Math.min(c.minX, x); c.minY = Math.min(c.minY, y); c.maxX = Math.max(c.maxX, x); c.maxY = Math.max(c.maxY, y); c.count++ }
        }
      }
      const minPixels = total * 0.005
      const M = 1 / r
      const pad = Math.ceil(M)
      const holes: FrameHole[] = []
      for (const [, c] of compMap) {
        if (c.count < minPixels) continue
        if (c.minX === 0 || c.minY === 0 || c.maxX === aw - 1 || c.maxY === ah - 1) continue
        const x = Math.max(0, Math.round(c.minX * M) - pad)
        const y = Math.max(0, Math.round(c.minY * M) - pad)
        const w = Math.round((c.maxX + 1) * M) + pad - x
        const h = Math.round((c.maxY + 1) * M) + pad - y
        holes.push({ x, y, w, h, orientation: w > h ? 'landscape' : w < h ? 'portrait' : 'square' })
      }
      holes.sort((a, b) => a.y - b.y || a.x - b.x)
      URL.revokeObjectURL(url)
      resolve({ holes, fw: img.naturalWidth, fh: img.naturalHeight })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ holes: [], fw: 0, fh: 0 }) }
    img.src = url
  })
}

async function upload() {
  if (!selectedFile.value || !detected.value) return
  if (detected.value.holes.length === 0) { status.value = 'Không có lỗ, không thể upload.'; return }
  uploading.value = true
  try {
    const eventId = localStorage.getItem('event_id')
    await uploadFrame(selectedFile.value, {
      name: frameName.value || selectedFile.value.name,
      shape: frameShape.value,
      holes: detected.value,
      qrX: 0,
      qrY: 0,
      qrSize: 200,
      enableOverlay: true,
      eventId: eventId || null,
    })
    status.value = 'Upload thành công!'
    selectedFile.value = null
    detected.value = null
    previewUrl.value = ''
    await loadFrames()
  } catch (e) {
    status.value = 'Lỗi upload: ' + String(e)
  } finally {
    uploading.value = false
  }
}

async function deleteAllFramesAction() {
  if (!confirm('Xóa tất cả frame?')) return
  try {
    await deleteAllFrames()
    await loadFrames()
    status.value = 'Đã xóa tất cả frame.'
  } catch (e) {
    status.value = 'Lỗi xóa tất cả: ' + String(e)
  }
}

async function setAllFramesActive(active: boolean) {
  try {
    await bulkVisibility(frames.value.map((f: any) => f.id), active)
    await loadFrames()
    status.value = active ? 'Đã bật tất cả frame.' : 'Đã tắt tất cả frame.'
  } catch (e) {
    status.value = 'Lỗi cập nhật trạng thái: ' + String(e)
  }
}

function frameImgUrl(f: any): string {
  if (!f?.image_path) return ''
  const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
  return `${String(host).replace(/\/$/, '')}/${String(f.image_path).replace(/^\//, '')}`
}

async function saveQr(frame: any) {
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    await fetch(`${host}/api/frames/${frame.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ qr_x: frame.qr_x, qr_y: frame.qr_y, qr_size: frame.qr_size, enable_overlay: frame.enable_overlay }),
    })
    status.value = 'Đã lưu QR.'
  } catch (e) { status.value = String(e) }
}

async function toggleActive(frame: any) {
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    await fetch(`${host}/api/frames/${frame.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !frame.is_active }),
    })
    await loadFrames()
  } catch (e) { status.value = String(e) }
}

async function removeFrame(frame: any) {
  if (!confirm('Xóa frame này?')) return
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const filename = (frame.image_path || '').split('/').pop()
    await fetch(`${host}/api/frames/delete/${filename}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    await loadFrames()
  } catch (e) { status.value = String(e) }
}

function goHome() { router.push('/home') }

onMounted(() => { void loadFrames() })
</script>

<template>
  <div style="padding:2vw; color:#333; font-family:sans-serif;">
    <h1>Frame của tôi</h1>
    <button @click="goHome">← Quay lại</button>
    <button @click="router.push('/frame-library')" style="margin-left:8px;">Kho frame dùng chung</button>

    <div style="margin:1vw 0; padding:1vw; border:1px solid #ddd; border-radius:8px;">
      <h3>Upload frame mới</h3>
      <input ref="fileInput" type="file" accept="image/png" @change="onFileChange" />
      <p style="font-size:12px; color:#666;">Kích thước đúng: 1200×3600 / 2400×3600 / 3600×2400 (PNG có vùng trong suốt).</p>
      <img v-if="previewUrl" :src="previewUrl" style="max-width:200px; margin:8px 0; border:1px solid #ccc;" />
      <div v-if="detected" style="margin:8px 0;">
        <p>Lỗ phát hiện: {{ detected.holes.length }} ({{ detected.fw }}×{{ detected.fh }})</p>
      </div>
      <div style="margin:8px 0;">
        <label>Tên: </label>
        <input v-model="frameName" style="width:200px;" />
        <label style="margin-left:8px;">Dạng: </label>
        <select v-model="frameShape">
          <option value="vertical">Dọc</option>
          <option value="horizontal">Ngang</option>
        </select>
      </div>
      <button @click="upload" :disabled="uploading || !detected || detected.holes.length === 0">
        {{ uploading ? 'Đang upload...' : 'Upload frame' }}
      </button>
      <div style="margin:8px 0; display:flex; gap:8px; flex-wrap:wrap;">
        <button @click="deleteAllFramesAction" style="font-size:12px;">Xóa tất cả frame</button>
        <button @click="setAllFramesActive(true)" style="font-size:12px;">Bật tất cả</button>
        <button @click="setAllFramesActive(false)" style="font-size:12px;">Tắt tất cả</button>
      </div>
      <p v-if="status" style="margin-top:8px; color:#b45309;">{{ status }}</p>
    </div>

    <div style="margin:1vw 0;">
      <h3>Danh sách frames ({{ frames.length }})</h3>
      <div v-if="loading">Đang tải...</div>
      <div v-for="f in frames" :key="f.id" style="display:flex; align-items:center; gap:12px; padding:8px; border-bottom:1px solid #eee;">
        <img :src="frameImgUrl(f)" style="width:60px; height:90px; object-fit:cover; border:1px solid #ccc;" />
        <div style="flex:1;">
          <div><strong>{{ f.name }}</strong></div>
          <div style="font-size:12px; color:#666;">{{ f.frame_shape }} · {{ (f.holes_metadata?.holes?.length) || 0 }} lỗ · {{ f.is_active ? 'active' : 'inactive' }}</div>
          <div style="margin-top:8px;">
            <QREditor
              :model-value="{ enabled: f.enable_overlay ?? true, x: f.qr_x ?? 0, y: f.qr_y ?? 0, size: f.qr_size ?? 200 }"
              :image-url="frameImgUrl(f)"
              :fw="f.holes_metadata?.fw || 1200"
              :fh="f.holes_metadata?.fh || 3600"
              @update:model-value="(val) => { f.qr_x = val.x; f.qr_y = val.y; f.qr_size = val.size; f.enable_overlay = val.enabled; }"
            />
            <button @click="saveQr(f)" style="font-size:11px; margin-top:6px;">Lưu QR</button>
          </div>
        </div>
        <button @click="toggleActive(f)">{{ f.is_active ? 'Tắt' : 'Bật' }}</button>
        <button @click="removeFrame(f)" style="color:red;">Xóa</button>
      </div>
    </div>
  </div>
</template>
