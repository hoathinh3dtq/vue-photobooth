<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
  const sx = withCrop ? cropScaleX : 1
  const sy = withCrop ? cropScaleY : 1
  if (val === 1) el.style.transform = `scale(${-sx}, ${sy})`
  else if (val === 2) el.style.transform = `scale(${sx}, ${-sy})`
  else if (val === 3) el.style.transform = `scale(${-sx}, ${-sy})`
  else el.style.transform = `scale(${sx}, ${sy})`
}

// IDOL-MODE: overlay idol KHÔNG lật theo gương.
// Gương chỉ áp cho hình camera; idol là graphic thiết kế sẵn (mặt/chữ),
// lật theo sẽ bị ngược. Vị trí trái/phải giữ nguyên theo theme để khớp ảnh in.

// Tự đo viền đen 4 góc (trái/phải + trên/dưới) của nguồn HDMI/camera và crop bằng transform.
// USE_AUTO_CROP = false -> không crop.
let cropScaleX = 1
let cropScaleY = 1
const USE_AUTO_CROP = true
let cropRetryTimer: ReturnType<typeof setTimeout> | null = null
let cropMonitorTimer: ReturnType<typeof setInterval> | null = null

function clearCropTimers(): void {
  if (cropRetryTimer) {
    clearTimeout(cropRetryTimer)
    cropRetryTimer = null
  }
  if (cropMonitorTimer) {
    clearInterval(cropMonitorTimer)
    cropMonitorTimer = null
  }
}

