// canonEdsdk.ts — Canon EDSDK helper (thay digiCamControl)
// Helper là file C# (CanonEdsdkHelper.cs) được biên dịch tại runtime bằng csc.exe của .NET Framework 4.x.
// Giao thức: mỗi dòng stdin = {"id":N,"cmd":"...",...}; mỗi dòng stdout = {"id":N,"ok":bool,"result":{...}}.
// Sự kiện không hỏi mà có: {"event":"ready"}, {"event":"disconnected"}, {"event":"fatal","message":"..."}.
import fs from 'node:fs'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { app } from 'electron'
import crypto from 'node:crypto'

// ---- Embedded C# source (port từ CanonEdsdkHelper.cs) ----
// Source đầy đủ nằm ở rebuilt_tool/_decompiled/... hoặc file CanonEdsdkHelper.cs do người dùng cung cấp.
// Để compact, import từ file helper nếu có; nếu không, compile fail với message rõ ràng.
const HELPER_SOURCE_PATHS = [
  path.join(app.getAppPath(), 'src', 'main', 'services', 'CanonEdsdkHelper.cs'),
]

export interface CanonEdsdkStatus {
  connected: boolean
  model?: string
  serial?: string
  battery?: number
  error?: string
  eds?: number
}

export interface CanonEdsdkResult {
  ok: boolean
  result?: unknown
  code?: string
  eds?: number
  message?: string
  event?: string
}

let helperExe: string | null = null
let helperProcess: ChildProcess | null = null
let helperStdoutBuffer = ''
let pendingRequests = new Map<number, { resolve: (r: CanonEdsdkResult) => void; reject: (e: Error) => void }>()
let nextId = 1
let disconnectedCallback: (() => void) | null = null
let readyCallback: (() => void) | null = null

function cscPath(): string {
  const windir = process.env.WINDIR || 'C:\\Windows'
  // EDSDK.dll đi kèm digiCamControl/CamRent là 32-bit → cần csc 32-bit
  return path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
}

function defaultEdsdkDir(): string {
  const candidates = [
    process.env.BOOTH_EDSDK_DIR,
    'C:\\Program Files (x86)\\digiCamControl',
    'C:\\Program Files\\digiCamControl',
    'C:\\Users\\Admin\\AppData\\Roaming\\camrent-booth-app\\canon-edsdk',
  ].filter(Boolean) as string[]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'EDSDK.dll'))) return c
  }
  return candidates[0] || 'C:\\Program Files (x86)\\digiCamControl'
}

const EDSDK_RUNTIME_FILES = ['EDSDK.dll', 'EdsImage.dll']

function ensureEdsdkFiles(destDir: string, srcDir: string): void {
  if (!fs.existsSync(srcDir)) throw new Error('Không tìm thấy folder EDSDK: ' + srcDir)
  fs.mkdirSync(destDir, { recursive: true })
  for (const f of EDSDK_RUNTIME_FILES) {
    const src = path.join(srcDir, f)
    if (!fs.existsSync(src)) throw new Error('Thiếu ' + f + ' trong ' + srcDir)
    const dst = path.join(destDir, f)
    if (!fs.existsSync(dst) || fs.statSync(src).size !== fs.statSync(dst).size) {
      fs.copyFileSync(src, dst)
    }
  }
}

function loadHelperSource(): string {
  for (const p of HELPER_SOURCE_PATHS) {
    try {
      if (!fs.existsSync(p)) continue
      const raw = fs.readFileSync(p, 'utf8')
      // File có thể là JS wrapper với C# source nhúng trong string.
      // Marker có thể là "helperSource = '" hoặc "elperSource = '" (file bị cắt ký tự đầu).
      let marker = null
      for (const m of ["helperSource = '", "elperSource = '", "helperSource='", "elperSource='"]) {
        if (raw.indexOf(m) >= 0) { marker = m; break }
      }
      if (marker) {
        const start = raw.indexOf(marker) + marker.length
        const end = raw.indexOf("';\n", start)
        if (end > start) {
          return raw.slice(start, end)
            .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
        }
      }
      // Fallback: nếu không tìm thấy marker, tìm bắt đầu C# source
      const csStart = raw.indexOf('// Helper điều khiển máy Canon')
      if (csStart >= 0) return raw.slice(csStart)
      // Nếu file đã là C# thuần
      if (raw.includes('namespace CamRentBooth') || raw.includes('class Eds')) return raw
    } catch { /* ignore */ }
  }
  throw new Error('Không tìm thấy CanonEdsdkHelper.cs source. Đặt tại ' + HELPER_SOURCE_PATHS[0])
}

