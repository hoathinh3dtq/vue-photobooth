<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useConfigStore } from '../stores/config'
import { useFlowStore } from '../stores/flow'
import { useSelectionStore } from '../stores/selection'
import { useSessionStore } from '../stores/session'
import { getTLStream, stopTimeLapse, whenTLReady } from '../lib/timelapse'

interface CapturedPhoto {
  image: string
  retakeCount: number
}

const configStore = useConfigStore()
const flowStore = useFlowStore()
const selectionStore = useSelectionStore()
const sessionStore = useSessionStore()

const videoRef = ref<HTMLVideoElement | null>(null)
const capturedPreviewRef = ref<HTMLImageElement | null>(null)
const flashRef = ref<HTMLDivElement | null>(null)
const countdownRef = ref<HTMLDivElement | null>(null)
const previewRef = ref<HTMLDivElement | null>(null)
const idolOverlayRef = ref<HTMLImageElement | null>(null)

const photos = ref<CapturedPhoto[]>([])
const currentIndex = ref(-1)
const cameraError = ref('')

let stream: MediaStream | null = null
const isCapturing = ref(false)
const captureCompleted = ref(false)
const captureStarted = ref(false)
const webcamReady = ref(false)

const totalTake = computed(() => flowStore.flow.camera.totalTake())
const maxRetake = computed(() => configStore.config?.re_take ?? 2)
const timeTake = computed(() => configStore.config?.time_to_take ?? 3)

// Trạng thái nút bấm (khớp updateActionButtons của v1)
const startDisabled = computed(() => !webcamReady.value || isCapturing.value || captureCompleted.value)
const retakeDisabled = computed(
  () => !webcamReady.value || isCapturing.value || currentIndex.value === -1,
)
const themeDisabled = computed(() => isCapturing.value || !captureCompleted.value)
const returnDisabled = computed(() => isCapturing.value || captureStarted.value)