function measurePillarbox(video: HTMLVideoElement): { xFrac: number; yFrac: number } {
  const none = { xFrac: 0, yFrac: 0 }
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return none
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return none
  try {
    ctx.drawImage(video, 0, 0, w, h)
  } catch {
    return none
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
  const rowBright = (y: number): number => {
    let sum = 0
    let n = 0
    const step = Math.max(1, Math.floor(w / 40))
    for (let x = 0; x < w; x += step) {
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
  if (center < 8) return none
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
  let top = 0
  for (let y = 0; y < h; y++) {
    if (rowBright(y) > thr) {
      top = y
      break
    }
  }
  let bottom = h - 1
  for (let y = h - 1; y >= 0; y--) {
    if (rowBright(y) > thr) {
      bottom = y
      break
    }
  }
  if (right <= left || bottom <= top) return none
  let xFrac = (right - left + 1) / w
  let yFrac = (bottom - top + 1) / h
  if (xFrac <= 0.55 || xFrac >= 0.98) xFrac = 0
  if (yFrac <= 0.55 || yFrac >= 0.98) yFrac = 0
  return { xFrac, yFrac }
}

function applyVideoCrop(video: HTMLVideoElement): void {
  clearCropTimers()
  if (!USE_AUTO_CROP) {
    video.style.width = '100%'
    video.style.marginLeft = ''
    video.style.transformOrigin = 'center center'
    cropScaleX = 1
    cropScaleY = 1
    applyMirrorTo(video, true)
    return
  }
  video.style.width = '100%'
  video.style.marginLeft = ''
  video.style.transformOrigin = 'center center'
  let attempts = 0
  const tryMeasure = () => {
    cropRetryTimer = null
    // Video chưa có frame thật thì đợi, không tính là fail
    if (!video.videoWidth || video.readyState < 2) {
      if (attempts++ < 40) cropRetryTimer = setTimeout(tryMeasure, 500)
      else console.warn('[camera] crop: video chưa ready sau 20s')
      return
    }
    const { xFrac, yFrac } = measurePillarbox(video)
    if (xFrac > 0 || yFrac > 0) {
      cropScaleX = xFrac > 0 ? 1 / xFrac : 1
      cropScaleY = yFrac > 0 ? 1 / yFrac : 1
      applyMirrorTo(video, true)
      console.log(
        '[camera] crop ok:',
        `${video.videoWidth}x${video.videoHeight}`,
        `xFrac=${xFrac.toFixed(3)} yFrac=${yFrac.toFixed(3)}`,
        `scale=${cropScaleX.toFixed(3)},${cropScaleY.toFixed(3)}`,
      )
      startCropMonitor(video)
    } else if (attempts++ < 40) {
      // Chưa thấy viền (khung tối, chưa đủ sáng, tín hiệu chưa ổn định) -> thử tiếp
      cropRetryTimer = setTimeout(tryMeasure, 500)
    } else {
      // Hết 20s vẫn không đo được: giữ không crop nhưng vẫn theo dõi tiếp
      console.warn('[camera] crop: không đo được viền sau 20s, giữ nguyên và theo dõi tiếp')
      cropScaleX = 1
      cropScaleY = 1
      applyMirrorTo(video, true)
      startCropMonitor(video)
    }
  }
  tryMeasure()
}

function startCropMonitor(video: HTMLVideoElement): void {
  if (cropMonitorTimer) return
  let lastW = video.videoWidth
  let lastH = video.videoHeight
  // Theo dõi định kỳ: tín hiệu HDMI đổi, rút/cắm lại, đổi độ phân giải -> tự cắt lại.
  // KHÔNG đo lại theo nội dung khung hình: người di chuyển làm thay đổi độ sáng
  // viền -> scale nhấp nhô (zoom thở). Chỉ đo lại khi độ phân giải đổi.
  cropMonitorTimer = setInterval(() => {
    if (!video.isConnected || !video.videoWidth || video.readyState < 2) return
    // Đóng băng crop lúc đang chụp/countdown để khung hình đứng yên tuyệt đối
    if (isCapturing.value) return
    if (video.videoWidth === lastW && video.videoHeight === lastH) return
    lastW = video.videoWidth
    lastH = video.videoHeight
    try {
      const { xFrac, yFrac } = measurePillarbox(video)
      const nx = xFrac > 0 ? 1 / xFrac : 1
      const ny = yFrac > 0 ? 1 / yFrac : 1
      if (Math.abs(nx - cropScaleX) > 0.05 || Math.abs(ny - cropScaleY) > 0.05) {
        cropScaleX = nx
        cropScaleY = ny
        applyMirrorTo(video, true)
        console.log(
          '[camera] crop update:',
          `xFrac=${xFrac.toFixed(3)} yFrac=${yFrac.toFixed(3)}`,
          `scale=${nx.toFixed(3)},${ny.toFixed(3)}`,
        )
      }
    } catch {}
  }, 5000)
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
    console.log('[camera] tl stream size:', video.videoWidth, 'x', video.videoHeight)
    applyVideoCrop(video)
    webcamReady.value = video.videoWidth > 0
    cameraError.value = ''
    return
  }

  try {
    console.log('[camera] requesting getUserMedia...')
    const gumPromise = navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 16 / 9 },
      },
    })
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
  clearCropTimers()
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
  // Cắt viền đen cả 4 góc: trái/phải + trên/dưới
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
  if (cw >= w && ch >= h) return src
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

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Cắt ảnh DSLR cho giống preview: trim viền đen 4 góc rồi center-crop theo đúng
// aspect của khung .camera-screen đang hiển thị (WYSIWYG)
async function cropDslrToMatchPreview(image: string): Promise<string> {
  try {
    const img = await loadImg(image)
    const tmp = document.createElement('canvas')
    tmp.width = img.naturalWidth
    tmp.height = img.naturalHeight
    tmp.getContext('2d')?.drawImage(img, 0, 0)
    const trimmed = trimBlackBorders(tmp)
    const screenEl = document.querySelector('.camera-screen') as HTMLElement | null
    let targetAspect = 1043 / 596
    if (screenEl && screenEl.clientWidth > 0 && screenEl.clientHeight > 0) {
      targetAspect = screenEl.clientWidth / screenEl.clientHeight
    }
    const tw = trimmed.width
    const th = trimmed.height
    if (!tw || !th) return image
    const curAspect = tw / th
    let cw = tw
    let ch = th
    let sx = 0
    let sy = 0
    if (Math.abs(curAspect - targetAspect) / targetAspect < 0.01) {
      return trimmed.toDataURL('image/png')
    }
    if (curAspect > targetAspect) {
      ch = th
      cw = Math.round(th * targetAspect)
      sx = Math.round((tw - cw) / 2)
    } else {
      cw = tw
      ch = Math.round(tw / targetAspect)
      sy = Math.round((th - ch) / 2)
    }
    if (cw <= 0 || ch <= 0) return trimmed.toDataURL('image/png')
    console.log('[camera] dslr crop:', `${tw}x${th}`, '->', `${cw}x${ch}`, 'aspect:', targetAspect.toFixed(3))
    const out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    out.getContext('2d')?.drawImage(trimmed, sx, sy, cw, ch, 0, 0, cw, ch)
    return out.toDataURL('image/png')
  } catch {
    return image
  }
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
      // Crop ảnh DSLR cho giống khung preview đang thấy (WYSIWYG)
      image = await cropDslrToMatchPreview(image)
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
    // Áp gương cho mọi nguồn (DSLR lẫn webcam) để live và ảnh lưu luôn khớp nhau
    applyMirrorTo(capturedPreview, false)
    capturedPreview.src = image
    capturedPreview.style.opacity = '1'
  }

  // Flip dữ liệu ảnh theo mirror_camera cho mọi nguồn (trước đây bỏ qua DSLR -> lệch live/ảnh)
  image = await flipImage(image)

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
  void nextTick(() => updateScrollNav())
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