async function prepareHelper(): Promise<string> {
  if (helperExe && fs.existsSync(helperExe)) return helperExe
  const dir = path.join(app.getPath('userData'), 'canon-edsdk')
  fs.mkdirSync(dir, { recursive: true })
  const source = loadHelperSource()
  // Extract C# source from the JS-embedded helperSource string if needed
  let csSource = source
  const marker = "helperSource = '"
  const idx = source.indexOf(marker)
  if (idx >= 0) {
    const start = idx + marker.length
    const end = source.indexOf("';\n", start)
    if (end > start) {
      csSource = source.slice(start, end)
        .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    }
  }
  const exe = path.join(dir, 'CanonEdsdkHelper.exe')
  const hashFile = path.join(dir, 'CanonEdsdkHelper.sha256')
  const hash = crypto.createHash('sha256').update(csSource).digest('hex')
  const builtHash = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : ''
  if (!fs.existsSync(exe) || builtHash !== hash) {
    const sourceFile = path.join(dir, 'CanonEdsdkHelper.cs')
    fs.writeFileSync(sourceFile, csSource, 'utf8')
    const csc = cscPath()
    if (!fs.existsSync(csc)) throw new Error('Windows thiếu .NET Framework 4 (csc.exe) để dựng CanonEdsdkHelper')
    const { execFile } = require('node:child_process')
    await new Promise<void>((resolve, reject) => {
      const compileCwd = path.join(app.getPath('temp'), 'canon-edsdk-compile')
      fs.mkdirSync(compileCwd, { recursive: true })
      execFile(csc, ['/nologo', '/target:exe', '/platform:x86', '/optimize+', '/r:System.Web.Extensions.dll', '/r:System.Drawing.dll', `/out:${exe}`, sourceFile], { cwd: compileCwd, windowsHide: true, timeout: 60000 }, (err: Error | null, stdout: string, stderr: string) => {
        if (err) { reject(new Error('Compile fail: ' + (stderr || stdout || err.message).trim().split('\n').slice(0, 3).join(' '))); return }
        resolve()
      })
    })
    fs.writeFileSync(hashFile, hash, 'utf8')
  }
  // Copy EDSDK files
  const srcDir = defaultEdsdkDir()
  ensureEdsdkFiles(dir, srcDir)
  helperExe = exe
  return exe
}

function spawnHelper(): ChildProcess {
  if (helperProcess && !helperProcess.killed) return helperProcess
  const exe = helperExe!
  const child = spawn(exe, [], { windowsHide: true, cwd: path.dirname(exe) })
  helperProcess = child
  helperStdoutBuffer = ''
  child.stdout?.on('data', (data: Buffer) => {
    helperStdoutBuffer += data.toString('utf8')
    const lines = helperStdoutBuffer.split(/\r?\n/)
    helperStdoutBuffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      let msg: any
      try { msg = JSON.parse(line) } catch { continue }
      if (msg.event === 'disconnected') { disconnectedCallback?.(); continue }
      if (msg.event === 'ready') { readyCallback?.(); continue }
      if (msg.event === 'fatal') { console.error('[canon-edsdk] fatal:', msg.message); continue }
      const id = msg.id
      const pending = pendingRequests.get(id)
      if (pending) {
        pendingRequests.delete(id)
        if (msg.ok) pending.resolve({ ok: true, result: msg.result })
        else pending.resolve({ ok: false, code: msg.code, eds: msg.eds, message: msg.message })
      }
    }
  })
  child.stderr?.on('data', (d: Buffer) => console.error('[canon-edsdk stderr]', d.toString('utf8')))
  child.on('exit', (code) => {
    console.log('[canon-edsdk] process exited code', code)
    helperProcess = null
    for (const [id, p] of pendingRequests) {
      p.resolve({ ok: false, code: 'PROCESS_EXITED', message: 'Helper process exited unexpectedly' })
      pendingRequests.delete(id)
    }
  })
  return child
}

