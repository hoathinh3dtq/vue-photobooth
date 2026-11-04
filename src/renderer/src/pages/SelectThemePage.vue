<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FlowerLoader from '../components/FlowerLoader.vue'
import { useConfigStore } from '../stores/config'
import { useFlowStore } from '../stores/flow'
import { useSelectionStore } from '../stores/selection'
import { useSessionStore, type PendingUpload } from '../stores/session'
import { STORAGE_URL } from '../lib/api/client'
import { uploadImg } from '../lib/api/print'
import { showModal, showModalClose, hideModal } from '../lib/modal'
import { stopTimeLapse } from '../lib/timelapse'

interface Theme {
  buttonId: string
  src: string
  ratio: string
  slots: Slot[]
  processedSrc: string
  totalImage: number
}

interface Slot {
  x: number
  y: number
  w: number
  h: number
}

interface FilledPhoto {
  capturedIndex: number
  image: string
  retakeCount: number
  x: number
  y: number
  scale: number
  _slotW?: number
  _slotH?: number
  filteredImage?: string
}

const flowStore = useFlowStore()
const configStore = useConfigStore()
const selectionStore = useSelectionStore()
const sessionStore = useSessionStore()

const themes: Record<string, Theme> = {}
const filledPhotos: (FilledPhoto | null)[] = []
const slotCache: Record<string, { ratio: string; slots: Slot[]; processedSrc: string }> = {}

const selectedTheme = ref('')
const loading = ref(true)
const error = ref('')

let themePage = 0
let hasMore = true
let themeLoading = false

const TONE_FILTERS: Record<string, string> = {
  none: 'none',
  vintage: 'sepia(0.34) contrast(1.08) saturate(0.92) brightness(1.03)',
  lomo: 'contrast(1.24) saturate(1.42) brightness(0.96)',
  clarity: 'contrast(1.22) saturate(1.12) brightness(1.08)',
  sincity: 'grayscale(1) contrast(1.34) brightness(1.05)',
  sunrise: 'sepia(0.34) saturate(1.38) hue-rotate(338deg) brightness(1.08)',
  crossprocess: 'contrast(1.18) saturate(1.48) hue-rotate(36deg) brightness(1.02)',
  orangepeel: 'sepia(0.38) saturate(1.62) hue-rotate(350deg) contrast(1.08)',
  love: 'sepia(0.18) saturate(1.52) hue-rotate(310deg) brightness(1.05)',
  grungy: 'sepia(0.38) contrast(1.32) saturate(0.82) brightness(0.9)',
  jarques: 'contrast(1.28) saturate(1.3) sepia(0.16) hue-rotate(10deg)',
  pinhole: 'grayscale(0.48) contrast(1.42) brightness(0.86) saturate(0.88)',
  oldboot: 'sepia(0.52) contrast(1.18) saturate(0.82) brightness(0.96)',
  glowingsun: 'sepia(0.28) saturate(1.52) hue-rotate(342deg) brightness(1.16)',
  hazydays: 'sepia(0.18) saturate(0.78) contrast(0.92) brightness(1.16)',
  hermajesty: 'sepia(0.22) saturate(1.18) hue-rotate(296deg) contrast(1.06) brightness(1.04)',
  nostalgia: 'sepia(0.46) saturate(0.9) contrast(0.96) brightness(1.06)',
  hemingway: 'grayscale(0.78) contrast(1.24) brightness(1.02) sepia(0.12)',
}

const samplePhotoUrl = computed(() => selectionStore.capturedPhotos[0]?.image || '')

// IDOL-MODE: theme đã chốt từ màn idol, dựng thẳng không list lại
const isIdolPreselected = computed(
  () => selectionStore.typeIdol === 1 && !!selectionStore.selectedTheme && !!selectionStore.idolFrameUrl,
)

// Đồng bộ tone lên body như v1 (CSS biến --photo-tone-filter đọc theo body[data-photo-tone])
watch(
  () => selectionStore.selectedTone,
  (tone) => {
    document.body.dataset.photoTone = tone || 'none'
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  delete document.body.dataset.photoTone
})

function themeSrc(item: { thumbnail_url?: string }): string {
  let url = item.thumbnail_url || ''
  if (url && !url.startsWith('http')) url = `${STORAGE_URL}/${url.replace(/^\//, '')}`
  return url
}

async function loadMoreThemes(): Promise<boolean> {
  if (themeLoading || !hasMore) return false
  themeLoading = true
  themePage++
  let items: Array<Record<string, unknown>> = []
  try {
    const res = await flowStore.flow.selectTheme.listThemes(themePage)
    if (Array.isArray(res)) {
      items = res
      hasMore = false
    } else {
      const p = (res as { pagination?: unknown }).pagination || res
      const pag = p as { data?: unknown[]; has_more?: boolean; hasMore?: boolean; current_page?: number; last_page?: number }
      items = (pag?.data || (res as { data?: unknown[] }).data || (res as { themes?: unknown[] }).themes || []) as Array<Record<string, unknown>>
      hasMore = pag?.has_more ?? pag?.hasMore ?? false
    }
  } catch {
    items = []
    hasMore = false
  }
  themeLoading = false

  if (items.length === 0) {
    hasMore = false
    return false
  }

  const entries: Array<[string, Theme]> = []
  items.forEach((item) => {
    if (!item) return
    const id = `theme-${item.id}`
    themes[id] = {
      buttonId: id,
      src: themeSrc(item as { thumbnail_url?: string }),
      ratio: '',
      slots: [],
      processedSrc: '',
      totalImage: Number(((item as { detail?: { total_image?: number } }).detail?.total_image) || 0),
    }
    entries.push([id, themes[id]])
  })
  renderThemeChoices()
  return entries.length > 0
}

function renderThemeChoices(): void {
  const list = document.getElementById('theme-choice-list')
  if (!list) return
  Object.entries(themes).forEach(([themeId, theme]) => {
    if (document.getElementById(theme.buttonId)) return
    const btn = document.createElement('button')
    btn.className = 'theme-choice'
    btn.id = theme.buttonId
    btn.type = 'button'

    const img = document.createElement('img')
    img.src = theme.src
    img.alt = `Theme ${themeId}`

    btn.appendChild(img)
    btn.onclick = () => selectTheme(themeId)
    list.appendChild(btn)
  })
  const count = Object.keys(themes).length
  const nl = document.getElementById('theme-nav-left')
  const nr = document.getElementById('theme-nav-right')
  if (nl) nl.style.display = count >= 3 ? '' : 'none'
  if (nr) nr.style.display = count >= 3 ? '' : 'none'
}