// IDOL-MODE: mỗi shot hiện đúng icon thứ tự icons[activeShotIndex]
const activeShotIndex = ref(-1)
const isReviewing = ref(false)
const isIdolMode = computed(() => selectionStore.typeIdol === 1 && selectionStore.idolIcons.length > 0)
const activeIdolUrl = computed(() => {
  if (!isIdolMode.value || !isCapturing.value) return ''
  const icons = selectionStore.idolIcons
  if (activeShotIndex.value < 0 || activeShotIndex.value >= icons.length) return ''
  return icons[activeShotIndex.value]?.url || ''
})
const reviewIdolUrl = computed(() => {
  if (!isIdolMode.value || isCapturing.value || !isReviewing.value) return ''
  const icons = selectionStore.idolIcons
  if (currentIndex.value < 0 || currentIndex.value >= icons.length) return ''
  return icons[currentIndex.value]?.url || ''
})
const visibleIdolUrl = computed(() => activeIdolUrl.value || reviewIdolUrl.value)
// IDOL-MODE: vị trí theo từng icon (position 0 = trái, 1 = phải)
const visibleIdolSide = computed<'left' | 'right'>(() => {
  const icons = selectionStore.idolIcons
  if (activeIdolUrl.value) return icons[activeShotIndex.value]?.side || 'left'
  if (reviewIdolUrl.value) return icons[currentIndex.value]?.side || 'left'
  return 'left'
})
function previewIdolUrl(index: number): string {
  if (!isIdolMode.value) return ''
  const icons = selectionStore.idolIcons
  if (index < 0 || index >= icons.length) return ''
  return icons[index]?.url || ''
}
function previewIdolSide(index: number): 'left' | 'right' {
  if (!isIdolMode.value) return 'left'
  return selectionStore.idolIcons[index]?.side || 'left'
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function mirrorValue(): number {
  return configStore.config?.mirror_camera ?? 0
}

function applyMirrorTo(el: HTMLElement, withCrop = true): void {
  const val = mirrorValue()
  const s = withCrop ? cropScaleX : 1
  if (val === 1) el.style.transform = `scale(${-s}, 1)`
  else if (val === 2) el.style.transform = `scale(1, -1)`
  else if (val === 3) el.style.transform = `scale(${-s}, -1)`
  else el.style.transform = `scale(${s}, 1)`
}

// IDOL-MODE: overlay idol mirror/crop giống hệt video live
watch(visibleIdolUrl, async (url) => {
  if (!url) return
  await nextTick()
  const el = idolOverlayRef.value
  if (el) applyMirrorTo(el, true)
})

// Tự đo viền đen (pillarbox) của nguồn HDMI/camera và crop bằng transform.
// USE_AUTO_CROP = false -> quay về hardcode 119% / -93px.
let cropScaleX = 1
const USE_AUTO_CROP = true

function measurePillarbox(video: HTMLVideoElement): number {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return 0
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return 0
  try {
    ctx.drawImage(video, 0, 0, w, h)
  } catch {
    return 0
  }
  const d = ctx.getImageData(0, 0, w, h).data
  const colBright = (x: number): number => {
    let sum = 0
    let n = 0
    const step = Math.max(1, Math.floor(h / 40))
    for (let y = 0; y < h; y += step) {
      const i = (y * w + x) * 4
      sum += d[i] + d[i + 1] + d[i + 2]
      n += 3
    }
    return sum / n
  }
  let center = 0
  const cx0 = Math.floor(w / 3)
  const cx1 = Math.floor((2 * w) / 3)
  for (let x = cx0; x < cx1; x++) center += colBright(x)
  center /= cx1 - cx0 || 1
  if (center < 8) return 0
  const thr = center * 0.5
  let left = 0
  for (let x = 0; x < w; x++) {
    if (colBright(x) > thr) {
      left = x
      break
    }
  }
  let right = w - 1
  for (let x = w - 1; x >= 0; x--) {
    if (colBright(x) > thr) {
      right = x
      break
    }
  }
  if (right <= left) return 0
  const contentFrac = (right - left + 1) / w
  if (contentFrac <= 0.55 || contentFrac >= 0.98) return 0
  return contentFrac
}

function applyVideoCrop(video: HTMLVideoElement): void {
  if (!USE_AUTO_CROP) {
    video.style.width = '119%'
    video.style.marginLeft = '-93px'
    video.style.transformOrigin = ''
    applyMirrorTo(video, true)
    return
  }
  video.style.width = '100%'
  video.style.marginLeft = ''
  video.style.transformOrigin = 'center center'
  let attempts = 0
  const tryMeasure = () => {
    const contentFrac = measurePillarbox(video)
    if (contentFrac > 0) {
      cropScaleX = 1 / contentFrac
      applyMirrorTo(video, true)
    } else if (attempts++ < 6) {
      setTimeout(tryMeasure, 400)
    } else {
      cropScaleX = 1
      applyMirrorTo(video, true)
    }
  }
  tryMeasure()
}

async function startCamera(): Promise<void> {
  const video = videoRef.value
  if (!video) return

  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = 'navigator.mediaDevices không tồn tại'
    console.error('[camera] navigator.mediaDevices missing')
    return
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    console.log('[camera] devices:', devices.map((d) => `${d.kind}:${d.label || '?'}`).join(', '))
  } catch (e) {
    console.warn('[camera] enumerateDevices failed:', e)
  }

  // Chờ timelapse khởi động xong (tránh 2 getUserMedia giành camera)
  cameraError.value = 'Đang mở camera...'
  await whenTLReady()
  const tlStream = getTLStream()
  if (tlStream && tlStream.active) {
    console.log('[camera] using timelapse stream')
    stream = tlStream
    video.srcObject = stream
    await video.play()
    applyVideoCrop(video)
    webcamReady.value = video.videoWidth > 0
    cameraError.value = ''
    return
  }

  try {
    console.log('[camera] requesting getUserMedia...')
    const gumPromise = navigator.mediaDevices.getUserMedia({ video: true })
    let timedOut = false
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true
        reject(new DOMException('getUserMedia timeout sau 8s', 'TimeoutError'))
      }, 8000)
    })
    void gumPromise.then(
      (late) => {
        if (timedOut) late.getTracks().forEach((t) => t.stop())
      },
      () => {},
    )

    stream = await Promise.race([gumPromise, timeout])
    console.log('[camera] stream acquired, tracks:', stream.getVideoTracks().map((t) => `${t.label}(${t.readyState})`).join(', '))

    const track = stream.getVideoTracks()[0]
    track?.addEventListener('ended', () => {
      console.error('[camera] video track ENDED')
      cameraError.value = 'Camera bị ngắt (track ended)'
      webcamReady.value = false
    })
    track?.addEventListener('mute', () => console.warn('[camera] video track muted'))

    video.srcObject = stream
    await new Promise<void>((resolve) => {
      if (video.readyState >= 1 && video.videoWidth > 0) {
        resolve()
        return
      }
      const timeout = setTimeout(() => resolve(), 5000)
      video.onloadedmetadata = () => {
        clearTimeout(timeout)
        resolve()
      }
    })

    await video.play().catch((e) => console.warn('[camera] play() rejected:', e))
    applyVideoCrop(video)
    webcamReady.value = video.videoWidth > 0
    cameraError.value = ''
    console.log('[camera] webcam ready:', video.videoWidth, 'x', video.videoHeight, 'readyState:', video.readyState)
    if (!webcamReady.value) {
      cameraError.value = 'Mở được camera nhưng không có hình (kiểm tra nguồn tín hiệu)'
    }
  } catch (err) {
    const e = err as DOMException
    webcamReady.value = false
    if (e.name === 'TimeoutError') {
      cameraError.value =
        'Camera bị treo khi mở (timeout). Kiểm tra Windows Settings > Privacy > Camera đang BẬT, hoặc rút/cắm lại webcam.'
    } else {
      cameraError.value = `Camera lỗi: ${e.name} - ${e.message}`
    }
    console.error('[camera] getUserMedia failed:', e.name, e.message)
  }
}

