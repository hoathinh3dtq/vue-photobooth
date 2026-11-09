<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSelectionStore } from '../stores/selection'
import { STORAGE_URL } from '../lib/api/client'
import { cacheFrameUrl } from '../lib/frameCache'

const router = useRouter()
const selectionStore = useSelectionStore()

interface Hole { x: number; y: number; w: number; h: number; orientation?: string }
interface FrameItem {
  id: number | string
  name: string
  image_path?: string
  url?: string
  holes_metadata?: { holes: Hole[]; fw: number; fh: number } | null
  category_id?: number | string | null
  is_active?: boolean | number | string
}

const frames = ref<FrameItem[]>([])
const categories = ref<{ id: number; name: string }[]>([])
const search = ref('')
const catFilter = ref<string>('all')
const loading = ref(true)
const selectedFrame = ref<FrameItem | null>(null)
const previewUrl = ref('')
const previewHoles = ref<Hole[]>([])
const previewMeta = ref<{ fw: number; fh: number }>({ fw: 1, fh: 1 })

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return frames.value.filter(f => {
    if (catFilter.value !== 'all') {
      const cf = catFilter.value
      if (cf === 'platform' && !f.url?.startsWith('data:')) {
        // platform frames are those with is_platform true; we approximate by absence of category_id match
        // for now keep all if filter is platform placeholder, handled via categories list
      }
      if (cf !== 'all' && String(f.category_id || '') !== cf) return false
    }
    if (q && !String(f.name || '').toLowerCase().includes(q)) return false
    return true
  })
})