function scrollThemeChoices(direction: number): void {
  const list = document.getElementById('theme-choice-list')
  if (!list) return
  list.scrollBy({ left: direction * list.clientWidth * 0.7, behavior: 'smooth' })
}

function selectTheme(themeId: string): void {
  // Spam click trùng theme: bỏ qua hẳn, khỏi dựng lại preview mỗi click
  if (selectedTheme.value === themeId) return
  selectedTheme.value = themeId
  selectionStore.selectedTheme = themeId
  filledPhotos.length = 0
  setSelectedTheme(themes[themeId].buttonId)
  renderThemePreview()
  renderCapturedPhotos()
}

function setSelectedTheme(id: string): void {
  document.querySelectorAll('.theme-choice').forEach((choice) => {
    choice.classList.toggle('is-selected', choice.id === id)
  })
}

function mergeOverlappingSlots(slots: Slot[], targetCount: number): Slot[] {
  const result = [...slots]
  while (result.length > targetCount) {
    let bestA = -1
    let bestB = -1
    let bestOverlap = 0
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]
        const b = result[j]
        const ix = Math.max(a.x, b.x)
        const iy = Math.max(a.y, b.y)
        const iw = Math.min(a.x + a.w, b.x + b.w) - ix
        const ih = Math.min(a.y + a.h, b.y + b.h) - iy
        if (iw <= 0 || ih <= 0) continue
        const overlap = (iw * ih) / Math.min(a.w * a.h, b.w * b.h)
        if (overlap > bestOverlap) {
          bestOverlap = overlap
          bestA = i
          bestB = j
        }
      }
    }
    if (bestA === -1 || bestOverlap < 0.3) break
    const keeper = result[bestA]
    const removed = result[bestB]
    const ax = Math.min(keeper.x, removed.x)
    const ay = Math.min(keeper.y, removed.y)
    keeper.x = ax
    keeper.y = ay
    keeper.w = Math.max(keeper.x + keeper.w, removed.x + removed.w) - ax
    keeper.h = Math.max(keeper.y + keeper.h, removed.y + removed.h) - ay
    result.splice(bestB, 1)
  }
  return result
}

function detectSlots(src: string): Promise<{ ratio: string; slots: Slot[]; processedSrc: string }> {
  if (slotCache[src]) return Promise.resolve(slotCache[src])

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => {
      slotCache[src] = { ratio: '1 / 1', slots: [], processedSrc: src }
      resolve(slotCache[src])
    }
    img.onload = () => {
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      // Giới hạn mặt ảnh phân tích (~2.6M px): flood fill dò khe tốn ~50-100 bytes/px,
      // chặn cap này để spam click hàng loạt theme không blow RAM/blend crash.
      const MAX_ANALYSIS_PIXELS = 2600000
      const down = iw * ih > MAX_ANALYSIS_PIXELS ? Math.sqrt(MAX_ANALYSIS_PIXELS / (iw * ih)) : 1
      const aw = Math.max(1, Math.round(iw * down))
      const ah = Math.max(1, Math.round(ih * down))
      const canvas = document.createElement('canvas')
      canvas.width = aw
      canvas.height = ah
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        slotCache[src] = { ratio: '1 / 1', slots: [], processedSrc: src }
        resolve(slotCache[src])
        return
      }
      ctx.drawImage(img, 0, 0, aw, ah)
      let imageData: ImageData
      try {
        imageData = ctx.getImageData(0, 0, aw, ah)
      } catch {
        // Canvas bị taint (CORS): cache kết quả rỗng, tránh dò lại vô hạn gây crash renderer
        slotCache[src] = { ratio: `${iw} / ${ih}`, slots: [], processedSrc: img.src }
        resolve(slotCache[src])
        return
      }
      const pixels = imageData.data

      function floodFill(transparentMode: boolean) {
        const visited = new Uint8Array(aw * ah)
        const regions: Array<{ minX: number; maxX: number; minY: number; maxY: number; w: number; h: number; pixels: number[] }> = []
        for (let y = 0; y < ah; y++) {
          for (let x = 0; x < aw; x++) {
            const idx = y * aw + x
            if (visited[idx]) continue
            const pi = idx * 4
            const a = pixels[pi + 3]
            const r = pixels[pi]
            const g = pixels[pi + 1]
            const b = pixels[pi + 2]
            const isSlot = transparentMode ? a < 30 : a > 240 && r < 34 && g < 34 && b < 34
            if (!isSlot) continue

            const regionPixels: number[] = []
            const stack = [x, y]
            let minX = x
            let maxX = x
            let minY = y
            let maxY = y

            while (stack.length) {
              const cy = stack.pop() as number
              const cx = stack.pop() as number
              const ci = cy * aw + cx
              if (visited[ci]) continue
              visited[ci] = 1
              const cpi = ci * 4
              const ca = pixels[cpi + 3]
              const cr = pixels[cpi]
              const cg = pixels[cpi + 1]
              const cb = pixels[cpi + 2]
              const matches = transparentMode ? ca < 30 : ca > 240 && cr < 34 && cg < 34 && cb < 34
              if (!matches) continue
              regionPixels.push(cx, cy)
              if (cx < minX) minX = cx
              if (cx > maxX) maxX = cx
              if (cy < minY) minY = cy
              if (cy > maxY) maxY = cy
              if (cx > 0) stack.push(cx - 1, cy)
              if (cx < aw - 1) stack.push(cx + 1, cy)
              if (cy > 0) stack.push(cx, cy - 1)
              if (cy < ah - 1) stack.push(cx, cy + 1)
            }

            if (regionPixels.length > 100) {
              regions.push({
                minX,
                maxX,
                minY,
                maxY,
                w: maxX - minX + 1,
                h: maxY - minY + 1,
                pixels: regionPixels,
              })
            }
          }
        }
        return regions
      }

      function extractSlots(regions: ReturnType<typeof floodFill>, isTransparentMode: boolean) {
        const ti: number[] = []
        const s = regions
          .filter((r) => {
            const keep = r.w > 20 && r.h > 20 && (r.w > aw * 0.05 || r.h > ah * 0.05) && !(r.w > aw * 0.8 && r.h > ah * 0.8)
            if (keep && !isTransparentMode) {
              for (let i = 0; i < r.pixels.length; i += 2) {
                ti.push(r.pixels[i + 1] * aw + r.pixels[i])
              }
            }
            return keep
          })
          .sort((a, b) => a.minY - b.minY || a.minX - b.minX)
          .map((r) => ({
            x: (r.minX / aw) * 100,
            y: (r.minY / ah) * 100,
            w: (r.w / aw) * 100,
            h: (r.h / ah) * 100,
          }))
        return { slots: s, indices: ti }
      }

      const hasTransparent = (() => {
        for (let i = 0; i < aw * ah; i++) {
          if (pixels[i * 4 + 3] < 30) return true
        }
        return false
      })()

      const transRegions = floodFill(hasTransparent)
      let result = extractSlots(transRegions, hasTransparent)
      let usedTransparent = hasTransparent
      if (result.slots.length === 0) {
        result = extractSlots(floodFill(!hasTransparent), !hasTransparent)
        usedTransparent = !hasTransparent
      }

      const { slots, indices: transparentIndices } = result
      const ratio = `${iw} / ${ih}`

      let processedSrc = src
      if (!usedTransparent && transparentIndices.length > 0) {
        // Carve alpha trên cùng canvas phân tích (đồng bộ toạ độ, đã giới hạn kích thước)
        const pCanvas = document.createElement('canvas')
        pCanvas.width = aw
        pCanvas.height = ah
        const pCtx = pCanvas.getContext('2d')
        if (pCtx) {
          pCtx.drawImage(img, 0, 0, aw, ah)
          const pData = pCtx.getImageData(0, 0, aw, ah)
          const pp = pData.data
          for (const idx of transparentIndices) {
            pp[idx * 4 + 3] = 0
          }
          pCtx.putImageData(pData, 0, 0)
          processedSrc = pCanvas.toDataURL()
        }
      }

      slotCache[src] = { ratio, slots, processedSrc }
      resolve({ ratio, slots, processedSrc })
    }
    img.src = src
  })
}

