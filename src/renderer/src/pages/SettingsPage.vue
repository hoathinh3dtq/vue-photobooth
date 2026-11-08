<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const printers = ref<string[]>([])
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
const status = ref('')
const loading = ref(false)

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
    }
    const res = await api?.printer?.list?.()
    if (res?.ok) printers.value = res.printers || []
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
    })
    status.value = 'Đã lưu settings.'
  } catch (e) {
    status.value = 'Lỗi lưu: ' + String(e)
  }
}

async function openPrefs() {
  try {
    const api = (window as any).electronAPI
    await api?.printer?.openPreferences?.(printerName.value)
  } catch (e) {
    status.value = 'Lỗi mở preferences: ' + String(e)
  }
}

function goHome() {
  router.push('/home')
}

onMounted(() => { void load() })
</script>

<template>
  <div class="settings-page" style="padding:2vw; color:#333; font-family:sans-serif;">
    <h1>Cài đặt máy in</h1>
    <button @click="goHome" style="margin-bottom:1vw;">← Quay lại</button>

    <div style="margin:1vw 0;">
      <label>Máy in (strip): </label>
      <select v-model="printerName" style="min-width:260px;">
        <option value="">-- chọn máy in --</option>
        <option v-for="p in printers" :key="p" :value="p">{{ p }}</option>
      </select>
      <button @click="openPrefs" style="margin-left:8px;">Mở tùy chọn máy in</button>
      <button @click="load" style="margin-left:8px;">Nạp lại danh sách</button>
    </div>

    <div style="margin:1vw 0;">
      <label>Máy in strip (2x6): </label>
      <select v-model="stripPrinter" style="min-width:260px;">
        <option value="">-- chọn máy in --</option>
        <option v-for="p in printers" :key="'s'+p" :value="p">{{ p }}</option>
      </select>
    </div>

    <div style="margin:1vw 0;">
      <label>Máy in full (4x6): </label>
      <select v-model="fullPrinter" style="min-width:260px;">
        <option value="">-- chọn máy in --</option>
        <option v-for="p in printers" :key="'f'+p" :value="p">{{ p }}</option>
      </select>
    </div>

    <div style="margin:1vw 0;">
      <label>Zoom correction: {{ zoom.toFixed(2) }}</label>
      <input type="range" min="0.80" max="1.10" step="0.01" v-model.number="zoom" style="width:100%;" />
    </div>

    <div style="margin:1vw 0; display:flex; gap:1vw;">
      <div>
        <label>Offset X: </label>
        <input type="number" v-model.number="offsetX" style="width:80px;" />
      </div>
      <div>
        <label>Offset Y: </label>
        <input type="number" v-model.number="offsetY" style="width:80px;" />
      </div>
    </div>

    <div style="margin:1vw 0; display:flex; gap:1vw;">
      <div>
        <label>Giấy đã nạp: </label>
        <input type="number" v-model.number="paperLoaded" style="width:80px;" />
      </div>
      <div>
        <label>Giấy còn lại: </label>
        <input type="number" v-model.number="paperRemaining" style="width:80px;" />
      </div>
      <div>
        <label>Ngưỡng cảnh báo: </label>
        <input type="number" v-model.number="warningThreshold" style="width:80px;" />
      </div>
    </div>

    <div style="margin:1vw 0;">
      <label><input type="checkbox" v-model="allowCancelOnPreview" /> Cho phép hủy ở preview in</label>
    </div>
    <div style="margin:1vw 0;">
      <label><input type="checkbox" v-model="autoPrintOnPreview" /> Tự động in khi preview render xong</label>
    </div>
    <div style="margin:1vw 0;">
      <label><input type="checkbox" v-model="printQr" /> In kèm mã QR</label>
    </div>
    <p v-if="paperRemaining <= warningThreshold" style="color:#b45309; font-weight:700;">⚠ Sắp hết giấy!</p>

    <button @click="save" :disabled="loading" style="margin-top:1vw; padding:8px 16px;">Lưu cài đặt</button>
    <p v-if="status" style="margin-top:8px; color:green;">{{ status }}</p>
  </div>
</template>