function stopCamera(): void {
  const tlStream = getTLStream()
  if (stream && stream !== tlStream) {
    stream.getTracks().forEach((track) => track.stop())
  }
  stream = null
  if (videoRef.value) videoRef.value.srcObject = null
}

function trimBlackBorders(src: HTMLCanvasElement, minFrac = 0.02, black = 24): HTMLCanvasElement {
  const ctx = src.getContext('2d')
  if (!ctx) return src
  const w = src.width
  const h = src.height
  const d = ctx.getImageData(0, 0, w, h).data
  const colBlack = new Array<boolean>(w).fill(true)
  const rowBlack = new Array<boolean>(h).fill(true)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (!(d[i] <= black && d[i + 1] <= black && d[i + 2] <= black)) {
        colBlack[x] = false
        rowBlack[y] = false
      }
    }
  }
  let left = colBlack.indexOf(false)
  let right = colBlack.lastIndexOf(false)
  let top = rowBlack.indexOf(false)
  let bottom = rowBlack.lastIndexOf(false)
  if (left < 0) {
    left = 0
    right = w - 1
    top = 0
    bottom = h - 1
  }
  const minW = Math.floor(w * minFrac)
  const minH = Math.floor(h * minFrac)
  if (left < minW) left = 0
  if (w - 1 - right < minW) right = w - 1
  if (top < minH) top = 0
  if (h - 1 - bottom < minH) bottom = h - 1
  const cw = right - left + 1
  const ch = bottom - top + 1
  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  out.getContext('2d')?.drawImage(src, left, top, cw, ch, 0, 0, cw, ch)
  return out
}