function renderThemePreview(): void {
  const stage = document.getElementById('theme-preview-stage')
  if (!stage) return

  if (!selectedTheme.value) {
    stage.innerHTML = ''
    stage.className = 'theme-preview-stage is-empty'
    return
  }

  const theme = themes[selectedTheme.value]
  if (!theme) return

  if (!theme.slots || theme.slots.length === 0) {
    // Detect xong (ratio != '') mà vẫn 0 khe → render khung phẳng, KHÔNG dò lại:
    // vòng "Đang tải... -> detect -> rỗng -> Đang tải..." tạo microtask vô tận
    // khiến app treo/crash khi spam chọn theme (ảnh taint CORS hoặc không có khe).
    if (theme.ratio) {
      stage.innerHTML = ''
      stage.className = 'theme-preview-stage'
      stage.style.aspectRatio = theme.ratio
      const frame = document.createElement('img')
      frame.className = 'theme-frame-image'
      frame.src = theme.processedSrc || theme.src
      frame.alt = `Theme ${selectedTheme.value}`
      stage.appendChild(frame)
      return
    }
    stage.innerHTML = '<p class="theme-preview-loading">Đang tải...</p>'
    stage.className = 'theme-preview-stage is-empty'
    void detectSlots(theme.src).then((result) => {
      theme.ratio = result.ratio
      theme.slots = result.slots
      theme.processedSrc = result.processedSrc
      if (theme.totalImage > 0 && theme.slots.length > theme.totalImage) {
        theme.slots = mergeOverlappingSlots(theme.slots, theme.totalImage)
      }
      renderThemePreview()
      renderCapturedPhotos()
    })
    return
  }

  stage.innerHTML = ''
  stage.className = 'theme-preview-stage'
  stage.style.aspectRatio = theme.ratio

  const frame = document.createElement('img')
  frame.className = 'theme-frame-image'
  frame.src = theme.processedSrc || theme.src
  frame.alt = `Theme ${selectedTheme.value}`
  stage.appendChild(frame)

  for (let index = 0; index < theme.slots.length; index++) {
    const slot = theme.slots[index]
    const cell = document.createElement('div')
    cell.className = 'theme-photo-slot'
    cell.style.left = `${slot.x}%`
    cell.style.top = `${slot.y}%`
    cell.style.width = `${slot.w}%`
    cell.style.height = `${slot.h}%`

    if (filledPhotos[index]) {
      const photo = filledPhotos[index] as FilledPhoto
      const photoButton = document.createElement('button')
      photoButton.className = 'theme-floating-photo'
      photoButton.type = 'button'
      photoButton.style.left = `${slot.x}%`
      photoButton.style.top = `${slot.y}%`
      photoButton.style.width = `${slot.w}%`
      photoButton.style.height = `${slot.h}%`
      photoButton.style.zIndex = `${5 + index}`

      const img = document.createElement('img')
      img.alt = `Anh trong theme ${index + 1}`
      img.onload = () => applyPhotoStyle(photoButton, index)
      img.src = getFilteredImage(photo)
      photoButton.appendChild(img)
      bindPhotoAdjustments(photoButton, index)
      stage.appendChild(photoButton)
    }

    if (isIdolPreselected.value && filledPhotos[index]) {
      const icons = selectionStore.idolIcons
      const capIdx = (filledPhotos[index] as FilledPhoto).capturedIndex ?? index
      const icon = icons[capIdx]
      if (icon && icon.url) {
        const idolImg = document.createElement('img')
        idolImg.src = icon.url
        idolImg.alt = ''
        idolImg.style.position = 'absolute'
        idolImg.style.left = `${slot.x}%`
        idolImg.style.top = `${slot.y + slot.h * 0.1}%`
        idolImg.style.width = `${slot.w}%`
        idolImg.style.height = `${slot.h * 0.9}%`
        idolImg.style.objectFit = 'contain'
        idolImg.style.objectPosition = icon.side === 'right' ? 'right bottom' : 'left bottom'
        idolImg.style.pointerEvents = 'none'
        idolImg.style.zIndex = `${50 + index}`
        stage.appendChild(idolImg)
      }
    }

    stage.appendChild(cell)
  }
}

function getFilteredImage(photo: FilledPhoto | { image: string; filteredImage?: string }): string {
  if (!photo) return ''
  return photo.filteredImage || photo.image
}

function addPhotoToTheme(photo: { image: string; retakeCount?: number }, capturedIndex: number): void {
  if (!selectedTheme.value) return
  const theme = themes[selectedTheme.value]
  const nextEmptyIndex = filledPhotos.findIndex((item) => !item)
  const fillIndex = nextEmptyIndex === -1 ? filledPhotos.length : nextEmptyIndex
  if (fillIndex >= theme.slots.length) return

  filledPhotos[fillIndex] = {
    capturedIndex,
    image: photo.image,
    retakeCount: photo.retakeCount || 0,
    x: 0,
    y: 0,
    scale: 1,
  }
  renderThemePreview()
  renderCapturedPhotos()
}

