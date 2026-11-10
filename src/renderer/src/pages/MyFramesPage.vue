<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  listFrames,
  uploadFrame,
  updateFrame,
  deleteFrameByFilename,
  deleteAllFrames,
  bulkVisibility,
  type FrameItem,
} from '../lib/api/frames'
import QREditor from '../components/QREditor.vue'

const router = useRouter()
const frames = ref<FrameItem[]>([])
const loading = ref(false)
const status = ref('')
const statusOk = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const previewUrl = ref('')
const detected = ref<{ holes: any[]; fw: number; fh: number } | null>(null)
const frameName = ref('')
const frameShape = ref('vertical')
const uploading = ref(false)
const selectedId = ref<string | number | null>(null)

const selectedFrame = computed(() => frames.value.find(f => String(f.id) === String(selectedId.value)))
const currentFrame = computed(() => selectedFrame.value as FrameItem)

interface EventItem {
  id: number | string
  name: string
  status: number
}

const events = ref<EventItem[]>([])
const activeEventId = ref(localStorage.getItem('event_id') || '')
const newEventName = ref('')
const eventStatus = ref('')

const eventLabel = computed(() =>
  activeEventId.value
    ? events.value.find(e => String(e.id) === String(activeEventId.value))?.name || 'Sự kiện đã chọn'
    : 'Booth (không theo sự kiện)'
)

function setStatus(msg: string, ok = false) {
  status.value = msg
  statusOk.value = ok
}
const eventId = computed(() => activeEventId.value || localStorage.getItem('event_id') || '')

function frameImgUrl(f: FrameItem): string {
  const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
  const raw = String(f.image_path || '')
  if (!raw) return ''
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw
  return `${String(host).replace(/\/$/, '')}/${raw.replace(/^\//, '')}`
}

async function loadFrames() {
  loading.value = true
  try {
    frames.value = await listFrames(eventId.value || null)
  } catch (e) {
    setStatus('Lỗi tải frames: ' + String(e))
  } finally {
    loading.value = false
  }
}

async function loadEvents() {
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const res = await fetch(`${host}/api/events`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const j = await res.json()
    events.value = j?.events || j?.data || []
  } catch { /* ignore */ }
}