function flipImage(image: string): Promise<string> {
  const val = mirrorValue()
  if (!val) return Promise.resolve(image)

  return new Promise((resolve) => {
    const flipped = new Image()
    flipped.onload = () => {
      if (!flipped.naturalWidth) {
        resolve(image)
        return
      }
      const c = document.createElement('canvas')
      c.width = flipped.naturalWidth
      c.height = flipped.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) {
        resolve(image)
        return
      }
      if (val === 1) {
        ctx.translate(c.width, 0)
        ctx.scale(-1, 1)
      } else if (val === 2) {
        ctx.translate(0, c.height)
        ctx.scale(1, -1)
      } else if (val === 3) {
        ctx.translate(c.width, c.height)
        ctx.scale(-1, -1)
      }
      ctx.drawImage(flipped, 0, 0)
      resolve(c.toDataURL('image/png'))
    }
    flipped.onerror = () => resolve(image)
    flipped.src = image
  })
}

async function captureImage(replaceIndex = -1): Promise<boolean> {
  const video = videoRef.value
  const capturedPreview = capturedPreviewRef.value
  const flashEl = flashRef.value

  // Flash ngay khi đếm về 0 như v1
  if (flashEl) {
    flashEl.style.transition = 'none'
    flashEl.style.opacity = '1'
    await wait(150)
    flashEl.style.transition = ''
    flashEl.style.opacity = '0'
  }

  let image = ''
  let fromDslr = false

  // Ưu tiên chụp qua DSLR provider (Canon/Nikon/...) ở main process.
  // Nếu không có provider (chưa cấu hình/SDK thiếu) sẽ trả về lỗi -> fallback webcam.
  try {
    let timedOut = false
    const res = await Promise.race([
      window.electronAPI.camera.capture(),
      wait(15000).then(() => {
        timedOut = true
        return null
      }),
    ])
    if (timedOut) console.warn('[camera] DSLR capture timeout, fallback webcam')
    if (res && res.ok && res.imageDataUrl) {
      image = res.imageDataUrl
      fromDslr = true
    }
  } catch (e) {
    console.warn('[camera] DSLR capture error:', e)
  }

  // Fallback: bắt frame từ webcam/HDMI (dùng khi không có DSLR SDK)
  if (!image && video && video.videoWidth > 0) {
    const c = document.createElement('canvas')
    c.width = video.videoWidth
    c.height = video.videoHeight
    c.getContext('2d')?.drawImage(video, 0, 0)
    // Cắt viền đen pillarbox do nguồn HDMI/camera sinh ra
    image = trimBlackBorders(c).toDataURL('image/png')
  }

  if (!image) {
    fadeBackToLive()
    return false
  }

  if (video) video.style.opacity = '0'
  if (capturedPreview) {
    capturedPreview.style.display = 'block'
    capturedPreview.style.opacity = '0'
    if (!fromDslr) applyMirrorTo(capturedPreview, false)
    capturedPreview.src = image
    capturedPreview.style.opacity = '1'
  }

  // Chỉ flip khi là ảnh webcam fallback (ảnh DSLR đã đúng hướng gốc)
  if (!fromDslr) image = await flipImage(image)

  saveCapturedImage(image, replaceIndex)

  const eventId = localStorage.getItem('event_id')
  if (eventId) window.electronAPI.saveEventPhoto(image, eventId).catch(() => {})

  return true
}

function fadeBackToLive(): void {
  isReviewing.value = false
  const video = videoRef.value
  const capturedPreview = capturedPreviewRef.value
  if (!video || !capturedPreview) return
  capturedPreview.style.opacity = '0'
  setTimeout(() => {
    capturedPreview.style.display = 'none'
    video.style.opacity = '1'
  }, 300)
}

function saveCapturedImage(image: string, replaceIndex = -1): void {
  if (replaceIndex !== -1 && photos.value[replaceIndex]) {
    photos.value[replaceIndex].image = image
    currentIndex.value = replaceIndex
  } else {
    photos.value.push({ image, retakeCount: 0 })
    currentIndex.value = photos.value.length - 1
  }
  renderPreview()
}