function togglePhotoInThemeByIndex(capturedIndex: number): void {
  const usedIndex = filledPhotos.findIndex((item) => item && item.capturedIndex === capturedIndex)
  if (usedIndex !== -1) {
    filledPhotos[usedIndex] = null
  } else {
    const photo = selectionStore.capturedPhotos[capturedIndex]
    if (photo) addPhotoToTheme(photo, capturedIndex)
  }
  renderThemePreview()
  renderCapturedPhotos()
}

function applyPhotoStyle(photoButton: HTMLElement, index: number): void {
  const photo = filledPhotos[index]
  if (!photo) return
  const img = photoButton.querySelector('img')
  if (!img || !img.naturalWidth || !img.naturalHeight) return
  const slotW = photoButton.offsetWidth
  const slotH = photoButton.offsetHeight
  const imgW = img.naturalWidth
  const imgH = img.naturalHeight
  if (!slotW || !slotH) return
  photo._slotW = slotW
  photo._slotH = slotH

  const baseScale = Math.max(slotW / imgW, slotH / imgH)
  const uScale = photo.scale || 1
  const s = baseScale * uScale
  const tx = (slotW - imgW * s) / 2 + (photo.x || 0)
  const ty = (slotH - imgH * s) / 2 + (photo.y || 0)
  img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
}

let dragState: { index: number; pointerId: number; startX: number; startY: number; photoX: number; photoY: number } | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function bindPhotoAdjustments(photoButton: HTMLElement, index: number): void {
  const getImg = () => photoButton.querySelector('img')
  const activeTouchIds = new Set<number>()
  let pinchStart: { dist: number; scale: number; tx: number; ty: number; midX: number; midY: number } | null = null
  const photoPointers = new Map<number, { x: number; y: number }>()

  function pinchFocal(
    rect: DOMRect,
    dist0: number,
    scale0: number,
    tx0: number,
    ty0: number,
    midXscreen: number,
    midYscreen: number,
    newUscale: number,
  ): boolean {
    const photo = filledPhotos[index] as FilledPhoto
    const slotW = photoButton.offsetWidth
    const slotH = photoButton.offsetHeight
    const img = getImg()
    if (!img || !img.naturalWidth || !img.naturalHeight) return false
    const imgW = img.naturalWidth
    const imgH = img.naturalHeight
    if (!slotW || !slotH) return false
    const baseScale = Math.max(slotW / imgW, slotH / imgH)
    const midX = midXscreen - rect.left
    const midY = midYscreen - rect.top
    const s0 = baseScale * scale0
    const focalX = (midX - tx0) / s0
    const focalY = (midY - ty0) / s0
    const nu = clamp(newUscale, 0.45, 3)
    const s1 = baseScale * nu
    const tx1 = midX - focalX * s1
    const ty1 = midY - focalY * s1
    photo.scale = nu
    photo.x = tx1 - (slotW - imgW * s1) / 2
    photo.y = ty1 - (slotH - imgH * s1) / 2
    photo._slotW = slotW
    photo._slotH = slotH
    img.style.transform = `translate(${tx1}px, ${ty1}px) scale(${s1})`
    return true
  }

  function startPinch(): boolean {
    const photo = filledPhotos[index] as FilledPhoto
    const img = getImg()
    if (!img || !img.naturalWidth || !img.naturalHeight) return false
    const slotW = photoButton.offsetWidth
    const slotH = photoButton.offsetHeight
    const imgW = img.naturalWidth
    const imgH = img.naturalHeight
    if (!slotW || !slotH) return false
    const baseScale = Math.max(slotW / imgW, slotH / imgH)
    const uScale = photo.scale || 1
    const s = baseScale * uScale
    const tx = (slotW - imgW * s) / 2 + (photo.x || 0)
    const ty = (slotH - imgH * s) / 2 + (photo.y || 0)

    const pointers = [...activeTouchIds]
      .map((id) => ({ id, ...photoPointers.get(id) }))
      .filter((p) => p.x !== undefined && p.y !== undefined) as Array<{ id: number; x: number; y: number }>
    if (pointers.length < 2) return false
    const dx = pointers[0].x - pointers[1].x
    const dy = pointers[0].y - pointers[1].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const midX = (pointers[0].x + pointers[1].x) / 2
    const midY = (pointers[0].y + pointers[1].y) / 2

    pinchStart = { dist, scale: uScale, tx, ty, midX, midY }
    return true
  }

  function finishDrag(cell: HTMLElement, pointerId: number): void {
    if (!dragState || dragState.pointerId !== pointerId) return
    try {
      cell.releasePointerCapture(pointerId)
    } catch {}
    cell.classList.remove('is-dragging')
    dragState = null
  }

  photoButton.onpointerdown = (event) => {
    event.preventDefault()
    activeTouchIds.add(event.pointerId)
    photoPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (activeTouchIds.size === 1) {
      photoButton.setPointerCapture(event.pointerId)
      const photo = filledPhotos[index] as FilledPhoto
      dragState = {
        index,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        photoX: photo.x || 0,
        photoY: photo.y || 0,
      }
      photoButton.classList.add('is-dragging')
    } else if (activeTouchIds.size === 2) {
      if (dragState) {
        photoButton.classList.remove('is-dragging')
        dragState = null
      }
      startPinch()
    }
  }

  photoButton.onpointermove = (event) => {
    if (!activeTouchIds.has(event.pointerId)) return
    photoPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pinchStart && activeTouchIds.size === 2) {
      const rect = photoButton.getBoundingClientRect()
      const pointers = [...activeTouchIds]
        .map((id) => ({ id, ...photoPointers.get(id) }))
        .filter((p) => p.x !== undefined && p.y !== undefined) as Array<{ id: number; x: number; y: number }>
      if (pointers.length < 2) return
      const dx = pointers[0].x - pointers[1].x
      const dy = pointers[0].y - pointers[1].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / pinchStart.dist
      const curMidX = (pointers[0].x + pointers[1].x) / 2
      const curMidY = (pointers[0].y + pointers[1].y) / 2
      pinchFocal(rect, pinchStart.dist, pinchStart.scale, pinchStart.tx, pinchStart.ty, curMidX, curMidY, pinchStart.scale * ratio)
    } else if (dragState && dragState.pointerId === event.pointerId) {
      const photo = filledPhotos[index] as FilledPhoto
      photo.x = dragState.photoX + event.clientX - dragState.startX
      photo.y = dragState.photoY + event.clientY - dragState.startY
      if (!photo._slotW) {
        photo._slotW = photoButton.offsetWidth
        photo._slotH = photoButton.offsetHeight
      }
      applyPhotoStyle(photoButton, index)
    }
  }

  photoButton.onpointerup = (event) => {
    activeTouchIds.delete(event.pointerId)
    photoPointers.delete(event.pointerId)

    if (activeTouchIds.size === 0) {
      pinchStart = null
      if (dragState) finishDrag(photoButton, event.pointerId)
    } else if (activeTouchIds.size === 1 && pinchStart) {
      pinchStart = null
      const remainingId = [...activeTouchIds][0]
      const pos = photoPointers.get(remainingId)
      if (pos) {
        try {
          photoButton.setPointerCapture(remainingId)
        } catch {}
        const photo = filledPhotos[index] as FilledPhoto
        dragState = {
          index,
          pointerId: remainingId,
          startX: pos.x,
          startY: pos.y,
          photoX: photo.x || 0,
          photoY: photo.y || 0,
        }
        photoButton.classList.add('is-dragging')
      }
    } else if (activeTouchIds.size < 2) {
      pinchStart = null
    }
  }

  photoButton.onpointercancel = (event) => {
    activeTouchIds.delete(event.pointerId)
    photoPointers.delete(event.pointerId)
    pinchStart = null
    finishDrag(photoButton, event.pointerId)
  }

  photoButton.onwheel = (event) => {
    event.preventDefault()
    const photo = filledPhotos[index] as FilledPhoto
    const slotW = photoButton.offsetWidth
    const slotH = photoButton.offsetHeight
    const img = getImg()
    if (!img || !img.naturalWidth || !img.naturalHeight) return
    const imgW = img.naturalWidth
    const imgH = img.naturalHeight
    if (!slotW || !slotH) return
    const baseScale = Math.max(slotW / imgW, slotH / imgH)
    const uScale = photo.scale || 1
    const uTx = photo.x || 0
    const uTy = photo.y || 0
    const s0 = baseScale * uScale
    const tx0 = (slotW - imgW * s0) / 2 + uTx
    const ty0 = (slotH - imgH * s0) / 2 + uTy
    const cx = slotW / 2
    const cy = slotH / 2
    const focalX = (cx - tx0) / s0
    const focalY = (cy - ty0) / s0
    const newUscale = clamp(uScale + (event.deltaY < 0 ? 0.08 : -0.08), 0.45, 3)
    const s1 = baseScale * newUscale
    const tx1 = cx - focalX * s1
    const ty1 = cy - focalY * s1
    photo.scale = newUscale
    photo.x = tx1 - (slotW - imgW * s1) / 2
    photo.y = ty1 - (slotH - imgH * s1) / 2
    photo._slotW = slotW
    photo._slotH = slotH
    img.style.transform = `translate(${tx1}px, ${ty1}px) scale(${s1})`
  }

  photoButton.ondblclick = () => {
    const photo = filledPhotos[index] as FilledPhoto
    photo.x = 0
    photo.y = 0
    photo.scale = 1
    photo._slotW = photoButton.offsetWidth
    photo._slotH = photoButton.offsetHeight
    applyPhotoStyle(photoButton, index)
  }
}