async function createInlineEvent() {
  const name = newEventName.value.trim()
  if (!name) { eventStatus.value = 'Nhập tên sự kiện.'; return }
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const res = await fetch(`${host}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, status: 1 }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j?.message || 'Tạo sự kiện thất bại')
    const evId = j?.data?.id ?? j?.id
    if (evId) {
      activeEventId.value = String(evId)
      localStorage.setItem('event_id', String(evId))
      localStorage.setItem('booth_type', 'event')
    }
    newEventName.value = ''
    eventStatus.value = evId ? 'Đã tạo và chọn sự kiện.' : 'Đã tạo.'
    await loadEvents()
    await loadFrames()
  } catch (e) {
    eventStatus.value = 'Lỗi: ' + String(e)
  }
}

function selectEvent(ev: EventItem | null) {
  if (ev) {
    activeEventId.value = String(ev.id)
    localStorage.setItem('event_id', String(ev.id))
    localStorage.setItem('booth_type', 'event')
  } else {
    activeEventId.value = ''
    localStorage.removeItem('event_id')
    localStorage.setItem('booth_type', 'store')
  }
  loadFrames()
}

async function detectHoles(file: File): Promise<{ holes: any[]; fw: number; fh: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const r = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight))
      const aw = Math.max(1, Math.round(img.naturalWidth * r))
      const ah = Math.max(1, Math.round(img.naturalHeight * r))
      const canvas = document.createElement('canvas')
      canvas.width = aw; canvas.height = ah
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) { URL.revokeObjectURL(url); resolve({ holes: [], fw: img.naturalWidth, fh: img.naturalHeight }); return }
      ctx.clearRect(0, 0, aw, ah)
      ctx.drawImage(img, 0, 0, aw, ah)
      const data = ctx.getImageData(0, 0, aw, ah).data
      const total = aw * ah
      const alpha = new Uint8Array(total)
      for (let t = 0; t < total; t++) alpha[t] = data[t * 4 + 3] < 30 ? 1 : 0
      const uf = new Int32Array(total).fill(-1)
      function find(t: number): number { let root = t; while (uf[root] >= 0) root = uf[root]; while (uf[t] >= 0) { const nt = uf[t]; uf[t] = root; t = nt } return root }
      function union(a: number, b: number) { a = find(a); b = find(b); if (a === b) return; if (uf[a] > uf[b]) { const t = a; a = b; b = t } uf[a] += uf[b]; uf[b] = a }
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
      const holes: any[] = []
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

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  selectedFile.value = f
  detected.value = null
  previewUrl.value = URL.createObjectURL(f)
  const img = new Image()
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight
    const valid = (w === 1200 && h === 3600) || (w === 2400 && h === 3600) || (w === 3600 && h === 2400)
    if (!valid) setStatus(`Kích thước ${w}x${h} sai — cần 1200×3600, 2400×3600 hoặc 3600×2400.`)
    else if (!frameName.value) frameName.value = f.name.replace(/\.png$/i, '')
    // detect holds
    detectHoles(f).then(m => { detected.value = m; setStatus(`Phát hiện ${m.holes.length} lỗ.`, true) })
  }
  img.src = URL.createObjectURL(f)
}

async function doUpload() {
  if (!selectedFile.value || !detected.value) return
  uploading.value = true
  try {
    const saved = await uploadFrame(selectedFile.value, {
      name: frameName.value || selectedFile.value.name,
      frame: frameShape.value,
      holesMetadata: detected.value,
      eventId: eventId.value || null,
      qrX: 0,
      qrY: 0,
      qrSize: 200,
      enableOverlay: true,
    })
    setStatus('Đã lưu frame thành công!', true)
    selectedFile.value = null
    detected.value = null
    previewUrl.value = ''
    frameName.value = ''
    await loadFrames()
    if (saved?.id) selectedId.value = saved.id
  } catch (e) {
    setStatus('Lỗi: ' + String(e))
  } finally {
    uploading.value = false
  }
}

async function saveFrame(f: FrameItem) {
  try {
    await updateFrame(f.id, {
      qr_x: f.qr_x, qr_y: f.qr_y, qr_size: f.qr_size, enable_overlay: f.enable_overlay,
    })
    setStatus('Đã lưu QR.', true)
    await loadFrames()
  } catch (e) {
    setStatus('Lỗi lưu: ' + String(e))
  }
}

async function toggleActive(f: FrameItem) {
  try {
    await updateFrame(f.id, { is_active: !f.is_active })
    await loadFrames()
  } catch (e) { setStatus(String(e)) }
}

async function removeFrame(f: FrameItem) {
  if (!confirm('Xóa frame này?')) return
  const filename = String(f.image_path || '').split('/').pop() || ''
  try {
    await deleteFrameByFilename(filename)
    await loadFrames()
  } catch (e) { setStatus('Lỗi xóa: ' + String(e)) }
}

async function deleteAll() {
  if (!confirm('Xóa tất cả frame?')) return
  try {
    await deleteAllFrames()
    await loadFrames()
    setStatus('Đã xóa tất cả frame.', true)
  } catch (e) { setStatus(String(e)) }
}

async function setAllActive(active: boolean) {
  try {
    await bulkVisibility(frames.value.map(f => f.id), active)
    await loadFrames()
    setStatus(active ? 'Đã bật tất cả.' : 'Đã tắt tất cả.', true)
  } catch (e) { setStatus(String(e)) }
}

function goBack() { router.push('/settings') }
function goLibrary() { router.push('/frame-library') }

onMounted(() => { void loadEvents(); void loadFrames() })
</script>

<template>
  <div class="mf-root">
    <header class="mf-head">
      <button class="mf-back" @click="goBack">← Quay lại</button>
      <div>
        <h1>Frame của tôi</h1>
        <p>Tải frame PNG — hiện tại: <strong>{{ eventLabel }}</strong></p>
      </div>
      <button class="mf-lib" @click="goLibrary">☁ Kho frame dùng chung</button>
    </header>

    <section class="mf-event-bar">
      <div class="mf-event-info">
        <span class="mf-label">Đang thêm frame cho</span>
        <select v-model="activeEventId" @change="selectEvent(events.find(e => String(e.id) === String(activeEventId)) || null)" style="padding:8px 12px; border-radius:10px; border:1px solid #f4b4cb;">
          <option value="">Booth (không theo sự kiện)</option>
          <option v-for="ev in events" :key="ev.id" :value="String(ev.id)">{{ ev.name }}</option>
        </select>
      </div>
      <div class="mf-event-create">
        <input v-model="newEventName" placeholder="Tên sự kiện mới…" @keyup.enter="createInlineEvent" />
        <button class="mf-lib" @click="createInlineEvent">+ Tạo</button>
      </div>
    </section>

    <!-- Upload card -->
    <section class="mf-card">
      <div class="mf-card-title">＋ Upload frame mới</div>
      <div class="mf-upload">
        <button v-if="!previewUrl" class="mf-drop" @click="(fileInput as HTMLInputElement)?.click()">
          <div class="mf-drop-icon">🖼️</div>
          <div><strong>Chọn file PNG</strong></div>
          <small>1200×3600 / 2400×3600 / 3600×2400 · PNG có vùng trong suốt</small>
        </button>

        <div v-else class="mf-preview">
          <img :src="previewUrl" alt="" />
          <div class="mf-preview-info">
            <div class="mf-badge" v-if="detected">{{ detected.holes.length }} lỗ · {{ detected.fw }}×{{ detected.fh }}</div>
            <input v-model="frameName" placeholder="Tên frame" class="mf-input" />
            <select v-model="frameShape" class="mf-input">
              <option value="vertical">Dọc (strip 1200×3600)</option>
              <option value="full-vertical">Nguyên khổ dọc 2400×3600</option>
              <option value="full-horizontal">Nguyên khổ ngang 3600×2400</option>
            </select>
            <div class="mf-row">
              <button class="mf-cancel" @click="selectedFile = null; detected = null; previewUrl = ''">Đổi ảnh</button>
              <button class="mf-upload-btn" :disabled="uploading || !detected" @click="doUpload">
                {{ uploading ? 'Đang lưu...' : 'Lưu frame' }}
              </button>
            </div>
          </div>
        </div>

        <input ref="fileInput" type="file" accept="image/png" hidden @change="onFileChange" />
      </div>
      <p v-if="status" class="mf-status" :class="{ ok: statusOk }">{{ status }}</p>
      <div class="mf-bulk">
        <button @click="deleteAll">Xóa tất cả</button>
        <button @click="setAllActive(true)">Bật tất cả</button>
        <button @click="setAllActive(false)">Tắt tất cả</button>
      </div>
    </section>

    <!-- Danh sách -->
    <section class="mf-list">
      <div class="mf-list-head">Danh sách ({{ frames.length }})</div>
      <div v-if="loading" class="mf-empty">Đang tải...</div>
      <div v-else-if="frames.length === 0" class="mf-empty">Chưa có frame nào. Upload ở trên!</div>

      <div v-else class="mf-grid">
        <div v-for="f in frames" :key="f.id" class="mf-tile" :class="{ selected: selectedId === f.id }" @click="selectedId = f.id">
          <img :src="frameImgUrl(f)" :alt="f.name" />
          <span class="mf-badge">{{ f.holes_metadata?.holes?.length || 0 }}</span>
          <span class="mf-badge mf-badge-overlay" v-if="f.enable_overlay">Overlay: Bật</span>
          <div class="mf-tile-name">{{ f.name }}</div>
          <div class="mf-tile-foot">
            <span class="mf-pill" :class="{ on: f.is_active }">{{ f.is_active ? 'On' : 'Off' }}</span>
            <button class="mf-mini" @click.stop="toggleActive(f)">{{ f.is_active ? 'Tắt' : 'Bật' }}</button>
            <button class="mf-mini danger" @click.stop="removeFrame(f)">✕</button>
          </div>
        </div>
      </div>

      <!-- Detail editor -->
      <div v-if="selectedFrame" class="mf-editor">
        <div class="mf-editor-head">
          <strong>{{ selectedFrame.name }}</strong>
          <button class="mf-mini" @click="selectedId = null">Đóng</button>
        </div>
        <QREditor
          :model-value="{ enabled: currentFrame.enable_overlay ?? true, x: currentFrame.qr_x ?? 0, y: currentFrame.qr_y ?? 0, size: currentFrame.qr_size ?? 200 }"
          :image-url="frameImgUrl(currentFrame)"
          :fw="currentFrame.holes_metadata?.fw || 1200"
          :fh="currentFrame.holes_metadata?.fh || 3600"
          @update:model-value="(val) => { currentFrame.qr_x = val.x; currentFrame.qr_y = val.y; currentFrame.qr_size = val.size; currentFrame.enable_overlay = val.enabled; }"
        />
        <button class="mf-save" @click="saveFrame(currentFrame)">Lưu QR</button>
      </div>
    </section>

    <input ref="fileInput" type="file" accept="image/png" hidden />
  </div>
</template>

<style scoped>
.mf-root {
  min-height: 100vh;
  background: linear-gradient(160deg, #fde3ec 0%, #fef4f8 100%);
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
  padding: 24px;
  overflow: auto;
}
.mf-head { display:flex; align-items:center; gap:16px; margin-bottom: 14px; }
.mf-event-bar { display:flex; gap:12px; align-items:center; background:#fff; border:1px solid #f4b4cb; padding:10px 12px; border-radius:12px; margin-bottom:14px; }
.mf-event-info, .mf-event-create { display:flex; gap:8px; align-items:center; }
.mf-event-create { margin-left:auto; }
.mf-event-create input { flex:1; }
.mf-label { font-weight:700; color:#e14e7f; font-size:12px; }
.mf-back { padding: 10px 16px; border: 1px solid #f4b4cb; background:#fff; border-radius: 999px; color:#e14e7f; font-weight:700; cursor:pointer; }
.mf-head h1 { margin:0; font-size:24px; color:#e14e7f; font-weight:800; }
.mf-head p { margin:0; color:#a07a89; font-size:12px; }
.mf-lib { margin-left:auto; padding:10px 16px; border:none; background:#f2719b; color:#fff; border-radius: 999px; font-weight:700; cursor:pointer; }

.mf-card { background:#fff; border-radius: 18px; border:1px solid #f4b4cb; padding:18px; margin-bottom:18px; box-shadow: 0 4px 16px rgba(242,113,155,.12); }
.mf-card-title { font-weight:800; color:#e14e7f; margin-bottom:12px; }
.mf-upload { }
.mf-drop { width:100%; padding:36px 20px; background:#fff7fa; border:2px dashed #f4b4cb; border-radius:16px; color:#a07a89; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:8px; }
.mf-drop-icon { font-size:44px; }
.mf-drop small { color:#c4a3af; }
.mf-preview { display:flex; gap:20px; }
.mf-preview img { width:140px; border-radius:12px; border:1px solid #f4b4cb; }
.mf-preview-info { flex:1; display:flex; flex-direction:column; gap:10px; }
.mf-badge { align-self:flex-start; background:#f2719b; color:#fff; font-size:11px; padding:4px 10px; border-radius:999px; font-weight:700; }
.mf-input { padding:10px 12px; border:1px solid #f4b4cb; border-radius:10px; outline:none; font-family:inherit; }
.mf-row { display:flex; gap:10px; }
.mf-cancel { background:#eee; border:none; padding:10px 14px; border-radius:10px; cursor:pointer; }
.mf-upload-btn { flex:1; background:#f2719b; color:#fff; border:none; padding:12px; border-radius:10px; font-weight:800; cursor:pointer; }
.mf-upload-btn:disabled { opacity:.5; cursor:not-allowed; }
.mf-status { margin-top:10px; font-size:12px; color:#b45309; }
.mf-status.ok { color:#1a7f37; }
.mf-bulk { display:flex; gap:8px; margin-top:10px; }
.mf-bulk button { font-size:12px; padding:8px 12px; border:1px solid #eee; background:#fff; border-radius:8px; cursor:pointer; color:#888; }

.mf-list-head { font-weight:800; color:#e14e7f; margin:0 0 12px; }
.mf-empty { color:#c4a3af; padding:30px; text-align:center; background:#fff; border:1px dashed #f4b4cb; border-radius:16px; }
.mf-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:12px; }
.mf-tile { background:#fff; border:2px solid transparent; border-radius:14px; padding:10px; cursor:pointer; position:relative; transition:.15s; }
.mf-tile:hover { border-color:#f4b4cb; transform: translateY(-2px); }
.mf-tile.selected { border-color:#f2719b; box-shadow: 0 0 0 3px #f2719b44; }
.mf-tile img { width:100%; aspect-ratio: 1/3; object-fit:cover; border-radius:10px; }
.mf-badge-overlay { position:absolute; top:40px; right:14px; background:#3b82f6; color:#fff; font-size:10px; border-radius:999px; padding:2px 8px; font-weight:800; }
.mf-tile .mf-badge { position:absolute; top:14px; right:14px; background:#f2719b; color:#fff; font-size:11px; border-radius:999px; padding:2px 8px; font-weight:800; }
.mf-tile-name { margin-top:8px; font-size:12px; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mf-tile-foot { display:flex; justify-content:space-between; align-items:center; margin-top:6px; }
.mf-pill { font-size:10px; padding:2px 8px; border-radius:999px; background:#eee; color:#888; }
.mf-pill.on { background:#e6f5ea; color:#1a7f37; }
.mf-mini { font-size:11px; padding:4px 10px; border:1px solid #f4b4cb; border-radius:8px; background:#fff; color:#e14e7f; cursor:pointer; }
.mf-mini.danger { color:#ff4d6d; border-color:#ffccd5; }
.mf-editor { background:#fff; border:1px solid #f4b4cb; border-radius:16px; padding:16px; margin-top:16px; }
.mf-editor-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; color:#e14e7f; }
.mf-save { width:100%; padding:12px; margin-top:12px; background:#f2719b; color:#fff; border:none; border-radius:10px; font-weight:800; cursor:pointer; }
</style>