async function startAutoCapture(): Promise<void> {
  if (isCapturing.value) return

  isCapturing.value = true
  captureStarted.value = true
  captureCompleted.value = false
  photos.value = []
  currentIndex.value = -1
  isReviewing.value = false
  document.body.classList.add('is-capturing')
  fadeBackToLive()

  try {
    for (let i = 0; i < totalTake.value; i++) {
      activeShotIndex.value = i
      await showCountdown(timeTake.value)
      const captured = await captureImage()
      if (!captured) break
      await wait(2000)
      fadeBackToLive()
    }
  } catch (e) {
    console.error('[camera] auto capture failed:', e)
  } finally {
    document.body.classList.remove('is-capturing')
    isCapturing.value = false
    activeShotIndex.value = -1
  }
  captureCompleted.value = photos.value.length === totalTake.value
  renderPreview()
}

async function retakeImage(): Promise<void> {
  if (currentIndex.value === -1 || isCapturing.value) return

  const photo = photos.value[currentIndex.value]
  if (photo.retakeCount >= maxRetake.value) {
    alert('Het luot chup lai')
    return
  }

  isCapturing.value = true
  document.body.classList.add('is-capturing')
  photo.retakeCount++
  const replaceIndex = currentIndex.value

  try {
    fadeBackToLive()
    activeShotIndex.value = replaceIndex
    await showCountdown(timeTake.value)
    await captureImage(replaceIndex)
  } catch (e) {
    console.error('[camera] retake failed:', e)
  } finally {
    document.body.classList.remove('is-capturing')
    isCapturing.value = false
    activeShotIndex.value = -1
  }
  isReviewing.value = true
}

function renderPreview(): void {
  // Vue render qua template; giữ scroll cuối
  void previewRef.value?.scrollTo({ left: previewRef.value.scrollWidth })
}

function selectPhoto(index: number): void {
  currentIndex.value = index
  isReviewing.value = true
  const video = videoRef.value
  const capturedPreview = capturedPreviewRef.value
  if (!video || !capturedPreview) return
  video.style.opacity = '0'
  capturedPreview.style.display = 'block'
  capturedPreview.style.transform = 'none'
  capturedPreview.style.opacity = '1'
  capturedPreview.src = photos.value[index].image
}

function scrollPreview(direction: number): void {
  previewRef.value?.scrollBy({
    left: direction * previewRef.value.clientWidth * 0.8,
    behavior: 'smooth',
  })
}

async function showCountdown(seconds: number): Promise<void> {
  const el = countdownRef.value
  for (let i = seconds; i > 0; i--) {
    if (el) el.innerText = String(i)
    await wait(1000)
  }
  if (el) el.innerText = '0'
  await wait(150)
  if (el) el.innerText = ''
}

function goNext(): void {
  stopCamera()
  void stopTimeLapse().then((blob) => {
    sessionStore.timeLapseBlob = blob
  })
  selectionStore.capturedPhotos = photos.value.map((p) => ({
    image: p.image,
    retakeCount: p.retakeCount,
    rotation: 0,
  }))
  flowStore.next('camera')
}

function goBack(): void {
  stopCamera()
  flowStore.back('camera')
}

onMounted(() => {
  void startCamera()
})

onBeforeUnmount(() => {
  stopCamera()
  document.body.classList.remove('is-capturing')
})
</script>