function renderCapturedPhotos(): void {
  const list = document.getElementById('theme-captured-list')
  if (!list) return
  const photos = selectionStore.capturedPhotos

  list.innerHTML = ''

  photos.forEach((photo, index) => {
    const slot = document.createElement('button')
    slot.className = 'captured-slot'
    slot.type = 'button'

    const img = document.createElement('img')
    img.src = getFilteredImage(photo)
    img.alt = `Anh da chup ${index + 1}`
    img.className = 'preview-img'
    slot.appendChild(img)
    if (isIdolPreselected.value) {
      const icons = selectionStore.idolIcons
      const icon = icons[index]
      if (icon && icon.url) {
        const idolImg = document.createElement('img')
        idolImg.src = icon.url
        idolImg.alt = ''
        idolImg.className = 'captured-slot-idol'
        idolImg.style.position = 'absolute'
        idolImg.style.bottom = '0'
        idolImg.style.width = '100%'
        idolImg.style.height = '90%'
        idolImg.style.objectFit = 'contain'
        idolImg.style.pointerEvents = 'none'
        if (icon.side === 'left') {
          idolImg.style.left = '0'
          idolImg.style.objectPosition = 'left bottom'
        } else {
          idolImg.style.right = '0'
          idolImg.style.objectPosition = 'right bottom'
        }
        slot.style.position = 'relative'
        slot.appendChild(idolImg)
      }
    }
    slot.classList.add('has-photo')
    slot.classList.toggle('is-used', filledPhotos.some((item) => item && item.capturedIndex === index))
    slot.onclick = () => togglePhotoInThemeByIndex(index)

    const rotBtn = document.createElement('button')
    rotBtn.className = 'captured-rotate-btn'
    rotBtn.innerHTML = '&#x21bb;'
    rotBtn.onclick = (e) => {
      e.stopPropagation()
      const p = selectionStore.capturedPhotos[index]
      if (!p) return
      const rotImg = new Image()
      rotImg.onload = () => {
        const c = document.createElement('canvas')
        c.width = rotImg.naturalHeight
        c.height = rotImg.naturalWidth
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.translate(c.width / 2, c.height / 2)
          ctx.rotate(Math.PI / 2)
          ctx.drawImage(rotImg, -rotImg.naturalWidth / 2, -rotImg.naturalHeight / 2)
          p.image = c.toDataURL('image/png')
          delete p.filteredImage
        }
        renderCapturedPhotos()
        renderThemePreview()
      }
      rotImg.src = p.image
    }
    slot.appendChild(rotBtn)

    list.appendChild(slot)
  })
}

function scrollCapturedPreview(direction: number): void {
  const preview = document.getElementById('theme-captured-list')
  if (!preview) return
  preview.scrollBy({ left: direction * preview.clientWidth * 0.8, behavior: 'smooth' })
}

