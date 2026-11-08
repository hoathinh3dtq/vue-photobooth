export interface DetectedHole {
  x: number
  y: number
  w: number
  h: number
  orientation: 'landscape' | 'portrait' | 'square'
}

export interface DetectedFrame {
  holes: DetectedHole[]
  fw: number
  fh: number
}

const ALPHA_THRESHOLD = 30
const SCALE_LIMIT = 800
const MIN_AREA_RATIO = 0.005

/**
 * Port of vendor `frameHoleDetector-BiyV1K-V.js` (section 27).
 * Accepts File | Blob | string (URL/data URL).
 */
export async function detectFrameHoles(input: File | Blob | string): Promise<DetectedFrame> {
  const image = await loadImage(input)

  const scale = Math.min(1, SCALE_LIMIT / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return { holes: [], fw: image.naturalWidth, fh: image.naturalHeight }
  }

  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)

  const data = ctx.getImageData(0, 0, width, height).data
  const total = width * height
  const alpha = new Uint8Array(total)

  for (let i = 0; i < total; i++) {
    alpha[i] = data[i * 4 + 3] < ALPHA_THRESHOLD ? 1 : 0
  }

  const uf = new Int32Array(total).fill(-1)
  const compId = new Int32Array(total).fill(-1)

  function find(x: number): number {
    let root = x
    while (uf[root] >= 0) root = uf[root]
    while (uf[x] >= 0) {
      const next = uf[x]
      uf[x] = root
      x = next
    }
    return root
  }

  function union(a: number, b: number): void {
    a = find(a)
    b = find(b)
    if (a === b) return
    if (uf[a] > uf[b]) {
      const tmp = a
      a = b
      b = tmp
    }
    uf[a] += uf[b]
    uf[b] = a
  }

  let componentCount = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!alpha[idx]) continue

      const up = y > 0 ? compId[(y - 1) * width + x] : -1
      const left = x > 0 ? compId[y * width + (x - 1)] : -1

      if (up === -1 && left === -1) {
        compId[idx] = componentCount++
      } else if (up !== -1 && left === -1) {
        compId[idx] = up
      } else if (up === -1 && left !== -1) {
        compId[idx] = left
      } else {
        compId[idx] = Math.min(up, left)
        union(up, left)
      }
    }
  }

  const components = new Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }>()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!alpha[idx]) continue
      const root = find(compId[idx])
      if (!components.has(root)) {
        components.set(root, { minX: x, minY: y, maxX: x, maxY: y, count: 1 })
      } else {
        const component = components.get(root)!
        component.minX = Math.min(component.minX, x)
        component.minY = Math.min(component.minY, y)
        component.maxX = Math.max(component.maxX, x)
        component.maxY = Math.max(component.maxY, y)
        component.count++
      }
    }
  }

  const minPixels = total * MIN_AREA_RATIO
  const scaleBack = 1 / scale
  const padding = Math.ceil(scaleBack)

  const holes: DetectedHole[] = []

  for (const component of components.values()) {
    if (component.count < minPixels) continue
    if (
      component.minX === 0 ||
      component.minY === 0 ||
      component.maxX === width - 1 ||
      component.maxY === height - 1
    ) {
      continue
    }

    const x = Math.max(0, Math.round(component.minX * scaleBack) - padding)
    const y = Math.max(0, Math.round(component.minY * scaleBack) - padding)
    const w = Math.round((component.maxX + 1) * scaleBack) + padding - x
    const h = Math.round((component.maxY + 1) * scaleBack) + padding - y

    holes.push({
      x,
      y,
      w,
      h,
      orientation: w > h ? 'landscape' : w < h ? 'portrait' : 'square',
    })
  }

  holes.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))

  return {
    holes,
    fw: image.naturalWidth,
    fh: image.naturalHeight,
  }
}

function loadImage(input: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    let objectUrl: string | null = null

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('Khong the tai anh frame de detect holes'))
    }

    if (input instanceof File || input instanceof Blob) {
      objectUrl = URL.createObjectURL(input)
      image.src = objectUrl
    } else if (typeof input === 'string') {
      image.src = input
    } else {
      reject(new Error('Input khong hop le'))
    }
  })
}