// Nav dải preview chỉ enable khi còn ảnh để lướt tới
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
function updateScrollNav(): void {
  const el = previewRef.value
  if (!el) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  canScrollLeft.value = el.scrollLeft > 4
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}

async function showCountdown(seconds: number): Promise<void> {
  const el = countdownRef.value
  for (let i = seconds; i > 0; i--) {
    if (el) el.innerHTML = `<span class="count-num">${i}</span>`
    await wait(1000)
  }
  if (el) el.innerHTML = '<span class="count-num">0</span>'
  await wait(150)
  if (el) el.innerHTML = ''
}

function goNext(): void {
  stopCamera()
  sessionStore.timeLapseTask = stopTimeLapse()
  void sessionStore.timeLapseTask.then((blob) => {
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
  window.addEventListener('resize', updateScrollNav)
  previewRef.value?.addEventListener('scroll', updateScrollNav, { passive: true })
  void nextTick(() => updateScrollNav())
})

onBeforeUnmount(() => {
  stopCamera()
  window.removeEventListener('resize', updateScrollNav)
  previewRef.value?.removeEventListener('scroll', updateScrollNav)
  document.body.classList.remove('is-capturing')
})
</script>

<template>
  <section class="camera-layout">
    <svg class="cam-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id="camBlur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="38" />
        </filter>
      </defs>
      <path
        d="M1680,900 L1680,540 C1530,560 1445,670 1455,800 C1460,875 1510,900 1565,900 Z"
        fill="#f2a9c6"
      />
      <path
        d="M1680,900 L1680,540 C1530,560 1445,670 1455,800 C1460,875 1510,900 1565,900 Z"
        fill="#f2a9c6"
        filter="url(#camBlur)"
        opacity="0.85"
      />
      <path
        d="M1560,580 C1450,620 1410,730 1440,840"
        fill="none"
        stroke="#ef8fae"
        stroke-width="5"
      />
      <path
        d="M-80,900 L-80,620 C50,640 130,750 120,860 L120,900 Z"
        fill="#f4c0d3"
      />
      <path
        d="M-80,900 L-80,620 C50,640 130,750 120,860 L120,900 Z"
        fill="#f4c0d3"
        filter="url(#camBlur)"
        opacity="0.85"
      />
      <path d="M-40,680 C70,700 120,790 118,870" fill="none" stroke="#ef8fae" stroke-width="5" />
      <path
        d="M-80,0 L-80,280 C50,260 130,150 120,40 L120,0 Z"
        fill="#f4c0d3"
      />
      <path
        d="M-80,0 L-80,280 C50,260 130,150 120,40 L120,0 Z"
        fill="#f4c0d3"
        filter="url(#camBlur)"
        opacity="0.85"
      />
      <path
        d="M1680,0 L1680,360 C1530,340 1445,230 1455,100 C1460,25 1510,0 1565,0 Z"
        fill="#f2a9c6"
      />
      <path
        d="M1680,0 L1680,360 C1530,340 1445,230 1455,100 C1460,25 1510,0 1565,0 Z"
        fill="#f2a9c6"
        filter="url(#camBlur)"
        opacity="0.85"
      />
      <path d="M1560,320 C1450,280 1410,170 1440,60" fill="none" stroke="#ef8fae" stroke-width="5" />
    </svg>
    <header class="cam-head">
      <svg class="cam-head-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
        <circle cx="12" cy="13.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <h1>Sẵn sàng chụp nào!</h1>
      <p>Giữ nụ cười, lưu giữ khoảnh khắc đẹp nhất</p>
      <div class="cam-head-div" aria-hidden="true"><span></span><i>♥</i><span></span></div>
      <svg class="cam-spark cam-sp-l" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="#f4a9c6" />
      </svg>
      <svg class="cam-spark cam-sp-r" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="#f4a9c6" />
      </svg>
      <svg class="cam-burst cam-b1" viewBox="0 0 60 92" aria-hidden="true">
        <path
          d="M24 30s-11-6.8-13.5-13.5C8.9 12.3 10.8 8 15 8c2.8 0 5.1 1.8 6.4 4.3 1.3-2.5 3.6-4.3 6.4-4.3 4.2 0 6 4.3 4.4 8.5C29.7 23.2 24 30 24 30z"
          fill="none"
          stroke="#f2719b"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path d="M22 54l20 7M20 68l20 8" stroke="#f2719b" stroke-width="3.5" stroke-linecap="round" />
      </svg>
      <svg class="cam-burst cam-b2" viewBox="0 0 60 92" aria-hidden="true">
        <path
          d="M24 30s-11-6.8-13.5-13.5C8.9 12.3 10.8 8 15 8c2.8 0 5.1 1.8 6.4 4.3 1.3-2.5 3.6-4.3 6.4-4.3 4.2 0 6 4.3 4.4 8.5C29.7 23.2 24 30 24 30z"
          fill="none"
          stroke="#f2719b"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <path d="M22 54l20 7M20 68l20 8" stroke="#f2719b" stroke-width="3.5" stroke-linecap="round" />
      </svg>
    </header>
    <div class="camera-stage">
      <div class="camera-screen">
        <video id="video" ref="videoRef" autoplay playsinline muted></video>
        <span class="vf-corner vf-tl" aria-hidden="true"></span>
        <span class="vf-corner vf-tr" aria-hidden="true"></span>
        <span class="vf-corner vf-bl" aria-hidden="true"></span>
        <span class="vf-corner vf-br" aria-hidden="true"></span>
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
        <button class="preview-nav" id="preview-left" type="button" aria-label="Xem anh truoc" :disabled="!canScrollLeft" @click="scrollPreview(-1)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
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
        <button class="preview-nav" id="preview-right" type="button" aria-label="Xem anh tiep" :disabled="!canScrollRight" @click="scrollPreview(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="btn-action">
      <button class="btn-page-cam" id="start-short" type="button" :disabled="startDisabled" @click="startAutoCapture">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z" />
            <circle cx="12" cy="13.5" r="3.6" />
          </svg>
        </span>
        <p class="text-btn-start">Chụp ảnh</p>
      </button>

      <button class="btn-page-cam" id="re-short" type="button" :disabled="retakeDisabled" @click="retakeImage">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
            <circle cx="9" cy="10" r="1.4" fill="currentColor" stroke="none" />
            <path d="M3.5 15.5l4.5-4 3.5 3 3-2.5 5.5 4.5" />
          </svg>
        </span>
        <p class="text-btn-start">Chụp lại</p>
      </button>

      <button class="btn-page-cam" id="choose-theme" type="button" :disabled="themeDisabled" @click="goNext">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3.5C7.5 3.5 4 6.9 4 11.2c0 3.1 1.8 5.4 4.2 6.6.4-1.2 1.5-2 2.8-2h1.4c2.9 0 5.6-2.1 5.6-4.9 0-4-2.9-7.4-6-7.4z" />
            <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="13.5" cy="9" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </span>
          <p class="text-btn-start">{{ isIdolMode ? 'Ghép theme' : 'Chọn theme' }}</p>
      </button>

      <button class="btn-page-cam" id="return-select-type" type="button" :disabled="returnDisabled" @click="goBack">
        <span class="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 5l-5 7 5 7" />
            <path d="M4.5 12h11" />
          </svg>
        </span>
        <p class="text-btn-start">Quay lại</p>
      </button>
    </div>

    <svg class="cam-heart cam-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="cam-heart cam-h2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>
    <svg class="cam-flower cam-f1" viewBox="0 0 60 60" aria-hidden="true">
      <g fill="#f9b1cd">
        <ellipse cx="30" cy="15" rx="8" ry="13" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(60 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(120 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(180 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(240 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(300 30 30)" />
      </g>
      <circle cx="30" cy="30" r="7" fill="#ef6aa0" />
    </svg>
    <svg class="cam-flower cam-f2" viewBox="0 0 60 60" aria-hidden="true">
      <g fill="#f9b1cd">
        <ellipse cx="30" cy="15" rx="8" ry="13" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(60 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(120 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(180 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(240 30 30)" />
        <ellipse cx="30" cy="15" rx="8" ry="13" transform="rotate(300 30 30)" />
      </g>
      <circle cx="30" cy="30" r="7" fill="#ef6aa0" />
    </svg>
    <svg class="cam-heart cam-h3" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="cam-heart cam-h4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>
    <div class="cam-sign" aria-hidden="true">for your smile ♡</div>
  </section>
</template>

<style scoped>
.camera-error-overlay {
  position: absolute;
  inset: auto 0 12%;
  z-index: 30;
  margin: 0 auto;
  padding: 1vh 1.6vw;
  width: max-content;
  max-width: 80%;
  text-align: center;
  color: #d14e7d;
  font-size: 0.95vw;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #f4c6d8;
  border-radius: 999px;
  box-shadow: 0 0.5vh 1.5vh rgba(239, 91, 141, 0.25);
}
.cam-bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}
.cam-head {
  position: absolute;
  top: 1.2vh;
  left: 14vw;
  width: 63vw;
  z-index: 5;
  text-align: center;
  pointer-events: none;
}
.cam-head-icon {
  width: 2.6vmin;
  color: #e14e7f;
}
.cam-head h1 {
  margin: 0.3vh 0 0;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 3.2vmin;
  font-weight: 800;
  color: #5b3a44;
}
.cam-head p {
  margin: 0.2vh 0 0;
  font-family: 'Nunito', 'Segoe UI', sans-serif;
  font-size: 1.8vmin;
  font-weight: 600;
  color: #9a8f94;
}
.cam-head-div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1vw;
  margin-top: 0.6vh;
}
.cam-head-div span {
  width: 8vw;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, #f4a9c6);
}
.cam-head-div span:last-child {
  background: linear-gradient(90deg, #f4a9c6, transparent);
}
.cam-head-div i {
  font-style: normal;
  font-size: 1.8vmin;
  color: #f2719b;
}
.vf-corner {
  position: absolute;
  width: 3vmin;
  height: 3vmin;
  z-index: 6;
  pointer-events: none;
  border: 0 solid #fff;
  opacity: 0.95;
}
.vf-tl {
  top: 2vmin;
  left: 2vmin;
  border-top-width: 5px;
  border-left-width: 5px;
  border-top-left-radius: 12px;
}
.vf-tr {
  top: 2vmin;
  right: 2vmin;
  border-top-width: 5px;
  border-right-width: 5px;
  border-top-right-radius: 12px;
}
.vf-bl {
  bottom: 2vmin;
  left: 2vmin;
  border-bottom-width: 5px;
  border-left-width: 5px;
  border-bottom-left-radius: 12px;
}
.vf-br {
  bottom: 2vmin;
  right: 2vmin;
  border-bottom-width: 5px;
  border-right-width: 5px;
  border-bottom-right-radius: 12px;
}
.cam-spark {
  position: absolute;
  top: 2.2vh;
  width: 2.4vmin;
}
.cam-sp-l {
  left: 31%;
}
.cam-sp-r {
  right: 31%;
  width: 1.8vmin;
  top: 1.4vh;
}
.cam-burst {
  position: absolute;
  top: 0.2vh;
  width: 5.2vmin;
}
.cam-b1 {
  left: 15%;
}
.cam-b2 {
  right: 15%;
  transform: scaleX(-1);
}
.cam-heart {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}
.cam-flower {
  position: absolute;
  z-index: 1;
  width: 4.5vmin;
  pointer-events: none;
}
.cam-f1 {
  left: 5%;
  bottom: 9%;
}
.cam-f2 {
  right: 3.5%;
  top: 22%;
  width: 3.6vmin;
}
.cam-h3 {
  width: 2.4vmin;
  left: 10%;
  top: 62%;
}
.cam-h4 {
  width: 2vmin;
  left: 30%;
  bottom: 3%;
}
.cam-h1 {
  width: 2.6vmin;
  left: 11%;
  top: 44%;
}
.cam-h2 {
  width: 2vmin;
  right: 5%;
  top: 38%;
}
.cam-sign {
  position: absolute;
  left: 2.6vw;
  top: 36%;
  z-index: 1;
  transform: rotate(-8deg);
  font-family: 'Segoe Script', 'Segoe Print', cursive;
  font-size: 2.6vmin;
  color: #ef8fae;
}
.preview-nav {
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-nav:disabled {
  opacity: 0.35;
  filter: grayscale(0.6);
  cursor: not-allowed;
}
.preview-nav svg {
  width: 44%;
  height: 44%;
}
.btn-page-cam .icon svg {
  width: 4.6vh;
  height: 4.6vh;
}
#idol-shot-overlay {
  position: absolute;
  right: 0;
  bottom: 0;
  height: 90%;
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
  box-sizing: border-box;
}
.preview-thumb-idol {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 90%;
  object-fit: contain;
  object-position: right bottom;
  pointer-events: none;
}
.preview-thumb .preview-img.active {
  border: 3px solid #e14e7f;
  box-shadow:
    0 0 0 2px #fff,
    0 0 18px rgba(239, 91, 141, 0.6);
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
