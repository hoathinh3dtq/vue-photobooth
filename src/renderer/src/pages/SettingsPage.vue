<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch, type FrameItem } from '../lib/api/frames'

const router = useRouter()

type TabId = 'general' | 'beauty' | 'filter' | 'frame' | 'ui' | 'hardware' | 'reprint' | 'event' | 'sync' | 'license' | 'update' | 'contact'

const activeTab = ref<TabId>('general')

// Printer (existing)
const printers = ref<string[]>([])
const detectedStrip = ref('')
const detectedFull = ref('')
const detectStatus = ref('')
const printerName = ref('')
const stripPrinter = ref('')
const fullPrinter = ref('')
const zoom = ref(0.98)
const offsetX = ref(0)
const offsetY = ref(0)
const paperLoaded = ref(400)
const paperRemaining = ref(400)
const warningThreshold = ref(50)
const allowCancelOnPreview = ref(true)
const autoPrintOnPreview = ref(false)
const printQr = ref(true)
const shopQr = ref('')
const status = ref('')
const loading = ref(false)

// General
const countdownSeconds = ref(10)
const enableDefaultBeep = ref(true)
const customCountdownMp3 = ref('')
const hideSettingsButton = ref(false)
const manualCapture = ref(false)
const autoFillAfterCapture = ref(false)
const allowRetake = ref(true)
const previewScale = ref(100)
const retakeBtnScale = ref(100)
const autoStartCountdown = ref(false)
const allowCancelOnPrint = ref(true)
const skipPrintConfirm = ref(false)
const autoSwitchToPrint = ref(false)
const language = ref<'vi' | 'en'>('vi')
const mode = ref<'photobooth' | 'selfbooth'>('photobooth')

// Beauty
const beautySkin = ref(false)
const beautyTone = ref(false)
const beautyBlush = ref(false)
const beautyLip = ref(false)

// Filter
const filters = ref<string[]>([])

// Camera
const cameraVendor = ref('canon')
const cameraId = ref('')
const mirror = ref(true)
const videoDevices = ref<any[]>([])
const selectedVideoSource = ref('')

// Sync
const cloudSync = ref(true)
const offlineFirst = ref(false)
const disablePaymentOffline = ref(false)
const queueStats = ref({ pending: 0, uploading: 0, failed: 0, done: 0 })

// License
const machineApiKey = ref('')

// Event
const events = ref<any[]>([])
const eventName = ref('')
const eventLoading = ref(false)
const activeEventId = ref('')
const activeEventName = ref('')
const eventStatus = ref('')
// Frame picker per event
const allFrames = ref<FrameItem[]>([])
const framesLoaded = ref(false)
const framePickerOpen = ref('')
const selectedFrameIds = ref<Record<string, number[]>>({})
const frameSaving = ref(false)
const frameStatus = ref('')
const frameUploading = ref(false)
const frameUploadStatus = ref('')

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'general', label: 'Chung & Trải nghiệm', icon: '☑' },
  { id: 'beauty', label: 'Làm đẹp AI', icon: '✨' },
  { id: 'filter', label: 'Quản lý Filter', icon: '◐' },
  { id: 'frame', label: 'Quản lý Frame & Layout', icon: '▣' },
  { id: 'ui', label: 'Giao diện ứng dụng', icon: '✎' },
  { id: 'hardware', label: 'Thiết bị Phần cứng', icon: '⚙' },
  { id: 'reprint', label: 'In lại ảnh', icon: '⎙' },
  { id: 'event', label: 'Sự kiện', icon: '🗓' },
  { id: 'sync', label: 'Hoạt động & Đồng bộ', icon: '☁' },
  { id: 'license', label: 'Kết nối & Bản quyền', icon: '🛡' },
  { id: 'update', label: 'Cập nhật', icon: '⬇' },
  { id: 'contact', label: 'Liên hệ', icon: '☎' },
]

const GROUPS = [
  { title: 'THIẾT LẬP PHIÊN CHỤP', items: ['general', 'beauty', 'filter'] as TabId[] },
  { title: 'NỘI DUNG & GIAO DIỆN', items: ['frame', 'ui'] as TabId[] },
  { title: 'THIẾT BỊ & SỰ KIỆN', items: ['hardware', 'reprint', 'event'] as TabId[] },
  { title: 'VẬN HÀNH & HỖ TRỢ', items: ['sync', 'license', 'update', 'contact'] as TabId[] },
]

const activeLabel = computed(() => TABS.find(t => t.id === activeTab.value)?.label || '')
const activeHint = computed(() => {
  const map: Record<TabId, string> = {
    general: 'Thiết lập luồng chụp, đếm ngược và trải nghiệm của khách.',
    beauty: 'Điều chỉnh hiệu ứng làm đẹp áp dụng sau khi chụp.',
    filter: 'Quản lý bộ lọc màu được cài trên máy này.',
    frame: 'Tạo layout và tải frame lên Web Panel.',
    ui: 'Màn hình chờ, logo và màu sắc trên Web Panel.',
    hardware: 'Kết nối máy ảnh, máy in và điều chỉnh liên quan đến in.',
    reprint: 'Chọn ảnh đã chụp để in lại một cách an toàn.',
    event: 'Tạo, chọn và theo dõi sự kiện đang diễn ra.',
    sync: 'Theo dõi đồng bộ, cache và dữ liệu được lưu trên máy.',
    license: 'Kiểm tra kết nối máy chủ và bản quyền sử dụng của máy.',
    update: 'Kiểm tra bản cập nhật.',
    contact: 'Xem thông tin hỗ trợ.',
  }
  return map[activeTab.value]
})

const deviceId = computed(() => {
  try {
    return (window as any).electronAPI?.deviceId || 'booth-local-001'
  } catch { return 'booth-local-001' }
})

const paperPercent = computed(() => {
  if (!paperLoaded.value) return 0
  return Math.round((paperRemaining.value / paperLoaded.value) * 100)
})

