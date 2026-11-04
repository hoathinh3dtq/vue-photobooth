// sidecarCam.ts — PhotoBooth ⨯ HihiCamBridge detection
// Spawn sidecar với `list-cameras` rồi parse stdout:
//   [FujiSdk] LoadLibrary(...XAPI.DLL)          → Fuji SDK load OK
//   [FujiProvider] Fuji SDK initialized successfully.
//   [SonyProvider] Camera Remote SDK initialized (0x02020000).
//   [ {"id":"webcam_0", …}, … ]                  → danh sách camera (JSON 1 dòng)
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'

export interface SidecarCamera {
  id: string
  name: string
  port?: string
  protocol?: string
  selectionId?: string
}

export interface SidecarDetectResult {
  /** Sidecar exe tìm thấy & spawn được */
  available: boolean
  /** Đường dẫn exe đang dùng (hoặc null nếu không tìm thấy) */
  exePath: string | null
  /** Raw stdout (đã trim) */
  raw: string
  /** Các dòng log đã parse */
  lines: string[]
  /** Fuji: XAPI.DLL load được */
  fujiLoaded: boolean
  /** Fuji: provider init thành công */
  fujiInit: boolean
  /** Sony: Camera Remote SDK init OK */
  sonyInit: boolean
  /** version hex từ log Sony (vd "0x02020000"), null nếu không có */
  sonyVersion: string | null
  /** Camera liệt kê được (match protocol webcam / canon-edsdk / sony-crsdk / fujifilm …) */
  cameras: SidecarCamera[]
  /** Lỗi (spawn fail, timeout, exe missing…) — null nếu OK */
  error: string | null
  /** Thời gian probe (ms) */
  elapsedMs: number
}

const SIDECAR_TIMEOUT_MS = 20_000

function resolveSidecarExe(): string | null {
  // 1) Env override (tiện cho dev / kiosk CI)
  const envPath = process.env.HIHICAM_SIDECAR?.trim()
  if (envPath && fs.existsSync(envPath)) return envPath

  const candidates = [
    // 2) Vendor trong app (khi build release kèm sidecar)
    path.join(app.getAppPath(), 'resources', 'sidecar', 'HihiCamBridge', 'HihiCamBridge.exe'),
    // 3) Bản cài HihiBooth trên máy (dev fallback)
    'C:\\Program Files\\HihiBooth\\sidecars\\hihicam-bridge-bin\\HihiCamBridge.exe',
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* ignore unreadable paths */
    }
  }
  return null
}

function parseCameras(lines: string[]): SidecarCamera[] {
  // Sidecar in JSON array ở dòng cuối; đôi khi có dòng log xen lẫn → quét ngược từ cuối
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('[')) continue
    try {
      const parsed = JSON.parse(line) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is SidecarCamera => x != null && typeof x === 'object' && 'id' in (x as object) && 'name' in (x as object))
          .map((x) => ({
            id: String((x as SidecarCamera).id),
            name: String((x as SidecarCamera).name),
            port: (x as SidecarCamera).port != null ? String((x as SidecarCamera).port) : undefined,
            protocol: (x as SidecarCamera).protocol != null ? String((x as SidecarCamera).protocol) : undefined,
            selectionId: (x as SidecarCamera).selectionId != null ? String((x as SidecarCamera).selectionId) : undefined,
          }))
      }
    } catch {
      /* không phải JSON — bỏ qua */
    }
  }
  return []
}

function parseResult(stdout: string, stderr: string, elapsedMs: number, exePath: string): SidecarDetectResult {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0)

  // Fuji/Sony SDK log ra stderr (Console.Error.WriteLine) — phải quét cả 2 stream
  const combined = stdout + '\n' + stderr

  let fujiLoaded = false
  let fujiInit = false
  let sonyInit = false
  let sonyVersion: string | null = null

  for (const line of combined.split(/\r?\n/)) {
    if (/\[FujiSdk\]\s*LoadLibrary\(/i.test(line)) fujiLoaded = true
    if (/Fuji SDK initialized successfully/i.test(line)) fujiInit = true
    const sony = line.match(/Camera Remote SDK initialized\s*\((0x[0-9a-fA-F]+)\)/i)
    if (sony) {
      sonyInit = true
      sonyVersion = sony[1]
    }
  }

  const cameras = parseCameras(lines)

  return {
    available: true,
    exePath,
    raw: stdout.trim(),
    lines,
    fujiLoaded,
    fujiInit,
    sonyInit,
    sonyVersion,
    cameras,
    error: null,
    elapsedMs,
  }
}

/**
 * Chạy `HihiCamBridge.exe list-cameras` (không truyền --vendor → quét mọi provider).
 * Không bao giờ throw — mọi lỗi đều trả về qua `result.error`.
 */
export async function detectSidecar(): Promise<SidecarDetectResult> {
  const started = Date.now()
  const exePath = resolveSidecarExe()
  if (!exePath) {
    return {
      available: false,
      exePath: null,
      raw: '',
      lines: [],
      fujiLoaded: false,
      fujiInit: false,
      sonyInit: false,
      sonyVersion: null,
      cameras: [],
      error: 'Sidecar không tìm thấy (kiểm tra env HIHICAM_SIDECAR hoặc resources/sidecar)',
      elapsedMs: Date.now() - started,
    }
  }

  return new Promise<SidecarDetectResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result: SidecarDetectResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish({
        available: true,
        exePath,
        raw: stdout.trim(),
        lines: stdout.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean),
        fujiLoaded: /LoadLibrary\(/i.test(stdout + '\n' + stderr),
        fujiInit: /Fuji SDK initialized successfully/i.test(stdout + '\n' + stderr),
        sonyInit: /Camera Remote SDK initialized/i.test(stdout + '\n' + stderr),
        sonyVersion: (stdout + '\n' + stderr).match(/Camera Remote SDK initialized\s*\((0x[0-9a-fA-F]+)\)/i)?.[1] ?? null,
        cameras: [],
        error: `Sidecar timeout sau ${Math.round(SIDECAR_TIMEOUT_MS / 1000)}s`,
        elapsedMs: Date.now() - started,
      })
    }, SIDECAR_TIMEOUT_MS)

    const child = spawn(exePath, ['list-cameras'], { windowsHide: true })
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
    child.on('error', (err: Error) => {
      clearTimeout(timer)
      finish({
        available: true,
        exePath,
        raw: stdout.trim(),
        lines: [],
        fujiLoaded: false,
        fujiInit: false,
        sonyInit: false,
        sonyVersion: null,
        cameras: [],
        error: 'Spawn lỗi: ' + err.message,
        elapsedMs: Date.now() - started,
      })
    })
    child.on('close', () => {
      clearTimeout(timer)
      finish(parseResult(stdout, stderr, Date.now() - started, exePath))
    })
  })
}
