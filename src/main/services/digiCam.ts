import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { app } from 'electron'

// Chụp DSLR thông qua digiCamControl (app chạy trên Windows, bọc EDSDK bên trong).
// Không gọi SDK Canon/Nikon trực tiếp: chỉ giao tiếp HTTP (port 5513) hoặc CLI CameraControlCmd.exe.
// Thứ tự: HTTP ?CMD=Capture -> poll preview.jpg -> đọc session folder -> CLI.

export interface CaptureResult {
  ok: boolean
  imageDataUrl?: string
  code?: string
  error?: string
}

export interface CameraStatus {
  brand: string | null
  provider: string | null
  available: boolean
}

const CMD_PATHS = [
  'C:\\Program Files\\digiCamControl\\CameraControlCmd.exe',
  'C:\\Program Files (x86)\\digiCamControl\\CameraControlCmd.exe',
]
const HTTP_API = 'http://127.0.0.1:5513'

let available = false

function httpGet(url: string, timeoutMs = 5000): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data }))
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', (e) => reject(e))
  })
}

function httpGetBuffer(url: string, timeoutMs = 5000): Promise<{ status: number; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk as Buffer))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, buffer: Buffer.concat(chunks) }))
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.on('error', (e) => reject(e))
  })
}

function findCommand(): string | null {
  return CMD_PATHS.find((p) => fs.existsSync(p)) || null
}

async function doCaptureCli(cmdPath: string, tmpFile: string): Promise<CaptureResult> {
  const args = ['/filename', tmpFile, '/capture']
  try {
    const result = await new Promise<{ code: number | string; stdout: string; stderr: string }>(
      (resolve) => {
        const proc = spawn(cmdPath, args, { cwd: path.dirname(cmdPath), windowsHide: true })
        let stdout = ''
        let stderr = ''
        const timeout = setTimeout(() => {
          proc.kill('SIGTERM')
          resolve({ code: 'TIMEOUT', stdout, stderr })
        }, 15000)
        proc.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
        proc.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
        proc.on('close', (code: number) => {
          clearTimeout(timeout)
          resolve({ code: code ?? -1, stdout, stderr })
        })
        proc.on('error', (e: Error) => {
          clearTimeout(timeout)
          resolve({ code: 'SPAWN_ERR', stdout, stderr: e.message })
        })
      },
    )

    if (result.code === 'TIMEOUT') return { ok: false, code: 'DSLR_CAPTURE_TIMEOUT', error: 'CameraControlCmd timeout' }
    if (result.code === 'SPAWN_ERR') return { ok: false, code: 'DSLR_CAPTURE_FAILED', error: result.stderr }
    if (result.code !== 0)
      return { ok: false, code: 'DSLR_CAPTURE_FAILED', error: result.stderr || result.stdout || 'exit ' + result.code }

    if (!fs.existsSync(tmpFile)) return { ok: false, code: 'DSLR_FILE_NOT_CREATED', error: 'CLI không tạo file ảnh' }
    const buf = fs.readFileSync(tmpFile)
    return { ok: true, imageDataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` }
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    } catch {
      /* ignore */
    }
  }
}

export function status(): CameraStatus {
  return {
    brand: 'digicamcontrol',
    provider: available ? 'digiCamControl (HTTP/CLI)' : null,
    available,
  }
}

export async function detectCamera(): Promise<CameraStatus> {
  try {
    const res = await httpGet(`${HTTP_API}/`)
    if (res.status === 200) {
      available = true
      return status()
    }
  } catch {
    /* ignore */
  }
  available = !!findCommand()
  return status()
}

export async function capture(): Promise<CaptureResult> {
  try {
    let oldSig: string | null = null
    try {
      const oldSample = await httpGetBuffer(`${HTTP_API}/preview.jpg?rand=${Date.now()}`)
      oldSig = oldSample.buffer.length + '-' + oldSample.buffer.slice(0, 256).toString('hex')
    } catch {
      /* ignore */
    }

    await httpGet(`${HTTP_API}/?CMD=Capture&_=${Date.now()}`)

    const pollStart = Date.now()
    const pollTimeout = 10000
    let newImg: Buffer | null = null

    while (Date.now() - pollStart < pollTimeout) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        const cur = await httpGetBuffer(`${HTTP_API}/preview.jpg?rand=${Date.now()}`)
        if (cur.status !== 200 || !cur.buffer || cur.buffer.length <= 5000) continue
        if (oldSig === null) {
          newImg = cur.buffer
          break
        }
        const curSig = cur.buffer.length + '-' + cur.buffer.slice(0, 256).toString('hex')
        if (curSig !== oldSig) {
          newImg = cur.buffer
          break
        }
      } catch {
        /* ignore */
      }
    }

    if (newImg) {
      return { ok: true, imageDataUrl: `data:image/jpeg;base64,${newImg.toString('base64')}` }
    }

    // Fallback: đọc session folder từ HTML
    try {
      const root = await httpGet(`${HTTP_API}/`)
      const folderMatch = root.data.match(/session[Ff]older["'\s:=]+["']([^"']+)["']/)
      if (folderMatch && fs.existsSync(folderMatch[1])) {
        const files = fs
          .readdirSync(folderMatch[1])
          .filter((f) => /\.(jpg|jpeg|png)$/i.test(f))
          .sort()
          .reverse()
        if (files.length > 0) {
          const buf = fs.readFileSync(path.join(folderMatch[1], files[0]))
          return { ok: true, imageDataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` }
        }
      }
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('[camera:digicamcontrol] HTTP lỗi:', (e as Error).message)
  }

  // Fallback cuối: CLI
  const cmdPath = findCommand()
  if (!cmdPath) return { ok: false, code: 'DSLR_NOT_AVAILABLE', error: 'Không tìm thấy CameraControlCmd.exe' }
  const tmpFile = path.join(app.getPath('temp'), `ptb-${Date.now()}.jpg`)
  return doCaptureCli(cmdPath, tmpFile)
}