async function load() {
  loading.value = true
  try {
    const api = (window as any).electronAPI
    const s = await api?.settings?.get?.()
    if (s) {
      printerName.value = s.printerName || ''
      stripPrinter.value = s.stripPrinter || ''
      fullPrinter.value = s.fullPrinter || ''
      zoom.value = s.zoom ?? 0.98
      offsetX.value = s.offsetX ?? 0
      offsetY.value = s.offsetY ?? 0
      paperLoaded.value = s.paperLoaded ?? 400
      paperRemaining.value = s.paperRemaining ?? 400
      warningThreshold.value = s.warningThreshold ?? 50
      allowCancelOnPreview.value = s.allowCancelOnPreview ?? true
      autoPrintOnPreview.value = s.autoPrintOnPreview ?? false
      printQr.value = s.printQr ?? true
      shopQr.value = s.shopQr || ''
      countdownSeconds.value = s.countdownSeconds ?? 10
      enableDefaultBeep.value = s.enableDefaultBeep ?? true
      customCountdownMp3.value = s.customCountdownMp3 || ''
      hideSettingsButton.value = s.hideSettingsButton ?? false
      manualCapture.value = s.manualCapture ?? false
      autoFillAfterCapture.value = s.autoFillAfterCapture ?? false
      allowRetake.value = s.allowRetake ?? true
      previewScale.value = s.previewScale ?? 100
      retakeBtnScale.value = s.retakeBtnScale ?? 100
      autoStartCountdown.value = s.autoStartCountdown ?? false
      allowCancelOnPrint.value = s.allowCancelOnPrint ?? true
      skipPrintConfirm.value = s.skipPrintConfirm ?? false
      autoSwitchToPrint.value = s.autoSwitchToPrint ?? false
      language.value = s.language || 'vi'
      mode.value = s.mode || 'photobooth'
      beautySkin.value = s.beautySkin ?? false
      beautyTone.value = s.beautyTone ?? false
      beautyBlush.value = s.beautyBlush ?? false
      beautyLip.value = s.beautyLip ?? false
      filters.value = s.filters || []
      cameraVendor.value = s.cameraVendor || 'canon'
      cameraId.value = s.cameraId || ''
      mirror.value = s.mirror ?? true
      cloudSync.value = s.cloudSync ?? true
      offlineFirst.value = s.offlineFirst ?? false
      disablePaymentOffline.value = s.disablePaymentOffline ?? false
      machineApiKey.value = s.machineApiKey || ''
      activeEventId.value = s.activeEventId || localStorage.getItem('event_id') || ''
      activeEventName.value = s.activeEventName || ''
    }
    const res = await api?.printer?.list?.()
    if (res?.ok) printers.value = res.printers || []
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      videoDevices.value = devices.filter(d => d.kind === 'videoinput')
    } catch { /* ignore */ }
    await loadEvents()
    await loadAllFrames()
  } catch (e) {
    status.value = 'Lỗi tải settings: ' + String(e)
  } finally {
    loading.value = false
  }
}

async function save() {
  try {
    const api = (window as any).electronAPI
    await api?.settings?.save?.({
      printerName: printerName.value,
      stripPrinter: stripPrinter.value,
      fullPrinter: fullPrinter.value,
      zoom: zoom.value,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
      paperLoaded: paperLoaded.value,
      paperRemaining: paperRemaining.value,
      warningThreshold: warningThreshold.value,
      allowCancelOnPreview: allowCancelOnPreview.value,
      autoPrintOnPreview: autoPrintOnPreview.value,
      printQr: printQr.value,
      shopQr: shopQr.value,
      countdownSeconds: countdownSeconds.value,
      enableDefaultBeep: enableDefaultBeep.value,
      customCountdownMp3: customCountdownMp3.value,
      hideSettingsButton: hideSettingsButton.value,
      manualCapture: manualCapture.value,
      autoFillAfterCapture: autoFillAfterCapture.value,
      allowRetake: allowRetake.value,
      previewScale: previewScale.value,
      retakeBtnScale: retakeBtnScale.value,
      autoStartCountdown: autoStartCountdown.value,
      allowCancelOnPrint: allowCancelOnPrint.value,
      skipPrintConfirm: skipPrintConfirm.value,
      autoSwitchToPrint: autoSwitchToPrint.value,
      language: language.value,
      mode: mode.value,
      beautySkin: beautySkin.value,
      beautyTone: beautyTone.value,
      beautyBlush: beautyBlush.value,
      beautyLip: beautyLip.value,
      filters: filters.value,
      cameraVendor: cameraVendor.value,
      cameraId: cameraId.value,
      mirror: mirror.value,
      cloudSync: cloudSync.value,
      offlineFirst: offlineFirst.value,
      disablePaymentOffline: disablePaymentOffline.value,
      machineApiKey: machineApiKey.value,
      activeEventId: activeEventId.value,
      activeEventName: activeEventName.value,
    })
    status.value = 'Đã lưu cài đặt.'
    // sync active event to localStorage
    if (activeEventId.value) {
      localStorage.setItem('event_id', activeEventId.value)
      localStorage.setItem('booth_type', 'event')
    }
  } catch (e) {
    status.value = 'Lỗi lưu: ' + String(e)
  }
}

async function loadEvents() {
  eventLoading.value = true
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const res = await fetch(`${host}/api/events`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const json = await res.json()
    events.value = json?.events || json?.data || []
    if (activeEventId.value) {
      const cur = events.value.find((e: any) => String(e.id) === String(activeEventId.value))
      if (cur) activeEventName.value = cur.name
    }
  } catch { /* ignore */ }
  finally { eventLoading.value = false }
}

async function loadAllFrames() {
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const res = await fetch(`${host}/api/frames/all?scope=all`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const json = await res.json()
    allFrames.value = json?.data || []
    framesLoaded.value = true
  } catch { /* ignore */ }
}