function renderToCanvas(
  ctx: CanvasRenderingContext2D,
  iw: number,
  ih: number,
  slots: Slot[],
  frameImg: HTMLImageElement,
  photoImgs: (HTMLImageElement | null)[],
  filterVal: string,
  idolDraws: Array<{ img: HTMLImageElement; side: 'left' | 'right' } | null> = [],
): void {
  for (let index = 0; index < slots.length; index++) {
    const photo = filledPhotos[index]
    const img = photoImgs[index]
    if (!photo || !img) continue

    const slot = slots[index]
    const sx = (slot.x / 100) * iw
    const sy = (slot.y / 100) * ih
    const sw = (slot.w / 100) * iw
    const sh = (slot.h / 100) * ih

    ctx.save()
    ctx.beginPath()
    ctx.rect(sx, sy, sw, sh)
    ctx.clip()

    const imgW = img.naturalWidth || sw
    const imgH = img.naturalHeight || sh
    const imgAspect = imgW / imgH
    const slotAspect = sw / sh
    let drawW: number
    let drawH: number
    if (imgAspect > slotAspect) {
      drawH = sh
      drawW = sh * imgAspect
    } else {
      drawW = sw
      drawH = sw / imgAspect
    }

    const scaleX = photo._slotW ? sw / photo._slotW : 1
    const scaleY = photo._slotH ? sh / photo._slotH : 1
    const cx = sx + sw / 2 + (photo.x || 0) * scaleX
    const cy = sy + sh / 2 + (photo.y || 0) * scaleY
    ctx.translate(cx, cy)
    ctx.scale(photo.scale || 1, photo.scale || 1)
    if (filterVal && filterVal !== 'none') ctx.filter = filterVal
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
  }

  ctx.drawImage(frameImg, 0, 0, iw, ih)

  // IDOL-MODE: vẽ icon idol vào từng ô (contain, cao 90%, neo đáy, side theo từng icon)
  if (idolDraws.length > 0) {
    for (let index = 0; index < slots.length; index++) {
      const draw = idolDraws[index]
      const idolImg = draw?.img
      if (!idolImg || !idolImg.naturalWidth || !idolImg.naturalHeight) continue
      const slot = slots[index]
      const sx = (slot.x / 100) * iw
      const sy = (slot.y / 100) * ih
      const sw = (slot.w / 100) * iw
      const sh = (slot.h / 100) * ih
      const boxH = sh * 0.9
      const boxY = sy + sh - boxH
      const s = Math.min(sw / idolImg.naturalWidth, boxH / idolImg.naturalHeight)
      const dw = idolImg.naturalWidth * s
      const dh = idolImg.naturalHeight * s
      const dx = draw.side === 'right' ? sx + sw - dw : sx
      ctx.drawImage(idolImg, dx, boxY + (boxH - dh), dw, dh)
    }
  }
}