function sendCommand(cmd: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<CanonEdsdkResult> {
  return new Promise(async (resolve) => {
    try {
      const exe = await prepareHelper()
      const child = spawnHelper()
      const id = nextId++
      const timer = setTimeout(() => {
        pendingRequests.delete(id)
        resolve({ ok: false, code: 'TIMEOUT', message: `Helper timeout sau ${Math.round(timeoutMs / 1000)}s` })
      }, timeoutMs)
      pendingRequests.set(id, {
        resolve: (r) => { clearTimeout(timer); resolve(r) },
        reject: (e) => { clearTimeout(timer); resolve({ ok: false, code: 'INTERNAL', message: e.message }) },
      })
      const request = JSON.stringify({ id, cmd, ...params })
      child.stdin?.write(request + '\n')
    } catch (err) {
      resolve({ ok: false, code: 'INIT_FAIL', message: (err as Error).message })
    }
  })
}

export async function initCanonEdsdk(): Promise<CanonEdsdkResult> {
  try {
    await prepareHelper()
    spawnHelper()
    // Wait for ready event (or timeout)
    return await new Promise<CanonEdsdkResult>((resolve) => {
      const timer = setTimeout(() => resolve({ ok: true, result: { ready: 'timeout' } }), 5000)
      readyCallback = () => { clearTimeout(timer); resolve({ ok: true, result: { ready: true } }) }
    })
  } catch (err) {
    return { ok: false, code: 'INIT_FAIL', message: (err as Error).message }
  }
}

export async function canonStatus(): Promise<CanonEdsdkResult> {
  return sendCommand('status')
}

export async function canonLiveViewStart(): Promise<CanonEdsdkResult> {
  return sendCommand('liveViewStart')
}

export async function canonLiveViewFrame(): Promise<CanonEdsdkResult> {
  return sendCommand('liveViewFrame', {}, 10000)
}

export async function canonLiveViewStop(): Promise<CanonEdsdkResult> {
  return sendCommand('liveViewStop')
}

export async function canonCapture(outputPath: string, autofocus = true, timeoutMs = 20000): Promise<CanonEdsdkResult> {
  return sendCommand('capture', { path: outputPath, autofocus, timeoutMs }, timeoutMs + 5000)
}

export async function canonCaptureDataUrl(outputPath: string, autofocus = true, timeoutMs = 20000): Promise<CanonEdsdkResult & { imageDataUrl?: string }> {
  const result = await canonCapture(outputPath, autofocus, timeoutMs)
  if (!result.ok) return result
  const r = result.result as { path?: string } | undefined
  const filePath = (r?.path || outputPath).replace(/\\/g, path.sep === '/' ? '/' : '\\\\')
  try {
    const buf = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    return { ...result, imageDataUrl: `data:${mime};base64,${buf.toString('base64')}` }
  } catch (err) {
    return { ok: false, code: 'READ_FAIL', message: 'Chụp OK nhưng không đọc được file: ' + (err as Error).message }
  }
}

export async function canonDriveLens(step: number): Promise<CanonEdsdkResult> {
  return sendCommand('driveLens', { step })
}

export async function canonGetProperty(prop: number): Promise<CanonEdsdkResult> {
  return sendCommand('get', { prop })
}

export async function canonSetProperty(prop: number, value: number): Promise<CanonEdsdkResult> {
  return sendCommand('set', { prop, value })
}

export async function canonImportRecent(dir: string, count = 1): Promise<CanonEdsdkResult> {
  return sendCommand('importRecent', { dir, count })
}

export function canonClose(): void {
  try {
    sendCommand('close', {}, 3000).catch(() => {})
  } catch { /* ignore */ }
  if (helperProcess) {
    try { helperProcess.kill() } catch { /* ignore */ }
    helperProcess = null
  }
}

export function onCanonDisconnected(cb: () => void): void {
  disconnectedCallback = cb
}

export function onCanonReady(cb: () => void): void {
  readyCallback = cb
}

export default {
  prepareHelper, initCanonEdsdk, canonStatus, canonLiveViewStart, canonLiveViewFrame,
  canonLiveViewStop, canonCapture, canonCaptureDataUrl, canonDriveLens, canonGetProperty, canonSetProperty,
  canonImportRecent, canonClose, onCanonDisconnected, onCanonReady,
}