function frameImgUrl(f: FrameItem): string {
  const host = String(import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000').replace(/\/$/, '')
  const raw = String((f as any).image_path || '')
  if (!raw) return ''
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw
  return `${host}/${raw.replace(/^\//, '')}`
}

function pickerIds(ev: any): number[] {
  const key = String(ev.id)
  return selectedFrameIds.value[key] || (ev.frame_ids || []).map((n: any) => Number(n))
}

function frameChecked(ev: any, frameId: number): boolean {
  return pickerIds(ev).includes(Number(frameId))
}

async function toggleFramePicker(ev: any) {
  const key = String(ev.id)
  if (framePickerOpen.value === key) {
    framePickerOpen.value = ''
    return
  }
  if (!framesLoaded.value) await loadAllFrames()
  if (!selectedFrameIds.value[key]) {
    selectedFrameIds.value = { ...selectedFrameIds.value, [key]: (ev.frame_ids || []).map((n: any) => Number(n)) }
  }
  framePickerOpen.value = key
  frameStatus.value = ''
}

function toggleFrameForEvent(ev: any, frameId: number) {
  const key = String(ev.id)
  const cur = [...pickerIds(ev)]
  const idx = cur.indexOf(Number(frameId))
  if (idx >= 0) cur.splice(idx, 1)
  else cur.push(Number(frameId))
  selectedFrameIds.value = { ...selectedFrameIds.value, [key]: cur }
}

function triggerLocalFramePick(ev: any) {
  const el = document.getElementById('frame-file-input-' + ev.id) as HTMLInputElement | null
  el?.click()
}

async function onLocalFrameFiles(ev: any, e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  frameUploading.value = true
  frameUploadStatus.value = ''
  let done = 0
  const newIds: number[] = []
  for (const file of files) {
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('name', file.name.replace(/\.[^.]+$/, ''))
      fd.append('frame', 'vertical')
      fd.append('event_id', String(ev.id))
      const res = await apiFetch('/api/frames/upload', { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error((j && j.message) || 'HTTP ' + res.status)
      if (j?.data?.id != null) newIds.push(Number(j.data.id))
      done++
    } catch (err) {
      console.error('frame upload failed', err)
    }
  }
  const key = String(ev.id)
  const cur = [...pickerIds(ev)]
  for (const id of newIds) {
    if (!cur.includes(id)) cur.push(id)
  }
  selectedFrameIds.value = { ...selectedFrameIds.value, [key]: cur }
  await loadAllFrames()
  await loadEvents()
  frameUploadStatus.value = done
    ? `Đã thêm ${done} frame từ máy vào sự kiện "${ev.name}".`
    : 'Lỗi tải frame từ máy.'
  frameUploading.value = false
  input.value = ''
}

async function saveFramesForEvent(ev: any) {
  const key = String(ev.id)
  const ids = selectedFrameIds.value[key] || (ev.frame_ids || []).map((n: any) => Number(n))
  frameSaving.value = true
  frameStatus.value = ''
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const res = await fetch(`${host}/api/events/${ev.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ frame_ids: ids }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    frameStatus.value = `Đã lưu ${ids.length} frame cho sự kiện "${ev.name}".`
    await loadEvents()
  } catch (e) {
    frameStatus.value = 'Lỗi lưu frames: ' + String(e)
  } finally {
    frameSaving.value = false
  }
}

async function createEvent() {
  const name = eventName.value.trim()
  if (!name) { eventStatus.value = 'Nhập tên sự kiện trước.'; return }
  eventLoading.value = true
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    const res = await fetch(`${host}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, status: 1 }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((json as any)?.message || 'Tạo sự kiện thất bại')
    const ev = (json as any)?.data || json
    await loadEvents()
    if (ev?.id) {
      activeEventId.value = String(ev.id)
      activeEventName.value = ev.name || name
      eventStatus.value = 'Đã tạo sự kiện.'
    }
    eventName.value = ''
    await save()
  } catch (e) {
    eventStatus.value = 'Lỗi: ' + String(e)
  } finally { eventLoading.value = false }
}

function activateEvent(ev: any) {
  activeEventId.value = String(ev.id)
  activeEventName.value = ev.name
  eventStatus.value = `Sự kiện đang hoạt động: ${ev.name}`
  // Sync to localStorage for Camera/Files
  localStorage.setItem('event_id', String(ev.id))
  localStorage.setItem('booth_type', 'event')
}

async function openEventFolder() {
  if (!activeEventId.value) { eventStatus.value = 'Chưa chọn sự kiện nào.'; return }
  try {
    const eId = activeEventId.value
    const api = (window as any).electronAPI
    if (api?.events?.openFolder) {
      await api.events.openFolder(eId)
      eventStatus.value = 'Đã mở thư mục ảnh sự kiện.'
      return
    }
    if (api?.openEventFolder) {
      await api.openEventFolder(eId)
      eventStatus.value = 'Đã mở thư mục ảnh sự kiện.'
      return
    }
    eventStatus.value = 'Thư mục ảnh sự kiện sẽ được mở sau (desktop build).'
  } catch { eventStatus.value = 'Không thể mở thư mục ảnh.' }
}

function openFolderFor(ev: any) {
  activeEventId.value = String(ev.id)
  activeEventName.value = ev.name
  openEventFolder()
}

function addFrameForEvent(ev: any) {
  activeEventId.value = String(ev.id)
  activeEventName.value = ev.name
  localStorage.setItem('event_id', String(ev.id))
  localStorage.setItem('booth_type', 'event')
  router.push('/my-frames')
}

function goAddFrameForEvent() {
  if (!activeEventId.value) { eventStatus.value = 'Chưa chọn sự kiện nào.'; return }
  router.push('/my-frames')
}

async function stopActiveEvent() {
  if (!activeEventId.value) return
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    await fetch(`${host}/api/events/${activeEventId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 0 }),
    })
    activeEventId.value = ''
    activeEventName.value = ''
    localStorage.removeItem('event_id')
    eventStatus.value = 'Sự kiện đã dừng.'
    await loadEvents()
  } catch { eventStatus.value = 'Không thể dừng sự kiện.' }
}

async function deleteEvent(ev: any) {
  if (!confirm(`Xóa sự kiện "${ev.name}"?`)) return
  try {
    const token = localStorage.getItem('auth_token') || ''
    const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
    await fetch(`${host}/api/events/${ev.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (String(activeEventId.value) === String(ev.id)) {
      activeEventId.value = ''
      activeEventName.value = ''
      localStorage.removeItem('event_id')
    }
    await loadEvents()
  } catch { /* ignore */ }
}

function onShopQrFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => { shopQr.value = String(reader.result || '') }
  reader.readAsDataURL(f)
}
function clearShopQr() { shopQr.value = '' }

function onCountdownMp3(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  if (f.size > 10 * 1024 * 1024) { status.value = 'MP3 tối đa 10MB.'; return }
  const reader = new FileReader()
  reader.onload = () => { customCountdownMp3.value = String(reader.result || '') }
  reader.readAsDataURL(f)
}

function triggerCube() { (document.querySelector('#cubeInput') as HTMLInputElement)?.click() }

function onCubeFile(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  files.forEach(f => {
    if (!filters.value.includes(f.name)) filters.value.push(f.name)
  })
}
function removeFilter(name: string) { filters.value = filters.value.filter(f => f !== name) }

async function openPrefs() {
  try {
    await (window as any).electronAPI?.printer?.openPreferences?.(stripPrinter.value || fullPrinter.value || printerName.value)
  } catch (e) { status.value = 'Lỗi mở preferences: ' + String(e) }
}

const detectStatusText = () => {
  const s = (detectedStrip.value || 'strip chưa nhận diện')
  const f = (detectedFull.value || 'full chưa nhận diện')
  detectStatus.value = `Strip → ${s} · Full → ${f}`
}

function analyzeScore(p: { nameLower: string; driverLower: string; supports2x6: boolean; supports4x6: boolean }) {
  const n = p.nameLower, d = p.driverLower
  let strip = 0, full = 0
  // Strip (2x6) signals
  if (p.supports2x6) strip += 100
  if (n.includes('2x6') || d.includes('2x6')) strip += 80
  if (n.includes('strip') || d.includes('strip')) strip += 70
  if (/ds-rx1|ds-rx1hs|ds-rx1h|ds-dl|rx-dl|dl-1/.test(d)) strip += 60
  if (n.endsWith('(2x6)') || n.includes('ds-rx1')) strip += 50
  if (n.includes('card') || n.includes('rimage')) strip -= 50
  // Full (4x6) signals
  if (p.supports4x6) full += 90
  if (n.includes('4x6') || d.includes('4x6')) full += 80
  if (n.includes('cp1500') || n.includes('cp1300') || n.includes('cp1200') || n.includes('cp10') || d.includes('cp1500')) full += 30
  if (/ds-rx\d|ds-gu|ds-40|cp\d|cp-10|cp-1500/.test(d)) full += 20
  if (full > strip && d.includes('rx1')) full += 10
  return { strip, full }
}

async function runAnalyze() {
  const api = (window as any).electronAPI
  let result
  try {
    result = await api?.printer?.analyze?.()
  } catch (e) {
    detectStatus.value = 'Lỗi phân tích máy in: ' + String(e)
    return null
  }
  if (!result?.ok) { detectStatus.value = 'Không liệt kê được máy in.'; return null }
  const rows: Array<{ name: string; driver: string; port: string; status: string; supports2x6: boolean; supports4x6: boolean; nameLower: string; driverLower: string }> = result.printers || []
  return rows
}

async function detectPrinter(kind: 'strip' | 'full') {
  const rows = await runAnalyze()
  if (!rows) return
  const scored = rows.map(r => ({ ...r, ...analyzeScore(r) }))
  const used = new Set<string>()
  if (kind === 'strip') {
    if (fullPrinter.value) used.add(fullPrinter.value)
    const best = scored.filter(s => !used.has(s.name)).sort((a, b) => b.strip - a.strip)[0]
    if (best && best.strip > 0) { stripPrinter.value = best.name; detectedStrip.value = best.name } else { detectedStrip.value = 'Không nhận diện được 2×6' }
  } else {
    if (stripPrinter.value) used.add(stripPrinter.value)
    const best = scored.filter(s => !used.has(s.name)).sort((a, b) => b.full - a.full)[0]
    if (best && best.full > 0) { fullPrinter.value = best.name; detectedFull.value = best.name } else { detectedFull.value = 'Không nhận diện được 4×6' }
  }
  detectStatusText()
}

async function autoDetectPrinters() {
  const rows = await runAnalyze()
  if (!rows) return
  const scored = rows.map(r => ({ ...r, ...analyzeScore(r) }))
  // strip: highest strip score
  const byStrip = [...scored].sort((a, b) => b.strip - a.strip)
  const byFull = [...scored].sort((a, b) => b.full - a.full)
  if (byStrip[0] && byStrip[0].strip > 0) {
    stripPrinter.value = byStrip[0].name; detectedStrip.value = byStrip[0].name
  }
  // full: highest full score excluding the strip assignment (if two candidates and a 4x6-only exists, prefer it)
  const remaining = byFull.filter(p => p.name !== stripPrinter.value || scored.filter(s => s.name === stripPrinter.value && s.full > 0).length > 1)
  // if the strip-candidate also has strong full, assign it to both only if no other meaningful full
  if (remaining[0] && remaining[0].full > 0) {
    fullPrinter.value = remaining[0].name; detectedFull.value = remaining[0].name
  }
  detectStatusText()
}

function goHome() { router.push('/home') }
function refreshApp() { window.location.reload() }

function themesCount(): number { return 0 }

onMounted(() => { void load() })
</script>

<template>
  <div class="ds-root">
    <!-- Sidebar -->
    <aside class="ds-sidebar">
      <div class="ds-brand">
        <div class="ds-logo">📸</div>
        <div>
          <div class="ds-brand-name">HiHiBooth</div>
          <div class="ds-brand-sub">CÀI ĐẶT DESKTOP</div>
        </div>
      </div>

      <button class="ds-back" @click="goHome">← Quay lại</button>

      <div class="ds-top-actions">
        <button class="ds-refresh" @click="refreshApp">↻ Làm Mới APP</button>
        <button class="ds-power" @click="goHome" title="Trang chủ">⏻</button>
      </div>

      <template v-for="g in GROUPS" :key="g.title">
        <div class="ds-group-title">{{ g.title }}</div>
        <button
          v-for="id in g.items"
          :key="id"
          class="ds-nav"
          :class="{ active: activeTab === id }"
          @click="activeTab = id"
        >
          <span>{{ TABS.find(t => t.id === id)?.icon }}</span> {{ TABS.find(t => t.id === id)?.label }}
        </button>
      </template>

      <div class="ds-sidebar-foot">
        <div class="row"><span>Phiên bản</span><strong>v12.0.8</strong></div>
        <div class="row"><span>Device ID</span><strong>{{ deviceId.slice(0, 12) }}…</strong></div>
      </div>
    </aside>

    <!-- Main -->
    <main class="ds-main">
      <header class="ds-topbar">
        <div class="ds-top-left">
          <button class="ds-burger">☰</button>
          <div>
            <h1>{{ activeLabel }}</h1>
            <p>{{ activeHint }}</p>
          </div>
        </div>
        <div class="ds-top-right">
          <span class="ds-chip">📷 Canon EOS</span>
          <span class="ds-chip green">{{ paperRemaining }} tờ</span>
          <span class="ds-chip">☁ Sync OK</span>
          <button class="ds-chip dark" @click="goHome">⎋ Quay lại</button>
        </div>
      </header>

      <nav class="ds-tabs">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="ds-tab"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >{{ t.icon }} {{ t.label }}</button>
      </nav>

      <section class="ds-content">
        <!-- Chung & Trải nghiệm -->
        <div v-if="activeTab === 'general'">
          <div class="ds-card">
            <div class="ds-card-head"><div>⏱ <strong>Âm thanh đếm ngược</strong><small>Áp dụng cho mọi lượt chụp của máy này.</small></div></div>
            <div class="ds-body">
              <label class="ds-label">THỜI GIAN ĐẾM NGƯỢC (GIÂY)</label>
              <p class="ds-hint">Dùng một thời gian cho mọi lượt chụp. Mặc định 10 giây.</p>
              <div class="ds-row">
                <button @click="countdownSeconds = Math.max(3, countdownSeconds - 1)">−</button>
                <input type="number" v-model.number="countdownSeconds" style="width:80px; text-align:center;" />
                <button @click="countdownSeconds = countdownSeconds + 1">+</button>
                <span>giây</span>
                <span style="margin-left:auto; font-size:12px; color:#999;">MỐC NHANH:</span>
                <button v-for="v in [5,8,10,15]" :key="v" class="ds-pill" :class="{ on: countdownSeconds === v }" @click="countdownSeconds = v">{{ v }}s</button>
              </div>
              <label class="ds-toggle"><input type="checkbox" v-model="enableDefaultBeep" /><span></span><div><strong>Bật tiếng tít tít mặc định</strong><small>Dùng tiếng tít khi chưa có MP3.</small></div></label>
              <div class="ds-divider"></div>
              <label class="ds-label">MP3 ĐẾM NGƯỢC TÙY CHỈNH <span style="float:right; font-weight:400;">Tối đa 10 MB (.mp3)</span></label>
              <div class="ds-upload">
                <p>Chưa có MP3 tùy chỉnh. Ứng dụng sẽ phát tiếng bíp mặc định.</p>
                <label class="ds-btn-pink">⬆ Thêm MP3 <input type="file" accept="audio/mpeg" hidden @change="onCountdownMp3" /></label>
                <p v-if="customCountdownMp3" class="ds-hint">Đã có MP3 tùy chỉnh.</p>
              </div>
            </div>
          </div>

          <div class="ds-card">
            <div class="ds-card-head"><div>⚙ <strong>Hành vi chụp</strong><small>Chọn cách app chụp và xử lý ảnh.</small></div></div>
            <div class="ds-body">
              <label class="ds-toggle"><input type="checkbox" v-model="hideSettingsButton" /><span></span><div><strong>Bảo vệ nút góc (Ẩn mở)</strong><small>Làm mờ nút Cài đặt và Tắt app ở trang chủ.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="manualCapture" /><span></span><div><strong>Chế độ bấm để chụp (không đếm ngược)</strong><small>Khách tự nhấn nút chụp.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="autoFillAfterCapture" /><span></span><div><strong>Tự động chèn ảnh vào ô sau khi chụp</strong><small>Điền ảnh vào khung theo thứ tự.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="allowRetake" /><span></span><div><strong>Cho phép khách chụp lại</strong><small>Cho khách chụp lại ảnh vừa chụp.</small></div></label>

              <label class="ds-label" style="margin-top:12px;">Kích thước ô ảnh xem trước</label>
              <div class="ds-row"><input type="range" min="50" max="150" v-model.number="previewScale" style="flex:1;" /><strong>{{ previewScale }}%</strong></div>
              <label class="ds-label">Kích thước nút X chụp lại</label>
              <div class="ds-row"><input type="range" min="50" max="150" v-model.number="retakeBtnScale" style="flex:1;" /><strong>{{ retakeBtnScale }}%</strong></div>

              <label class="ds-toggle"><input type="checkbox" v-model="autoStartCountdown" /><span></span><div><strong>Tự bắt đầu chụp</strong><small>Tự kích hoạt sau thời gian chờ.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="allowCancelOnPrint" /><span></span><div><strong>Cho phép hủy phiên trên màn hình in</strong><small>Khách có thể hủy phiên chụp.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="skipPrintConfirm" /><span></span><div><strong>Bỏ qua thao tác ấn in ảnh trang cuối</strong><small>Tự in khi ảnh đã chọn.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="autoSwitchToPrint" /><span></span><div><strong>Tự động chuyển sang màn in</strong><small>Áp dụng ở màn hoàn thiện ảnh.</small></div></label>

              <div class="ds-divider"></div>
              <label class="ds-label">Cấu hình số ảnh chụp theo số ô</label>
              <p class="ds-hint">Mặc định: Chụp đúng số ô của khung (VD: Frame 4 ô thì chụp 4 ảnh).</p>

              <label class="ds-label">Ngôn ngữ / Language</label>
              <div class="ds-row">
                <button class="ds-lang" :class="{ on: language === 'vi' }" @click="language = 'vi'"><strong>VN</strong> Tiếng Việt</button>
                <button class="ds-lang" :class="{ on: language === 'en' }" @click="language = 'en'"><strong>GB</strong> English</button>
              </div>

              <label class="ds-label">Cấu hình kỹ thuật: Mô hình chụp</label>
              <div class="ds-row">
                <button class="ds-mode" :class="{ on: mode === 'photobooth' }" @click="mode = 'photobooth'">📷 Photobooth — Khách chọn layout, chụp theo ô, chọn filter/frame.</button>
                <button class="ds-mode" :class="{ on: mode === 'selfbooth' }" @click="mode = 'selfbooth'">⊘ Selfbooth — Phiên chụp tự do.</button>
              </div>
              <p class="ds-hint">Máy đang chạy Photobooth.</p>
            </div>
          </div>
        </div>

        <!-- Làm đẹp AI -->
        <div v-if="activeTab === 'beauty'">
          <div class="ds-note">✨ Hiệu ứng làm đẹp được dùng khi chụp bằng Photobooth.</div>
          <div class="ds-card">
            <div class="ds-body grid2">
              <label class="ds-toggle"><input type="checkbox" v-model="beautySkin" /><span></span><div><strong>Bật làm mịn da (AI Skin Smoothing)</strong></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="beautyTone" /><span></span><div><strong>Bật làm sáng da (AI Tone-up)</strong></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="beautyBlush" /><span></span><div><strong>Bật má hồng</strong></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="beautyLip" /><span></span><div><strong>Bật son môi</strong></div></label>
            </div>
          </div>
        </div>

        <!-- Filter -->
        <div v-if="activeTab === 'filter'">
          <div class="ds-card">
            <div class="ds-card-head"><div>🎨 <strong>Quản lý Filter (Nâng cao)</strong><small>Thêm filter màu .cube cho ảnh.</small></div><button class="ds-btn-pink" @click="triggerCube">+ Thêm file .cube</button></div>
            <div class="ds-body">
              <div class="ds-info">File .cube là gì? File .cube (3D LUT) chứa thông số thay đổi màu sắc chuyên nghiệp.</div>
              <input id="cubeInput" type="file" accept=".cube" multiple hidden @change="onCubeFile" />
              <div class="ds-upload" @click="triggerCube">⬆ Bấm để tải ảnh thử màu</div>
              <div>
                <label class="ds-label">DANH SÁCH FILTER ĐÃ CÀI</label>
                <div v-if="filters.length === 0" class="ds-empty">Chưa có filter nào.</div>
                <div v-else class="ds-row"><span v-for="f in filters" :key="f" class="ds-pill">{{ f }} <button @click="removeFilter(f)">×</button></span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Frame & Layout -->
        <div v-if="activeTab === 'frame'">
          <div class="ds-card">
            <div class="ds-card-head"><div>▣ <strong>Quản lý Frame &amp; Layout</strong><small>Tạo layout và tải frame lên Web Panel.</small></div></div>
            <div class="ds-body">
              <div class="ds-info">Thực hiện trên Web Panel — mở Web Panel và đăng nhập tài khoản quản trị để tải frame.</div>
              <div class="ds-row">
                <button class="ds-btn-pink" @click="router.push('/my-frames')">Mở Frame của tôi</button>
                <button class="ds-btn-gray" @click="router.push('/frame-library')">Kho frame dùng chung</button>
              </div>
              <p class="ds-hint">panel.local:8000 (admin)</p>
            </div>
          </div>
        </div>

        <!-- Giao diện -->
        <div v-if="activeTab === 'ui'">
          <div class="ds-card">
            <div class="ds-body">
              <p class="ds-hint">Thay đổi giao diện trên Web Panel: Cài đặt → Giao Diện &amp; Thương Hiệu.</p>
              <button class="ds-btn-pink" @click="router.push('/my-frames')">Mở Web Panel để đổi giao diện</button>
            </div>
          </div>
        </div>

        <!-- Thiết bị Phần cứng -->
        <div v-if="activeTab === 'hardware'">
          <div class="ds-card">
            <div class="ds-card-head"><div>📷 <strong>Cấu hình Máy ảnh</strong><small>Hỗ trợ Canon, Fujifilm và Webcam/Capture Card.</small></div><button class="ds-btn-gray" @click="load">↻ Tải lại</button></div>
            <div class="ds-body">
              <label class="ds-label">HÃNG CAMERA</label>
              <div class="ds-row">
                <button class="ds-vendor" :class="{ on: cameraVendor === 'canon' }" @click="cameraVendor = 'canon'">📷 Canon EOS</button>
                <button class="ds-vendor" :class="{ on: cameraVendor === 'fujifilm' }" @click="cameraVendor = 'fujifilm'">🎬 Fujifilm</button>
                <button class="ds-vendor" :class="{ on: cameraVendor === 'sony' }" @click="cameraVendor = 'sony'">📸 Sony Alpha</button>
                <button class="ds-vendor" :class="{ on: cameraVendor === 'webcam' }" @click="cameraVendor = 'webcam'">🎥 Webcam / Card</button>
              </div>
              <label class="ds-label">CAMERA ƯU TIÊN</label>
              <select v-model="selectedVideoSource" style="width:100%;">
                <option value="">Tự động nhận diện</option>
                <option v-for="d in videoDevices" :key="d.deviceId" :value="d.deviceId">{{ d.label || d.deviceId }}</option>
              </select>
              <div class="ds-info-warn">Canon: Nên để Tự động nhận diện nếu chỉ có một máy.</div>
              <label class="ds-toggle"><input type="checkbox" v-model="mirror" /><span></span><div><strong>Lật ảnh (Mirror)</strong><small>Lật màn hình xem trước như camera selfie.</small></div></label>
            </div>
          </div>

          <div class="ds-card">
            <div class="ds-card-head"><div>🖨 <strong>Máy in</strong><small>Chọn máy in và chỉnh thông số in.</small></div><button class="ds-btn-gray" @click="load">↻ Tải lại</button></div>
            <div class="ds-body">
              <div class="ds-row">
                <div style="flex:1;"><label class="ds-label">MÁY IN STRIP (2x6)</label><select v-model="stripPrinter" style="width:100%;"><option value="">-- chọn máy in --</option><option v-for="p in printers" :key="'s'+p" :value="p">{{ p }}</option></select><button class="ds-btn-gray" style="margin-top:6px;" @click="detectPrinter('strip')">Tự nhận diện</button><small class="ds-hint" v-if="detectedStrip">→ {{ detectedStrip }}</small></div>
                <div style="flex:1;"><label class="ds-label">MÁY IN FULL (4x6)</label><select v-model="fullPrinter" style="width:100%;"><option value="">-- chọn máy in --</option><option v-for="p in printers" :key="'f'+p" :value="p">{{ p }}</option></select><button class="ds-btn-gray" style="margin-top:6px;" @click="detectPrinter('full')">Tự nhận diện</button><small class="ds-hint" v-if="detectedFull">→ {{ detectedFull }}</small></div>
              </div>
              <div class="ds-row" style="margin-top:8px;"><button class="ds-btn-pink" @click="autoDetectPrinters">🪄 Tự nhận diện cả hai máy in</button> <button class="ds-btn-gray" @click="openPrefs">Mở tùy chọn máy in</button></div>
              <p v-if="detectStatus" class="ds-hint">{{ detectStatus }}</p>

              <label class="ds-label">CĂN CHỈNH LỀ &amp; HƯỚNG IN</label>
              <div class="ds-row">
                <span>HƯỚNG GIẤY</span><span>LỆCH X</span><span>LỆCH Y</span>
              </div>
              <div class="ds-row">
                <span style="flex:1;">Ngang (Ngang)</span>
                <input type="number" v-model.number="offsetX" style="width:90px;" />
                <input type="number" v-model.number="offsetY" style="width:90px;" />
              </div>
              <label class="ds-label">CĂN CHỈNH ZOOM</label>
              <div class="ds-row"><input type="number" step="0.01" v-model.number="zoom" style="width:120px;" /><button class="ds-btn-gray" @click="zoom = 1">Đặt lại 1.0</button></div>

              <div class="ds-divider"></div>
              <label class="ds-label">Bộ đếm giấy</label>
              <div class="ds-paper-bar"><div :style="{ width: paperPercent + '%' }"></div></div>
              <div class="ds-row"><button class="ds-btn-gray" @click="paperLoaded = 400; paperRemaining = 400;">+ Nạp 400 tờ</button><button class="ds-btn-gray" @click="paperLoaded = 700; paperRemaining = 700;">+ Nạp 700 tờ</button></div>
              <div class="ds-row">
                <div><label class="ds-label">ĐÃ NẠP</label><input type="number" v-model.number="paperLoaded" style="width:90px;" /></div>
                <div><label class="ds-label">CÒN LẠI</label><input type="number" v-model.number="paperRemaining" style="width:90px;" /></div>
                <div><label class="ds-label">NGƯỠNG CẢNH BÁO</label><input type="number" v-model.number="warningThreshold" style="width:90px;" /></div>
              </div>

              <div class="ds-divider"></div>
              <label class="ds-toggle"><input type="checkbox" v-model="allowCancelOnPreview" /><span></span><div><strong>Cho phép hủy ở preview in</strong></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="autoPrintOnPreview" /><span></span><div><strong>Tự động in khi preview render xong</strong></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="printQr" /><span></span><div><strong>In kèm mã QR (event mode tự tắt)</strong></div></label>

              <label class="ds-label">QR của quán (Zalo)</label>
              <input type="file" accept="image/*" @change="onShopQrFile" />
              <button class="ds-btn-gray" @click="clearShopQr">Xóa</button>
              <img v-if="shopQr" :src="shopQr" style="max-width:120px; display:block; margin-top:8px; border:1px solid #ccc;" />
            </div>
          </div>
        </div>

        <!-- In lại ảnh -->
        <div v-if="activeTab === 'reprint'">
          <div class="ds-card">
            <div class="ds-card-head"><div>⎙ <strong>In lại ảnh</strong><small>Chọn ảnh đã chụp để in lại bản mới cho khách.</small></div></div>
            <div class="ds-body">
              <div class="ds-empty">Không có ảnh print_ready nào.</div>
            </div>
          </div>
        </div>

        <!-- Sự kiện -->
        <div v-if="activeTab === 'event'">
          <div class="ds-card">
            <div class="ds-card-head"><div>🗓 <strong>TRẠNG THÁI SỰ KIỆN</strong><small>{{ activeEventId ? 'Sự kiện đang hoạt động: ' + activeEventName : 'Chưa chọn sự kiện nào (Ảnh đang lưu bình thường)' }}</small></div><div class="ds-row"><button class="ds-btn-gray" @click="openEventFolder">📁 Mở thư mục ảnh</button><button class="ds-btn-pink" @click="goAddFrameForEvent">+ Thêm frame cho sự kiện này</button><button v-if="activeEventId" class="ds-btn-pink" style="background:#e14e7f;" @click="stopActiveEvent">Dừng sự kiện này</button></div></div>
          </div>
          <div class="ds-card">
            <div class="ds-card-head"><div><span style="background:#8b5cf6; color:#fff; border-radius:8px; padding:4px 8px;">+</span> <strong>Tạo sự kiện mới</strong><small>Nhập tên sự kiện để ảnh và video của khách được lưu riêng vào một thư mục.</small></div></div>
            <div class="ds-body">
              <div class="ds-row" style="margin-top:8px;">
                <input v-model="eventName" placeholder="Ví dụ: Đám cưới Anh &amp; Lan 28/10" style="flex:1;" />
                <button class="ds-btn-pink" :disabled="eventLoading" @click="createEvent">＋ Tạo sự kiện &amp; Bắt đầu chụp</button>
              </div>
              <p v-if="eventStatus" class="ds-hint">{{ eventStatus }}</p>
            </div>
          </div>
          <div class="ds-card">
            <div class="ds-card-head"><div><strong>DANH SÁCH SỰ KIỆN ĐÃ TẠO</strong><small>Bạn có thể kích hoạt lại sự kiện cũ bất kỳ lúc nào.</small></div><span class="ds-chip">{{ events.length }} sự kiện</span></div>
            <div class="ds-body">
              <div v-if="events.length === 0" class="ds-empty">Chưa có sự kiện nào. Hãy tạo sự kiện đầu tiên ở trên!</div>
              <div v-for="ev in events" :key="ev.id" style="border:1px solid #eee; padding:8px; border-radius:8px;">
                <div class="ds-row" style="align-items:center; flex-wrap:wrap;">
                  <strong style="flex:1;">{{ ev.name }}</strong>
                  <span class="ds-chip">{{ ev.status === 1 ? 'Đang diễn ra' : 'Hoàn thành' }}</span>
                  <span class="ds-chip">{{ (ev.frame_ids || []).length }} frame</span>
                  <button class="ds-btn-pink" style="background:#8b5cf6;" @click="toggleFramePicker(ev)">🖼 Chọn frame{{ framePickerOpen === String(ev.id) ? ' ▲' : ' ▼' }}</button>
                  <button class="ds-btn-pink" @click="addFrameForEvent(ev)">Thêm frame</button>
                  <button class="ds-btn-gray" @click="openFolderFor(ev)">Mở ảnh</button>
                  <button class="ds-btn-pink" style="background:#6b7280;" @click="activateEvent(ev)">{{ String(activeEventId) === String(ev.id) ? 'Đang chọn' : 'Kích hoạt' }}</button>
                  <button class="ds-btn-gray" @click="deleteEvent(ev)">Xóa</button>
                </div>
                <div v-if="framePickerOpen === String(ev.id)" style="border-top:1px dashed #e5e7eb; padding-top:10px; margin-top:8px;">
                  <div v-if="allFrames.length === 0" class="ds-empty">Chưa có frame nào. Dùng "Thêm frame" để tải frame lên trước.</div>
                  <div v-else style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;max-height:240px;overflow-y:auto;">
                    <button v-for="f in allFrames" :key="f.id" type="button" @click="toggleFrameForEvent(ev, Number(f.id))"
                      :style="{ border: frameChecked(ev, Number(f.id)) ? '2px solid #8b5cf6' : '1px solid #e5e7eb', borderRadius: '10px', padding: '6px', background: frameChecked(ev, Number(f.id)) ? '#f3e8ff' : '#fff', cursor: 'pointer', textAlign: 'center' }">
                      <img :src="frameImgUrl(f)" :alt="String(f.name)" style="width:100%;height:72px;object-fit:contain;border-radius:8px;background:#fdf3f7;" />
                      <small style="display:block;font-size:10px;word-break:break-word;margin-top:3px;">{{ f.name }}</small>
                    </button>
                  </div>
                  <div class="ds-row" style="margin-top:8px; align-items:center;">
                    <input :id="'frame-file-input-' + ev.id" type="file" accept="image/png" multiple style="display:none" @change="(e) => onLocalFrameFiles(ev, e)" />
                    <button class="ds-btn-gray" :disabled="frameUploading" @click="triggerLocalFramePick(ev)">{{ frameUploading ? 'Đang tải...' : '📤 Tải frame từ máy' }}</button>
                    <small class="ds-hint" v-if="frameUploadStatus" style="margin:0;">{{ frameUploadStatus }}</small>
                  </div>
                  <div class="ds-row" style="margin-top:8px; align-items:center;">
                    <button class="ds-btn-pink" :disabled="frameSaving" @click="saveFramesForEvent(ev)">{{ frameSaving ? 'Đang lưu...' : '💾 Lưu frame đã chọn' }}</button>
                    <button class="ds-btn-gray" @click="framePickerOpen = ''">Đóng</button>
                    <span v-if="frameStatus" class="ds-hint" style="margin:0;">{{ frameStatus }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Hoạt động & Đồng bộ -->
        <div v-if="activeTab === 'sync'">
          <div class="ds-note-warn">
            <strong>Lưu ý quan trọng khi chạy sự kiện:</strong>
            <ul>
              <li>Cần có mạng lần đầu để đồng bộ dữ liệu (frame, layout, cài đặt).</li>
              <li>Ưu tiên khởi động offline, không chờ kiểm tra mạng.</li>
              <li>Khi mất mạng: bật 'Tự tắt thanh toán khi mất mạng' để khách vẫn chụp miễn phí.</li>
            </ul>
          </div>
          <div class="ds-card">
            <div class="ds-card-head"><div>☁ <strong>Đồng bộ &amp; Mạng</strong><small>Cài mạng, đồng bộ và ảnh lưu trên máy.</small></div><div class="ds-row"><button class="ds-btn-pink">Kiểm tra &amp; đồng bộ media</button><button class="ds-btn-gray">Dọn ảnh local</button><button class="ds-btn-gray">Xóa cache</button></div></div>
            <div class="ds-body">
              <label class="ds-toggle"><input type="checkbox" v-model="cloudSync" /><span></span><div><strong>Cho phép đồng bộ đám mây</strong><small>Bật để khách lấy ảnh bằng QR.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="offlineFirst" /><span></span><div><strong>Ưu tiên khởi động offline</strong><small>Mở app ở chế độ offline, không chờ kiểm tra mạng.</small></div></label>
              <label class="ds-toggle"><input type="checkbox" v-model="disablePaymentOffline" /><span></span><div><strong>Tự tắt thanh toán khi mất mạng</strong><small>Mất mạng thì cho khách chụp miễn phí.</small></div></label>

              <div class="ds-row" style="margin-top:12px;">
                <div class="ds-stat">LAYOUTS<strong>2</strong></div>
                <div class="ds-stat">DANH MỤC<strong>2</strong></div>
                <div class="ds-stat">FILTERS<strong>{{ filters.length }}</strong></div>
                <div class="ds-stat">KHUNG HÌNH<strong>{{ events.length + (themesCount()) }}</strong></div>
              </div>

              <label class="ds-label">HÀNG CHỜ ĐỒNG BỘ ĐÁM MÂY</label>
              <div class="ds-row">
                <span class="ds-stat warn">CHỜ XỬ LÝ<strong>{{ queueStats.pending }}</strong></span>
                <span class="ds-stat blue">ĐANG TẢI<strong>{{ queueStats.uploading }}</strong></span>
                <span class="ds-stat red">THẤT BẠI<strong>{{ queueStats.failed }}</strong></span>
                <span class="ds-stat green">HOÀN TẤT<strong>{{ queueStats.done }}</strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Kết nối & Bản quyền -->
        <div v-if="activeTab === 'license'">
          <div class="ds-card">
            <div class="ds-card-head"><div>🔑 <strong>Kết nối &amp; Bản quyền</strong><small>Kiểm tra kết nối và bản quyền của máy.</small></div><button class="ds-btn-pink">Kiểm tra bản quyền</button></div>
            <div class="ds-body">
              <label class="ds-label">MACHINE API KEY</label>
              <input v-model="machineApiKey" placeholder="hihi_machine_xxxxxxxxxxxx" style="width:100%;" />
              <div class="ds-info">Máy đang kết nối bằng bản dùng thử.</div>
              <label class="ds-label">DEVICE ID</label>
              <input :value="deviceId" readonly style="width:100%; font-family:monospace;" />
              <div class="ds-divider"></div>
              <p class="ds-label">THÔNG TIN BẢN QUYỀN &amp; MÁY</p>
              <p>KHÁCH HÀNG: Admin · TRẠNG THÁI: ACTIVE · HẠN: 2026 · MÁY: ACTIVE</p>
            </div>
          </div>
        </div>

        <!-- Cập nhật -->
        <div v-if="activeTab === 'update'">
          <div class="ds-card"><div class="ds-body">Đã là bản mới nhất (v12.0.8).</div></div>
        </div>

        <!-- Liên hệ -->
        <div v-if="activeTab === 'contact'">
          <div class="ds-card">
            <div class="ds-body">
              <p><strong>HiHiBooth</strong> — Phiên bản v12.0.8</p>
              <p>SDT / ZALO: 0985.626.893</p>
              <p>MỞ PANEL ADMIN — xem docs</p>
            </div>
          </div>
        </div>
      </section>

      <footer class="ds-footer">
        <button class="ds-btn-gray" @click="save">☁ Đồng bộ cấu hình</button>
        <button class="ds-btn-pink" @click="save">💾 Lưu cài đặt</button>
      </footer>
      <p v-if="status" style="margin:8px 16px; color:green;">{{ status }}</p>
    </main>
  </div>
</template>

<style scoped>
.ds-root { display:flex; height:100vh; font-family:Segoe UI, sans-serif; color:#222; background:#f5f7f5; }
.ds-sidebar { width:230px; background:#15182a; color:#fff; display:flex; flex-direction:column; flex-shrink:0; }
.ds-brand { display:flex; gap:10px; padding:14px; align-items:center; }
.ds-logo { width:36px; height:36px; background:#ff4d6d; border-radius:8px; display:grid; place-items:center; }
.ds-brand-name { font-weight:800; }
.ds-brand-sub { font-size:10px; opacity:0.6; letter-spacing:1px; }
.ds-back { margin:0 14px 10px; background:#252a45; color:#fff; border:none; padding:9px; border-radius:8px; cursor:pointer; text-align:center; }
.ds-top-actions { display:flex; gap:8px; margin:0 14px 12px; }
.ds-refresh { flex:1; background:#3a2b00; color:#ffd54d; border:1px solid #7a5c00; padding:8px; border-radius:8px; cursor:pointer; font-size:12px; }
.ds-power { width:36px; background:#5a1020; color:#ff5a7a; border:none; border-radius:8px; cursor:pointer; }
.ds-group-title { font-size:10px; letter-spacing:1px; color:#7a80a0; margin:12px 14px 6px; }
.ds-nav { display:flex; gap:8px; align-items:center; width:calc(100% - 16px); margin:2px 8px; padding:8px 10px; background:transparent; color:#c8cce0; border:none; border-radius:8px; cursor:pointer; text-align:left; font-size:13px; }
.ds-nav:hover { background:#20243a; }
.ds-nav.active { background:#ff4d6d; color:#fff; }
.ds-sidebar-foot { margin-top:auto; padding:12px 14px; border-top:1px solid #252a45; font-size:11px; color:#8a90b0; }
.ds-sidebar-foot .row { display:flex; justify-content:space-between; margin:4px 0; }
.ds-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.ds-topbar { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:#fff; border-bottom:1px solid #e8ece8; }
.ds-top-left { display:flex; gap:10px; align-items:center; }
.ds-top-left h1 { margin:0; font-size:16px; }
.ds-top-left p { margin:2px 0 0; font-size:12px; color:#888; }
.ds-burger { border:1px solid #ddd; background:#fff; border-radius:8px; padding:6px 10px; }
.ds-top-right { display:flex; gap:8px; align-items:center; }
.ds-chip { font-size:11px; background:#f0f4f0; padding:6px 10px; border-radius:999px; border:1px solid #e0e6e0; }
.ds-chip.green { background:#e6f5ea; color:#1a7f37; }
.ds-chip.dark { background:#15182a; color:#fff; cursor:pointer; border:none; }
.ds-tabs { display:flex; gap:6px; overflow-x:auto; padding:10px 16px; background:#fff; border-bottom:1px solid #e8ece8; }
.ds-tab { white-space:nowrap; font-size:12px; padding:7px 12px; border-radius:999px; border:1px solid #e8ece8; background:#fff; cursor:pointer; }
.ds-tab.active { background:#ff4d6d; color:#fff; border-color:#ff4d6d; }
.ds-content { flex:1; overflow:auto; padding:16px; }
.ds-card { background:#fff; border:1px solid #e8ece8; border-radius:14px; margin-bottom:14px; overflow:hidden; }
.ds-card-head { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid #f0f0f0; }
.ds-card-head small { display:block; color:#888; font-size:12px; margin-top:2px; }
.ds-body { padding:14px 16px; }
.ds-label { font-size:11px; font-weight:800; letter-spacing:0.06em; color:#555; display:block; margin:10px 0 6px; }
.ds-hint { font-size:12px; color:#888; }
.ds-row { display:flex; gap:10px; align-items:center; margin:8px 0; flex-wrap:wrap; }
.ds-pill { font-size:11px; padding:4px 10px; border-radius:999px; border:1px solid #ddd; background:#fff; cursor:pointer; }
.ds-pill.on { background:#ff4d6d; color:#fff; border-color:#ff4d6d; }
.ds-toggle { display:flex; gap:10px; align-items:center; padding:10px; border:1px solid #eef0ee; border-radius:10px; margin:8px 0; cursor:pointer; }
.ds-toggle input { display:none; }
.ds-toggle span { width:36px; height:20px; background:#ddd; border-radius:999px; position:relative; flex-shrink:0; }
.ds-toggle span::after { content:''; position:absolute; width:16px; height:16px; background:#fff; border-radius:50%; top:2px; left:2px; transition:0.2s; }
.ds-toggle input:checked + span { background:#ff4d6d; }
.ds-toggle input:checked + span::after { left:18px; }
.ds-toggle small { display:block; color:#888; font-size:11px; }
.ds-divider { border-top:1px solid #eee; margin:14px 0; }
.ds-info { background:#eaf2ff; color:#2563eb; padding:10px 12px; border-radius:8px; font-size:12px; margin:8px 0; }
.ds-info-warn { background:#fff7e0; color:#92600a; padding:10px 12px; border-radius:8px; font-size:12px; margin:8px 0; }
.ds-note { background:#f3e8ff; color:#6b21a8; padding:10px 12px; border-radius:8px; margin-bottom:12px; font-size:13px; }
.ds-note-warn { background:#fff7e0; border:1px solid #fde68a; padding:12px; border-radius:12px; margin-bottom:12px; font-size:13px; }
.ds-note-warn ul { margin:6px 0 0; padding-left:20px; }
.ds-upload { border:2px dashed #ddd; border-radius:12px; padding:22px; text-align:center; color:#999; cursor:pointer; margin:8px 0; }
.ds-empty { text-align:center; color:#aaa; padding:18px; border:1px solid #eee; border-radius:10px; }
.ds-btn-pink { background:#ff4d6d; color:#fff; border:none; padding:9px 16px; border-radius:8px; cursor:pointer; font-weight:700; }
.ds-btn-gray { background:#f0f0f0; border:1px solid #ddd; padding:8px 14px; border-radius:8px; cursor:pointer; }
.ds-vendor { flex:1; padding:12px; border:1px solid #ddd; border-radius:10px; background:#fff; cursor:pointer; text-align:center; }
.ds-vendor.on { border-color:#3b82f6; background:#eff6ff; color:#2563eb; }
.ds-lang, .ds-mode { flex:1; padding:12px; border:1px solid #ddd; border-radius:10px; background:#fff; cursor:pointer; text-align:left; }
.ds-lang.on, .ds-mode.on { border-color:#ff4d6d; background:#fff0f3; color:#ff4d6d; }
.ds-paper-bar { height:10px; background:#e5e7eb; border-radius:999px; overflow:hidden; margin:8px 0; }
.ds-paper-bar > div { height:100%; background:#10b981; }
.ds-stat { flex:1; border:1px solid #eee; border-radius:10px; padding:12px; font-size:11px; color:#888; display:flex; flex-direction:column; gap:4px; }
.ds-stat strong { font-size:18px; color:#222; }
.ds-stat.warn strong { color:#b45309; } .ds-stat.blue strong { color:#2563eb; } .ds-stat.red strong { color:#dc2626; } .ds-stat.green strong { color:#16a34a; }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ds-footer { display:flex; justify-content:flex-end; gap:10px; padding:12px 16px; background:#fff; border-top:1px solid #e8ece8; }
</style>