async function load() {
  loading.value = true
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const eventId = localStorage.getItem('event_id')
    // frames of event (or all if no event) + platform frames
    const [a, b, cats] = await Promise.all([
      fetch(`${host}/api/frames/all${eventId ? `?event_id=${eventId}` : ''}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${host}/api/admin/platform/frame-library`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${host}/api/theme-types`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({ data: [] })),
    ])
    const userFrames: FrameItem[] = (a?.data || []).map((f: any) => ({
      id: f.id,
      name: f.name || 'Frame',
      image_path: f.image_path,
      holes_metadata: f.holes_metadata,
      category_id: f.category_id,
      is_active: f.is_active,
    }))
    const platformFrames: FrameItem[] = (b?.data || []).map((f: any) => ({
      id: `p-${f.id}`,
      name: f.name || 'Platform frame',
      url: f.url || f.image_path,
      holes_metadata: f.holes_metadata,
      category_id: f.category_id,
    }))
    // merge dedupe by name
    const merged = [...userFrames, ...platformFrames]
    frames.value = merged.filter((f, i, arr) => arr.findIndex(x => String(x.name) === String(f.name)) === i)
    // cache thumbnails for offline
    for (const f of frames.value) {
      const src = frameSrc(f)
      if (src) void cacheFrameUrl(src)
    }
    const catData = cats?.data || cats || []
    categories.value = Array.isArray(catData) ? catData.map((c: any) => ({ id: Number(c.id), name: c.type_name || c.name || String(c.id) })) : []
  } catch (e) {
    console.warn('[select-frame] load failed', e)
  } finally {
    loading.value = false
  }
}

function frameSrc(f: FrameItem): string {
  if (!f) return ''
  const raw = f.url || f.image_path || ''
  if (!raw) return ''
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw
  const host = import.meta.env.VITE_API_HOST || STORAGE_URL || 'http://127.0.0.1:8000'
  return `${String(host).replace(/\/$/, '')}/${raw.replace(/^\//, '')}`
}

function holesOf(f: FrameItem): Hole[] {
  const h = (f.holes_metadata as any)?.holes
  return Array.isArray(h) ? h : []
}

async function selectFrame(f: FrameItem) {
  selectedFrame.value = f
  const meta = f.holes_metadata as any || {}
  previewMeta.value = { fw: meta.fw || 1200, fh: meta.fh || 3600 }
  previewHoles.value = holesOf(f)
  previewUrl.value = frameSrc(f)
}

function closeModal() { selectedFrame.value = null }

async function confirmFrame() {
  const f = selectedFrame.value
  if (!f) return
  const holes = holesOf(f)
  const count = holes.length || 0
  const src = frameSrc(f)
  // lưu selected frame để Camera có thể vẽ khung preview (nếu cần)
  try {
    localStorage.setItem('frame_selected', JSON.stringify({
      id: f.id,
      name: f.name,
      url: src,
      holes,
      fw: previewMeta.value.fw,
      fh: previewMeta.value.fh,
    }))
  } catch {}
  selectionStore.selectedTheme = `frame-${f.id}`
  selectionStore.persistSelection()
  // Số ô = holes count (nếu có) để chụp đúng ô
  if (count > 0) {
    try {
      // lưu tạm cho CameraPage dùng
      localStorage.setItem('frame_hole_count', String(count))
    } catch {}
  }
  closeModal()
  router.push('/camera')
}

function goHome() { router.push('/home') }
function goSettings() { router.push('/settings') }

onMounted(() => { void load() })
</script>

<template>
  <div class="sf-page">
    <header class="sf-head">
      <div>
        <h1>SELECT FRAME</h1>
        <p>NHẤN VÀO FRAME BẤT KỲ ĐỂ VÀO CHỤP NGAY</p>
      </div>
      <div class="sf-head-right">
        <button class="sf-power" @click="goHome">⏻</button>
        <button class="sf-gear" @click="goSettings">⚙</button>
      </div>
    </header>
    <div class="sf-line"></div>
    <div class="sf-toolbar">
      <input v-model="search" placeholder="Tìm tên frame..." />
      <select v-model="catFilter">
        <option value="all">Tất cả danh mục</option>
        <option value="all">Tất cả danh mục</option>
        <option v-for="c in categories" :key="c.id" :value="String(c.id)">Danh mục: {{ c.name }}</option>
      </select>
    </div>

    <div v-if="loading" class="sf-loading">Đang tải frame…</div>

    <div class="sf-grid" v-else>
      <div v-for="f in filtered" :key="String(f.id)" class="sf-card" @click="selectFrame(f)">
        <div class="sf-thumb">
          <span class="sf-badge">{{ holesOf(f).length || '0' }}</span>
          <img v-if="frameSrc(f)" :src="frameSrc(f)" alt="" />
          <!-- dashed holes overlay (percent) -->
          <template v-if="f.holes_metadata">
            <div
              v-for="(h, i) in holesOf(f)"
              :key="i"
              class="sf-dash"
              :style="{
                left: (h.x / ((f.holes_metadata as any).fw || 1) * 100) + '%',
                top: (h.y / ((f.holes_metadata as any).fh || 1) * 100) + '%',
                width: (h.w / ((f.holes_metadata as any).fw || 1) * 100) + '%',
                height: (h.h / ((f.holes_metadata as any).fh || 1) * 100) + '%',
              }"
            ><span>{{ i + 1 }}</span></div>
          </template>
        </div>
        <div class="sf-name">{{ f.name }}</div>
      </div>
      <div v-if="filtered.length === 0" class="sf-empty">Chưa có frame nào.</div>
    </div>

    <!-- Modal confirm -->
    <div v-if="selectedFrame" class="sf-modal">
      <div class="sf-modal-card">
        <div class="sf-modal-head">
          <div>
            <h2>{{ selectedFrame.name?.toUpperCase() }}</h2>
            <p>{{ previewHoles.length }} Ô · {{ previewHoles.length }} LẦN CHỤP</p>
          </div>
          <button class="sf-close" @click="closeModal">✕</button>
        </div>
        <div class="sf-modal-body">
          <div class="sf-preview">
            <img v-if="previewUrl" :src="previewUrl" alt="" />
            <div
              v-for="(h, i) in previewHoles"
              :key="i"
              class="sf-dash-lg"
              :style="{
                left: (h.x / previewMeta.fw * 100) + '%',
                top: (h.y / previewMeta.fh * 100) + '%',
                width: (h.w / previewMeta.fw * 100) + '%',
                height: (h.h / previewMeta.fh * 100) + '%',
              }"
            ><span>{{ i + 1 }}</span></div>
          </div>
          <div class="sf-modal-actions">
            <button class="sf-btn-cancel" @click="closeModal">✕ HỦY</button>
            <button class="sf-btn-ok" @click="confirmFrame">XÁC NHẬN →</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sf-page { min-height:100vh; background:#fffafc; font-family:Segoe UI, sans-serif; padding:14px 22px; }
.sf-head { display:flex; justify-content:space-between; align-items:center; }
.sf-head h1 { margin:0; color:#ff4d6d; font-size:22px; letter-spacing:1px; }
.sf-head p { margin:2px 0 0; color:#ff8aa5; font-size:11px; letter-spacing:1px; text-transform:uppercase; }
.sf-head-right { display:flex; gap:8px; }
.sf-power { background:#ff3122; color:#fff; border:none; width:36px; height:36px; border-radius:8px; cursor:pointer; }
.sf-gear { width:36px; height:36px; border-radius:8px; border:1px solid #ddd; background:#fff; cursor:pointer; }
.sf-line { height:2px; background:#ffd6de; margin:12px -22px 14px; }
.sf-toolbar { display:flex; gap:12px; margin-bottom:18px; }
.sf-toolbar input { flex:1; padding:12px 16px; border:1px solid #e8d5da; border-radius:10px; font-size:14px; }
.sf-toolbar select { width:220px; padding:12px; border-radius:10px; border:1px solid #e8d5da; }
.sf-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:14px; }
.sf-card { cursor:pointer; }
.sf-thumb { position:relative; aspect-ratio: 2/5; border:1px solid #eee; border-radius:8px; overflow:hidden; background:#fff; }
.sf-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.sf-badge { position:absolute; top:6px; right:6px; background:#ff4d6d; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; z-index:2; }
.sf-dash { position:absolute; border:1px dashed rgba(255,60,106,0.7); background:rgba(255,235,240,0.35); display:grid; place-items:center; font-size:10px; color:#b00; pointer-events:none; }
.sf-dash span { background:rgba(255,255,255,0.9); padding:1px 5px; border-radius:999px; font-size:10px; }
.sf-name { text-align:center; font-size:11px; margin-top:6px; color:#555; }
.sf-empty, .sf-loading { text-align:center; color:#aaa; padding:40px; }
.sf-modal { position:fixed; inset:0; background:rgba(60,40,50,0.35); display:grid; place-items:center; z-index:50; padding:24px; }
.sf-modal-card { width:min(640px, 90vw); background:#fff; border:1px solid #ffd6de; border-radius:14px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.25); }
.sf-modal-head { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #ffe3ea; }
.sf-modal-head h2 { margin:0; font-size:18px; }
.sf-modal-head p { margin:2px 0 0; color:#ff4d6d; font-size:10px; letter-spacing:1px; }
.sf-close { border:1px solid #ddd; background:#fff; width:32px; height:32px; border-radius:8px; cursor:pointer; }
.sf-modal-body { display:grid; grid-template-columns: 1.2fr 1fr; gap:20px; padding:20px; background:#fbf7f8 repeating-linear-gradient(#f3e8ea 0 1px, transparent 1px 24px); }
.sf-preview { position:relative; margin:0 auto; max-height:70vh; aspect-ratio: 1/3; max-width:260px; width:100%; border:2px solid #ffd6de; border-radius:8px; overflow:hidden; background:#fff; }
.sf-preview img { width:100%; height:100%; object-fit:cover; display:block; }
.sf-dash-lg { position:absolute; border:2px dashed rgba(255,60,106,0.8); background:rgba(255,235,240,0.30); display:grid; place-items:center; font-size:12px; }
.sf-dash-lg span { background:#fff; padding:2px 8px; border-radius:999px; font-size:12px; border:1px solid #ddd; }
.sf-modal-actions { display:flex; flex-direction:column; gap:12px; justify-content:center; }
.sf-btn-cancel { padding:14px; border:1px solid #ddd; border-radius:10px; background:#fff; cursor:pointer; font-weight:700; }
.sf-btn-ok { padding:14px; border:none; border-radius:10px; background:#ff4d6d; color:#fff; cursor:pointer; font-weight:800; box-shadow:0 8px 20px rgba(255,77,109,0.35); }
</style>
