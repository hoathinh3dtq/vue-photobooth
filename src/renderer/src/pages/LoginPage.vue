<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { login, saveSession } from '../lib/api/auth'
import { useFlowStore } from '../stores/flow'

interface SidecarCamera {
  id: string
  name: string
  port?: string
  protocol?: string
  selectionId?: string
}

interface SidecarDetectResult {
  available: boolean
  exePath: string | null
  raw: string
  lines: string[]
  fujiLoaded: boolean
  fujiInit: boolean
  sonyInit: boolean
  sonyVersion: string | null
  cameras: SidecarCamera[]
  error: string | null
  elapsedMs: number
}

interface CameraStatusResult {
  brand: string | null
  provider: string | null
  available: boolean
}

const router = useRouter()

const email = ref('')
const password = ref('')
const boothCode = ref('')
const error = ref('')
const loading = ref(false)

// ── Camera status panel (operator-only) ──
const cam = ref<SidecarDetectResult | null>(null)
const digi = ref<CameraStatusResult | null>(null)
const camChecking = ref(false)
const lastChecked = ref('')

function statusClass(ok: boolean | undefined): string {
  return ok ? 'ok' : 'bad'
}

async function refreshCameraStatus(): Promise<void> {
  camChecking.value = true
  try {
    const api = (window as unknown as { electronAPI?: { camera?: { sidecarDetect?: () => Promise<SidecarDetectResult>; detect?: () => Promise<CameraStatusResult> } } }).electronAPI
    const sidecarP = api?.camera?.sidecarDetect?.().catch((e: unknown): SidecarDetectResult => ({
      available: false,
      exePath: null,
      raw: '',
      lines: [],
      fujiLoaded: false,
      fujiInit: false,
      sonyInit: false,
      sonyVersion: null,
      cameras: [],
      error: String(e),
      elapsedMs: 0,
    })) ?? Promise.resolve(null)
    const digiP = api?.camera?.detect?.().catch(() => null) ?? Promise.resolve(null)
    const [s, d] = await Promise.all([sidecarP, digiP])
    cam.value = s
    digi.value = d
    lastChecked.value = new Date().toLocaleTimeString('vi-VN')
    try {
      api?.camera?.sidecarDetect && console.log('[camera] sidecar status refreshed', JSON.stringify({ fujiInit: s?.fujiInit, sonyInit: s?.sonyInit, cams: s?.cameras?.map((c) => c.name) }))
    } catch { /* ignore */ }
  } finally {
    camChecking.value = false
  }
}

onMounted(() => {
  void refreshCameraStatus()
})

async function onSubmit(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''

  try {
    const res = await login(email.value, password.value, boothCode.value)
    saveSession(res)
    try {
      useFlowStore().reload()
    } catch {
      /* flow store chưa khởi tạo: bỏ qua */
    }
    router.push('/home')
  } catch (e) {
    try {
      const parsed = JSON.parse((e as Error).message)
      error.value = parsed.message || 'Sai email hoặc mật khẩu'
    } catch {
      error.value = 'Sai email hoặc mật khẩu'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-box">
      <h1 class="login-title">WELCOME</h1>
      <h2 class="login-subtitle">PHOTOBOOTH</h2>
      <form class="login-form" @submit.prevent="onSubmit">
        <input v-model="email" class="login-input" type="email" placeholder="Email" required autofocus />
        <input v-model="password" class="login-input" type="password" placeholder="Mật khẩu" required />
        <input v-model="boothCode" class="login-input" type="text" placeholder="Mã booth" required />
        <button class="login-btn" type="submit" :disabled="loading">
          {{ loading ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP' }}
        </button>
        <p class="login-error">{{ error }}</p>
      </form>

      <!-- Camera status (operator) -->
      <div class="cam-panel" aria-live="polite">
        <div class="cam-head">
          <span class="cam-title">CAMERA STATUS</span>
          <button class="cam-refresh" type="button" :disabled="camChecking" @click="refreshCameraStatus" :aria-label="camChecking ? 'Đang kiểm tra' : 'Kiểm tra lại'">
            {{ camChecking ? '…' : '↻' }}
          </button>
        </div>

        <div class="cam-body" v-if="cam">
          <div class="cam-row">
            <span class="cam-label">Sidecar</span>
            <span :class="['cam-value', statusClass(cam.available)]">{{ cam.available ? 'OK' : 'KHÔNG CÓ' }}</span>
          </div>
          <div class="cam-row">
            <span class="cam-label">Fuji SDK</span>
            <span :class="['cam-value', statusClass(cam.fujiInit)]">
              {{ cam.fujiInit ? 'INIT OK' : cam.fujiLoaded ? 'LOAD ONLY' : 'FAIL' }}
            </span>
          </div>
          <div class="cam-row">
            <span class="cam-label">Sony CRSDK</span>
            <span :class="['cam-value', statusClass(cam.sonyInit)]">
              {{ cam.sonyInit ? `INIT ${cam.sonyVersion ?? ''}`.trim() : 'FAIL' }}
            </span>
          </div>
          <div class="cam-row">
            <span class="cam-label">digiCamControl</span>
            <span :class="['cam-value', statusClass(digi?.available)]">
              {{ digi?.available ? 'SẴN SÀNG' : 'KHÔNG THẤY' }}
            </span>
          </div>
          <div class="cam-row cam-row-block">
            <span class="cam-label">Thiết bị</span>
            <div class="cam-devices">
              <span v-if="!cam.cameras.length" class="cam-dim">Không có thiết bị</span>
              <ul v-else class="cam-list">
                <li v-for="c in cam.cameras" :key="c.selectionId ?? c.id">
                  <span class="cam-dot"></span>{{ c.name }}<em>{{ c.protocol }}</em>
                </li>
              </ul>
            </div>
          </div>
          <p v-if="cam.error" class="cam-error">⚠ {{ cam.error }}</p>
          <p v-if="cam.exePath" class="cam-path" :title="cam.exePath">{{ cam.exePath }}</p>
          <p v-if="lastChecked" class="cam-time">Kiểm tra lúc {{ lastChecked }}</p>
        </div>
        <div class="cam-body cam-loading" v-else>Đang kiểm tra camera…</div>
      </div>
    </div>
  </div>
</template>