function capturePrintImage(): Promise<string | null> {
  if (!selectedTheme.value) return Promise.resolve(null)
  const theme = themes[selectedTheme.value]
  if (!theme) return Promise.resolve(null)

  const isTwoBySix = flowStore.flow.selectTheme.isTwoBySix(theme.ratio)
  const [rw, rh] = theme.ratio.split('/').map((s) => parseFloat(s.trim()))
  const stripW = 2400
  const stripH = Math.round((stripW * rh) / rw)

  const slots = theme.slots.slice(0, theme.slots.length)
  const loads: Promise<void>[] = []

  const frameImg = new Image()
  frameImg.crossOrigin = 'anonymous'
  frameImg.src = theme.processedSrc || theme.src
  loads.push(new Promise((r) => {
    frameImg.onload = () => r()
    frameImg.onerror = () => r()
  }))

  const photoImgs: (HTMLImageElement | null)[] = []
  for (let index = 0; index < slots.length; index++) {
    const photo = filledPhotos[index]
    if (!photo) {
      photoImgs.push(null)
      continue
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = getFilteredImage(photo)
    photoImgs.push(img)
    loads.push(new Promise((r) => {
      img.onload = () => r()
      img.onerror = () => r()
    }))
  }

  const idolDraws: Array<{ img: HTMLImageElement; side: 'left' | 'right' } | null> = []
  if (selectionStore.typeIdol === 1) {
    const icons = selectionStore.idolIcons
    for (let index = 0; index < slots.length; index++) {
      const capIdx = filledPhotos[index]?.capturedIndex
      const icon = capIdx === undefined ? undefined : icons[capIdx]
      if (!icon || !icon.url) {
        idolDraws.push(null)
        continue
      }
      const idol = new Image()
      idol.crossOrigin = 'anonymous'
      idol.src = icon.url
      idolDraws.push({ img: idol, side: icon.side })
      loads.push(
        new Promise((r) => {
          idol.onload = () => r()
          idol.onerror = () => r()
        }),
      )
    }
  }

  return new Promise((resolve) => {
    Promise.all(loads).then(() => {
      try {
        const paperW = 2400
        const paperH = Math.round((paperW * 3) / 2)
        const canvas = document.createElement('canvas')
        canvas.width = paperW
        canvas.height = paperH
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }

        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = stripW
        tempCanvas.height = stripH
        const tempCtx = tempCanvas.getContext('2d')
        if (!tempCtx) {
          resolve(null)
          return
        }
        const filterVal = TONE_FILTERS[selectionStore.selectedTone] || 'none'
        renderToCanvas(tempCtx, stripW, stripH, slots, frameImg, photoImgs, filterVal, idolDraws)

        if (isTwoBySix) {
          const leftMargin = 60
          const rightMargin = 60
          const innerMargin = 12
          const cutWidth = 0
          const drawW = 1128
          const topY = 36
          const drawH = paperH - 72
          const leftX = leftMargin
          const rightX = leftMargin + drawW + innerMargin + cutWidth + innerMargin
          const srcW = Math.min(stripW, Math.round((stripH * drawW) / drawH))
          const srcX = Math.round((stripW - srcW) / 2)
          ctx.drawImage(tempCanvas, srcX, 0, srcW, stripH, leftX, topY, drawW, drawH)
          ctx.drawImage(tempCanvas, srcX, 0, srcW, stripH, rightX, topY, drawW, drawH)
        } else {
          const drawW = Math.round(paperW * 0.98)
          const drawH = Math.round((drawW * stripH) / stripW)
          const leftMargin = Math.round((paperW - drawW) / 2)
          const topY = Math.round((paperH - drawH) / 2)
          ctx.drawImage(tempCanvas, 0, 0, stripW, stripH, leftMargin, topY, drawW, drawH)
        }
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    })
  })
}

function rotateDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.height
      canvas.height = img.width
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function showPrintPreview(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const label = flowStore.flow.selectTheme.previewLabel()
    const overlay = document.createElement('div')
    overlay.className = 'print-preview-overlay'
    overlay.innerHTML = `
      <div class="print-preview-box">
        <h2>Xem trước ảnh in</h2>
        <div class="print-preview-wrapper">
          <img src="${dataUrl}" alt="Preview" />
        </div>
        <div class="print-preview-actions">
          <button class="print-preview-cancel" id="print-preview-cancel">Hủy</button>
          <button class="print-preview-print" id="print-preview-print">${label}</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    overlay.querySelector<HTMLButtonElement>('#print-preview-cancel')!.onclick = () => {
      overlay.remove()
      resolve(false)
    }
    overlay.querySelector<HTMLButtonElement>('#print-preview-print')!.onclick = () => {
      overlay.remove()
      resolve(true)
    }
  })
}

function embedQRCode(dataUrl: string, qrCode: string, isTwoBySix: boolean): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)

      const qrImg = new Image()
      qrImg.crossOrigin = 'anonymous'
      qrImg.onload = () => {
        const qrSize = 200
        const pad = 24
        if (isTwoBySix) {
          const leftMargin = 60
          const topY = 36
          const drawW = 1128
          const drawH = canvas.height - 72
          const rightX = leftMargin + drawW + 12 + 0 + 12
          ctx.drawImage(qrImg, leftMargin + drawW - qrSize - pad, topY + drawH - qrSize - pad, qrSize, qrSize)
          ctx.drawImage(qrImg, rightX + drawW - qrSize - pad, topY + drawH - qrSize - pad, qrSize, qrSize)
        } else {
          const lm = 24
          const ty = 36
          const dw = Math.round(canvas.width * 0.98)
          const dh = Math.round((dw * canvas.height) / canvas.width)
          ctx.drawImage(qrImg, lm + dw - qrSize - pad, ty + dh - qrSize - pad, qrSize, qrSize)
        }
        resolve(canvas.toDataURL('image/png'))
      }
      qrImg.onerror = () => resolve(dataUrl)
      qrImg.src = qrCode
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function showPrintError(raw: string): void {
  const colonIdx = raw.indexOf(':')
  const err = colonIdx > 0 ? raw.substring(0, colonIdx) : raw
  const detail = colonIdx > 0 ? raw.substring(colonIdx + 1) : ''
  const msgs: Record<string, string> = {
    PRINTER_OFFLINE: 'Máy in đang offline. Bỏ chọn "Use Printer Offline" trong Windows và kiểm tra cáp kết nối.',
    PRINTER_NOT_FOUND: 'Không tìm thấy máy in. Kiểm tra tên máy in trong cài đặt.',
    PRINTER_CHECK_FAIL: `Không kiểm tra được máy in: ${detail}.`,
    PRINT_TIMEOUT: 'In quá 30-40s không phản hồi (driver bận?). Kiểm tra giấy/mực/máy in rồi thử in lại ở màn Finish.',
    PRINT_EMPTY_RESPONSE: 'Máy in không trả về kết quả. Kiểm tra máy in và thử lại.',
    PRINT_STUCK: 'Job in đã gửi vào spooler nhưng máy in không xử lý. Kiểm tra giấy/mực/tình trạng máy in.',
    PRINT_FAIL: `Lỗi máy in: ${detail}. Kiểm tra máy in và thử lại.`,
    TEMP_IMAGE_WRITE_FAIL: 'Không thể tạo file ảnh tạm thời.',
    POWERSHELL_EXEC_FAIL: `Lỗi thực thi lệnh in: ${detail}`,
  }
  showModal(`<p>❌ ${msgs[err] || `In thất bại. Kiểm tra máy in. (${raw})`}</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
  document.getElementById('modal-ok-btn')!.onclick = hideModal
}

async function doPrint(existingDataUrl?: string): Promise<void> {
  try {
    const dataUrl = existingDataUrl || (await capturePrintImage())
    if (!dataUrl) throw new Error('capture failed')

    const sessionId = Date.now().toString()
    const categoryId = selectionStore.categoryId
    const photos = selectionStore.capturedPhotos

    let videoBlob = sessionStore.timeLapseBlob
    sessionStore.timeLapseBlob = null
    // Compile timelapse chạy nền sau goNext; đợi nó xong (tối đa 30s) thay vì bỏ qua
    const pendingTask = sessionStore.timeLapseTask
    sessionStore.timeLapseTask = null
    if (!videoBlob && pendingTask) {
      try {
        videoBlob = await Promise.race([
          pendingTask,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
        ])
      } catch {
        videoBlob = null
      }
    }

    const qrCode = await flowStore.flow.selectTheme.printSession(sessionId)
    if (!qrCode) throw new Error('Không lấy được mã QR')

    const pending: PendingUpload = { sessionId, status: 'uploading' }
    sessionStore.pendingUploads.push(pending)
    uploadImg(sessionId, categoryId, dataUrl, photos, videoBlob)
      .then(() => {
        pending.status = 'done'
      })
      .catch(() => {
        pending.status = 'failed'
      })

    const isTwoBySix = flowStore.flow.selectTheme.isTwoBySix(themes[selectedTheme.value]?.ratio)
    const dataUrlWithQR = await embedQRCode(dataUrl, qrCode, isTwoBySix)

    const loaderOverlay = document.createElement('div')
    loaderOverlay.className = 'print-loader-overlay'
    loaderOverlay.innerHTML = '<div class="print-loader-spinner"></div><p class="print-loader-text">Đang in...</p>'
    document.body.appendChild(loaderOverlay)
    const rotated = await rotateDataUrl(dataUrlWithQR)
    const copies = flowStore.flow.selectTheme.copies()
    // Khổ quyết định theo tỉ lệ theme (isTwoBySix) — KHÔNG dùng selectionStore.type rếch:
    // type cũ từ lần chọn category làm 4x6 vào nhầm queue 2x6 -> giấy bị cắt đôi
    const printType = isTwoBySix ? '2x6' : '4x6'
    // Tên máy in ưu tiên: setting server theo khổ (printer_26/printer_46)
    // -> máy của category (chỉ luồng store) -> rỗng (báo lỗi). printName rếch trong
    // pb_selection không được thắng setting mới của booth.
    const cfg = configStore.config || {}
    const cfgPrinter = printType === '2x6' ? cfg.printer_26 : cfg.printer_46
    const printName = String(cfgPrinter || selectionStore.printName || '')
    console.log('[print] printer:', printName, 'type:', printType)
    console.log('[print] cfg printers:', JSON.stringify({ p26: cfg.printer_26 ?? null, p46: cfg.printer_46 ?? null }))
    // TEST-ONLY (dev): localStorage.skipPrint === '1' → bỏ qua in giấy, vẫn đi tiếp finish.
    // import.meta.env.DEV khiến bypass này chết hẳn ở bản .exe production.
    const skipPrint = import.meta.env.DEV && localStorage.getItem('skipPrint') === '1'
    if (!printName && !skipPrint) {
      loaderOverlay.remove()
      showPrintError('PRINTER_NOT_FOUND')
      return
    }
    let lastError: { ok: boolean; error?: string; detail?: string } | null = null
    if (!skipPrint) {
      for (let c = 0; c < copies; c++) {
        const success = await Promise.race([
          window.electronAPI.printImage(rotated, { type: printType, printName }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 40000)),
        ])
        if (!success) {
          lastError = { ok: false, error: 'PRINT_TIMEOUT' }
          break
        }
        if (!success.ok) {
          lastError = success
          break
        }
        if (copies > 1) await new Promise((r) => setTimeout(r, 2000))
      }
    }
    loaderOverlay.remove()
    if (lastError) {
      showPrintError((lastError.error || ''))
      return
    }

    sessionStore.lastPrintedImage = rotated
    sessionStore.lastPrintOptions = { type: printType, printName }
    sessionStore.sessionQR = qrCode

    if (videoBlob) {
      const b64 = await new Promise<string>((r) => {
        const rd = new FileReader()
        rd.onload = () => r(rd.result as string)
        rd.readAsDataURL(videoBlob)
      })
      sessionStore.timeLapsePath = (await window.electronAPI.saveTimeLapse(b64)) || ''
    }
    flowStore.next('select-theme')
  } catch (e) {
    const loader = document.querySelector('.print-loader-overlay')
    if (loader) loader.remove()
    showModal(`<p>❌ ${(e as Error).message}</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
    document.getElementById('modal-ok-btn')!.onclick = hideModal
  }
}

async function handlePrintFlow(): Promise<void> {
  if (!selectedTheme.value) return
  const dataUrl = await capturePrintImage()
  if (!dataUrl) return
  const confirmed = await showPrintPreview(dataUrl)
  if (!confirmed) return
  const ok = await flowStore.flow.selectTheme.beforePrint()
  if (!ok) return
  await doPrint(dataUrl)
}

onMounted(async () => {
  if (import.meta.env.DEV) {
    console.log('[select-theme] idol preselected:', isIdolPreselected.value, {
      typeIdol: selectionStore.typeIdol,
      theme: selectionStore.selectedTheme,
      hasFrame: !!selectionStore.idolFrameUrl,
      icons: selectionStore.idolIcons.length,
      photos: selectionStore.capturedPhotos.length,
    })
  }
  if (isIdolPreselected.value) {
    if (selectionStore.capturedPhotos.length === 0) {
      flowStore.go('camera')
      return
    }
    const themeKey = selectionStore.selectedTheme
    themes[themeKey] = {
      buttonId: themeKey,
      src: selectionStore.idolFrameUrl,
      ratio: '',
      slots: [],
      processedSrc: '',
      totalImage: selectionStore.capturedPhotos.length || selectionStore.idolIcons.length || 0,
    }
    loading.value = false
    selectTheme(themeKey)
    return
  }
  await loadMoreThemes()
  loading.value = false
  renderThemePreview()
  renderCapturedPhotos()

  const list = document.getElementById('theme-choice-list')
  let scrollTimer: ReturnType<typeof setTimeout> | null = null
  list?.addEventListener('scroll', () => {
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      if (!hasMore || themeLoading) return
      if (list.scrollLeft + list.clientWidth >= list.scrollWidth - 300) {
        void loadMoreThemes()
      }
    }, 200)
  })
})
</script>

<template>
  <div class="theme-builder">
    <svg class="theme-bg-deco" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f2b7cb"
        opacity="0.55"
      />
      <path d="M-120,120 C60,140 190,230 170,360" fill="none" stroke="#ef8fae" stroke-width="5" opacity="0.7" />
      <path
        d="M1680,500 C1500,540 1440,660 1470,790 C1490,880 1560,930 1620,960 L1680,960 L1680,500 Z"
        fill="#f2b7cb"
        opacity="0.55"
      />
      <path d="M1560,560 C1450,600 1410,720 1440,840" fill="none" stroke="#ef8fae" stroke-width="5" opacity="0.7" />
      <g transform="translate(70,400) scale(1.6)" fill="none" stroke="#f2719b" stroke-width="1.6">
        <path
          d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        />
      </g>
      <path
        d="M1500 300s-7.5-4.7-9.5-9.4c-1.2-2.7.3-5.7 3.3-5.7 2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7-1.5 4.7-10.5 9.4-10.5 9.4z"
        fill="#f2719b"
      />
      <path
        d="M180 780s-7.5-4.7-9.5-9.4c-1.2-2.7.3-5.7 3.3-5.7 2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7-1.5 4.7-10.5 9.4-10.5 9.4z"
        fill="#f2719b"
        opacity="0.8"
      />
    </svg>
    <section class="neon-panel theme-sidebar">
      <h2 class="neon-title"><span>✦</span> CHỌN THEME <span>✦</span></h2>
      <div v-if="!isIdolPreselected" class="theme-choice-strip">
          <button class="theme-nav" id="theme-nav-left" type="button" @click="scrollThemeChoices(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        <div class="theme-choice-list" id="theme-choice-list">
          <FlowerLoader v-if="loading" />
          <p v-else-if="Object.keys(themes).length === 0" class="hint">Chưa có theme nào</p>
        </div>
          <button class="theme-nav" id="theme-nav-right" type="button" @click="scrollThemeChoices(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
      </div>
    </section>

    <div class="theme-divider theme-divider-left" aria-hidden="true">
      <span></span>
      <span></span>
    </div>

    <main class="neon-panel theme-preview">
      <h1 class="neon-title"><span>✦</span> PREVIEW <span>✦</span></h1>
      <div class="theme-preview-stage" id="theme-preview-stage"></div>
    </main>

    <div class="theme-divider theme-divider-right" aria-hidden="true">
      <span></span>
      <span></span>
    </div>

    <section class="neon-panel tone-panel">
      <h2 class="neon-title"><span>✦</span> TONE MÀU <span>✦</span></h2>
      <div class="filter-grid">
        <button
          v-for="(filter, name) in TONE_FILTERS"
          :key="name"
          class="filter-option"
          :class="{ 'is-selected': selectionStore.selectedTone === name }"
          type="button"
          @click="selectionStore.selectedTone = name"
        >
          <span class="filter-thumb" :data-tone="name">
            <img v-if="samplePhotoUrl" :src="samplePhotoUrl" alt="" />
          </span>
          <span class="filter-name">{{ name.toUpperCase() }}</span>
        </button>
      </div>
    </section>

    <section class="neon-panel captured-panel">
      <h2 class="neon-title"><span>✦</span> DANH SÁCH ẢNH ĐÃ CHỤP <span>✦</span></h2>
      <div class="theme-captured-strip">
          <button class="preview-nav" id="theme-preview-left" type="button" @click="scrollCapturedPreview(-1)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        <div class="captured-list" id="theme-captured-list"></div>
          <button class="preview-nav" id="theme-preview-right" type="button" @click="scrollCapturedPreview(1)">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
      </div>
    </section>

    <button class="neon-panel print-button" type="button" :disabled="!selectedTheme" @click="handlePrintFlow">
      <span id="print-btn-text">XEM ẢNH</span>
    </button>
  </div>
</template>