<template>
  <section class="camera-layout">
    <div class="camera-stage">
      <div class="camera-screen">
        <video id="video" ref="videoRef" autoplay playsinline muted></video>
        <img id="captured-preview" ref="capturedPreviewRef" />
        <img
          v-if="visibleIdolUrl"
          id="idol-shot-overlay"
          ref="idolOverlayRef"
          :class="{ 'idol-left': visibleIdolSide === 'left' }"
          :src="visibleIdolUrl"
          alt=""
        />
        <div id="flash" ref="flashRef"></div>
        <div id="countdown" ref="countdownRef"></div>
        <p v-if="cameraError" class="camera-error-overlay">{{ cameraError }}</p>
      </div>
      <div class="preview-panel">
        <button class="preview-nav" id="preview-left" type="button" aria-label="Xem anh truoc" @click="scrollPreview(-1)">
          &#8249;
        </button>
        <div id="preview" ref="previewRef" aria-label="Anh da chup">
          <span
            v-for="(p, index) in photos"
            :key="index"
            class="preview-thumb"
          >
            <img
              class="preview-img"
              :class="{ active: index === currentIndex }"
              :src="p.image"
              alt=""
              @click="selectPhoto(index)"
            />
            <img
              v-if="previewIdolUrl(index)"
              class="preview-thumb-idol"
              :class="{ 'idol-left': previewIdolSide(index) === 'left' }"
              :src="previewIdolUrl(index)"
              alt=""
            />
          </span>
        </div>
        <button class="preview-nav" id="preview-right" type="button" aria-label="Xem anh tiep" @click="scrollPreview(1)">
          &#8250;
        </button>
      </div>
    </div>

    <div class="btn-action">
      <button class="btn-page-cam" id="start-short" type="button" :disabled="startDisabled" @click="startAutoCapture">
        <span class="icon">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#f0afaf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="18" cy="6" r="1" />
          </svg>
        </span>
        <p class="text-btn-start">Chụp nào</p>
      </button>

      <button class="btn-page-cam" id="re-short" type="button" :disabled="retakeDisabled" @click="retakeImage">
        <span class="icon">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#f0afaf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="18" cy="6" r="1" />
          </svg>
        </span>
        <p class="text-btn-start">Chụp lại</p>
      </button>

      <button class="btn-page-cam" id="choose-theme" type="button" :disabled="themeDisabled" @click="goNext">
        <span class="icon">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#f0afaf" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="13.5" cy="6.5" r="1.5" />
            <circle cx="17.5" cy="10.5" r="1.5" />
            <circle cx="8.5" cy="7.5" r="1.5" />
            <circle cx="7.5" cy="13.5" r="1.5" />
            <path d="M12 3C7 3 3 6.8 3 11.5C3 16.2 6.8 20 11.5 20H13C14.4 20 15 18.4 14.1 17.4C13.5 16.7 14 15.6 15 15.6H16.4C19.1 15.6 21 13.7 21 11.1C21 6.6 17 3 12 3Z" />
          </svg>
        </span>
          <p class="text-btn-start">{{ isIdolMode ? 'Ghép theme' : 'Chọn theme' }}</p>
      </button>

      <button class="btn-page-cam" id="return-select-type" type="button" :disabled="returnDisabled" @click="goBack">
        <span class="icon">
          <svg class="icon-back" viewBox="0 0 24 24">
            <path d="M14 7L9 12L14 17" />
          </svg>
        </span>
        <p class="text-btn-start">Quay lại</p>
      </button>
    </div>
  </section>
</template>

<style scoped>
.camera-error-overlay {
  position: absolute;
  inset: auto 0 12%;
  z-index: 30;
  margin: 0;
  padding: 1vh 1vw;
  text-align: center;
  color: #ff5f7e;
  font-size: 0.95vw;
  font-weight: 600;
  background: rgba(10, 0, 8, 0.72);
}
#idol-shot-overlay {
  position: absolute;
  right: 0;
  bottom: 0;
  height: 80%;
  max-width: 100%;
  object-fit: contain;
  object-position: right bottom;
  pointer-events: none;
  z-index: 20;
}
.preview-thumb {
  position: relative;
  flex: 0 0 auto;
  height: 150px;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 10px;
}
.preview-thumb .preview-img {
  width: 100%;
  height: 100%;
  flex: none;
}
.preview-thumb-idol {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 80%;
  object-fit: contain;
  object-position: right bottom;
  pointer-events: none;
}
#idol-shot-overlay.idol-left,
.preview-thumb-idol.idol-left {
  left: 0;
  right: auto;
  object-position: left bottom;
}
#preview {
  min-height: 172px;
}
</style>
