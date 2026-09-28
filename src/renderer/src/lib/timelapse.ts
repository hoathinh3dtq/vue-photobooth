import { useConfigStore } from '../stores/config'

const TL = {
  frames: [] as HTMLCanvasElement[],
  intervalId: null as ReturnType<typeof setInterval> | null,
  stream: null as MediaStream | null,
  video: null as HTMLVideoElement | null,
  maxFrames: 300,
}

let tlStarting: Promise<MediaStream | null> | null = null
let stopRequested = false

export function getTLStream(): MediaStream | null {
  return TL.stream
}

export function whenTLReady(): Promise<MediaStream | null> {
  if (tlStarting) return tlStarting
  return Promise.resolve(TL.stream)
}

export function releaseTLStream(): void {
  if (TL.stream) {
    TL.stream.getTracks().forEach((t) => t.stop())
    TL.stream = null
  }
  if (TL.video) {
    TL.video.remove()
    TL.video = null
  }
  if (TL.intervalId) clearInterval(TL.intervalId)
  TL.intervalId = null
  TL.frames = []
}

export async function startTimeLapse(): Promise<void> {
  if (tlStarting) {
    await tlStarting
    return
  }
  if (TL.intervalId) return
  stopRequested = false

  tlStarting = (async (): Promise<MediaStream | null> => {
    const video = document.createElement('video')
    video.autoplay = true
    video.playsInline = true
    video.muted = true
    video.style.display = 'none'
    document.body.appendChild(video)
    TL.video = video

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
      })
      if (stopRequested) {
        stream.getTracks().forEach((t) => t.stop())
        video.remove()
        TL.video = null
        return null
      }
      TL.stream = stream
      video.srcObject = stream
      await video.play()

      TL.frames = []
      TL.intervalId = setInterval(captureFrame, 1000)
      return TL.stream
    } catch (err) {
      console.warn('[timelapse] getUserMedia failed:', err)
      video.remove()
      TL.video = null
      return null
    }
  })()

  try {
    await tlStarting
  } finally {
    tlStarting = null
  }
}

function captureFrame(): void {
  if (!TL.video || TL.video.videoWidth === 0) return
  const w = TL.video.videoWidth
  const h = TL.video.videoHeight

  // Giới hạn độ phân giải để file webm nhẹ, tránh server từ chối do quá lớn
  const MAX_DIM = 854
  let cw = w
  let ch = h
  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = Math.min(MAX_DIM / w, MAX_DIM / h)
    cw = Math.round(w * scale)
    ch = Math.round(h * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const val = useConfigStore().config?.mirror_camera
  if (val === 1) {
    ctx.translate(cw, 0)
    ctx.scale(-1, 1)
  } else if (val === 2) {
    ctx.translate(0, ch)
    ctx.scale(1, -1)
  } else if (val === 3) {
    ctx.translate(cw, ch)
    ctx.scale(-1, -1)
  }
  ctx.drawImage(TL.video, 0, 0, cw, ch)
  TL.frames.push(canvas)
  if (TL.frames.length > TL.maxFrames) TL.frames.shift()
}

export async function stopTimeLapse(): Promise<Blob | null> {
  stopRequested = true
  if (tlStarting) await tlStarting.catch(() => null)

  if (TL.intervalId) clearInterval(TL.intervalId)
  TL.intervalId = null

  if (TL.stream) {
    TL.stream.getTracks().forEach((t) => t.stop())
    TL.stream = null
  }
  if (TL.video) {
    TL.video.remove()
    TL.video = null
  }

  if (TL.frames.length < 2) {
    console.info('[timelapse] not enough frames:', TL.frames.length)
    TL.frames = []
    return null
  }

  console.info('[timelapse] compiling frames:', TL.frames.length)
  const blob = await compileVideo(TL.frames)
  TL.frames = []
  return blob
}

function compileVideo(frames: HTMLCanvasElement[]): Promise<Blob | null> {
  return new Promise((resolve) => {
    const fps = 10
    const w = frames[0].width
    const h = frames[0].height

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      resolve(null)
      return
    }

    let stream: MediaStream
    try {
      stream = canvas.captureStream(fps)
    } catch {
      resolve(null)
      return
    }
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    } catch {
      stream.getTracks().forEach((t) => t.stop())
      resolve(null)
      return
    }
    const chunks: BlobPart[] = []

    function stopStream() {
      stream.getTracks().forEach((t) => t.stop())
    }

    recorder.ondataavailable = (e: any) => chunks.push(e.data)
    recorder.onstop = () => {
      stopStream()
      resolve(new Blob(chunks, { type: 'video/webm' }))
    }
    recorder.onerror = () => {
      stopStream()
      resolve(null)
    }

    recorder.start()
    let idx = 0
    function next() {
      if (idx >= frames.length) {
        recorder.stop()
        return
      }
      if (ctx) ctx.drawImage(frames[idx], 0, 0)
      idx++
      setTimeout(next, 1000 / fps)
    }
    next()
  })
}
