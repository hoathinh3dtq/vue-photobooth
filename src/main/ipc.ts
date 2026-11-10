import { ipcMain, app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { detectCamera, capture, status } from './services/digiCam'
import { loadSettings, getSettings, saveSettings } from './services/settingsService'
import { detectSidecar } from './services/sidecarCam'
import * as canonEdsdk from './services/canonEdsdk'

const execFileAsync = promisify(execFile)

ipcMain.handle('app:get-version', () => app.getVersion())

// Forward renderer console ra terminal (kiosk full màn hình không mở được devtools)
ipcMain.handle('app:log', (_event, level: string, msg: string) => {
  const text = `[renderer] ${msg}`
  if (level === 'error') console.error(text)
  else if (level === 'warn') console.warn(text)
  else console.log(text)
  return null
})

// --- Camera (digiCamControl: HTTP/CLI, fallback webcam ở renderer) ---
export function initCameraService(): Promise<unknown> {
  return detectCamera()
}

// --- Camera (sidecar HihiCamBridge: Fuji/Sony SDK + webcam/UVC) ---
export function initSidecarCamService(): Promise<unknown> {
  return detectSidecar().then((r) => {
    const cams = r.cameras.map((c) => `${c.name} (${c.protocol ?? '?'})`).join(', ') || 'không có camera'
    console.log(
      `[sidecar] exe=${r.exePath ?? 'missing'} fuji=${r.fujiInit} sony=${r.sonyInit}${r.sonyVersion ? ' ' + r.sonyVersion : ''} webcams="${cams}"${r.error ? ' error=' + r.error : ''}`,
    )
    return r
  })
}

// --- Camera (Canon EDSDK helper — thay digiCamControl) ---
export function initCanonEdsdkService(): Promise<unknown> {
  return canonEdsdk.initCanonEdsdk().then((r) => {
    console.log('[canon-edsdk] init:', JSON.stringify(r))
    return r
  })
}

ipcMain.handle('camera:detect', () => detectCamera())
ipcMain.handle('camera:status', () => status())
ipcMain.handle('camera:capture', () => capture())
// Sidecar detection (Fuji XAPI / Sony CRSDK / webcam) — App 2-style status
ipcMain.handle('camera:sidecar-detect', () => detectSidecar())
// Canon EDSDK helper (compile runtime + JSON-RPC over stdin/stdout)
ipcMain.handle('camera:canon-edsdk-init', () => canonEdsdk.initCanonEdsdk())
ipcMain.handle('camera:canon-edsdk-status', () => canonEdsdk.canonStatus())
ipcMain.handle('camera:canon-edsdk-liveview-start', () => canonEdsdk.canonLiveViewStart())
ipcMain.handle('camera:canon-edsdk-liveview-frame', () => canonEdsdk.canonLiveViewFrame())
ipcMain.handle('camera:canon-edsdk-liveview-stop', () => canonEdsdk.canonLiveViewStop())
ipcMain.handle('camera:canon-edsdk-capture', (_e, opts: { outputPath: string; autofocus?: boolean; timeoutMs?: number }) =>
  canonEdsdk.canonCapture(opts.outputPath, opts?.autofocus ?? true, opts?.timeoutMs ?? 20000),
)
ipcMain.handle('camera:canon-edsdk-capture-dataurl', (_e, opts: { outputPath?: string; autofocus?: boolean; timeoutMs?: number } = {}) =>
  canonEdsdk.canonCaptureDataUrl(
    opts?.outputPath || path.join(app.getPath('temp'), `ptb-canon-${Date.now()}.jpg`),
    opts?.autofocus ?? true,
    opts?.timeoutMs ?? 20000,
  ),
)
ipcMain.handle('camera:canon-edsdk-lens', (_e, step: number) => canonEdsdk.canonDriveLens(step))
ipcMain.handle('camera:canon-edsdk-get', (_e, prop: number) => canonEdsdk.canonGetProperty(prop))
ipcMain.handle('camera:canon-edsdk-set', (_e, prop: number, value: number) => canonEdsdk.canonSetProperty(prop, value))
ipcMain.handle('camera:canon-edsdk-import-recent', (_e, opts: { dir: string; count?: number }) =>
  canonEdsdk.canonImportRecent(opts.dir, opts?.count ?? 1),
)

// Print queue (serialize jobs) — ported from HihiBooth printQueue.js
let printTail: Promise<unknown> = Promise.resolve()
function enqueuePrint(job: () => Promise<unknown>): Promise<unknown> {
  const run = printTail.then(job, job)
  printTail = run.catch((e) => { console.warn('[print:queue] job failed:', (e as Error)?.message) })
  return run
}

ipcMain.handle('print-image', async (_event, dataUrl: string, opts: { type?: string; printName?: string; zoom?: number; offsetX?: number; offsetY?: number } = {}) => {
  return enqueuePrint(async () => {
  const targetPrinter = opts?.printName ?? ''
  if (!targetPrinter) return { ok: false, error: 'PRINTER_NOT_FOUND' }
  const settings = getSettings()
  const zoom = (opts.zoom ?? settings.zoom ?? 0.98)
  const offsetX = (opts.offsetX ?? settings.offsetX ?? 0)
  const offsetY = (opts.offsetY ?? settings.offsetY ?? 0)

  const tmpDir = app.getPath('temp')
  const pngFile = path.join(tmpDir, `ptb-print-${Date.now()}.png`)

  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
    fs.writeFileSync(pngFile, base64Data, 'base64')
  } catch {
    return { ok: false, error: 'TEMP_IMAGE_WRITE_FAIL' }
  }

  try {
    const pngPath = pngFile.replace(/\\/g, '\\\\')
    const printerName = targetPrinter.replace(/'/g, "''")

    const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

try {
  $printer = Get-CimInstance -ClassName Win32_Printer -Filter "Name='${printerName}'"
  if (-not $printer) { Write-Output 'PRINTER_NOT_FOUND'; exit 0 }
  if ($printer.WorkOffline) { Write-Output 'PRINTER_OFFLINE'; exit 0 }
  $beforeRaw = $printer.JobCount
  $before = if ($null -eq $beforeRaw) { 0 } else { [int]$beforeRaw }
} catch {
  Write-Output "PRINTER_CHECK_FAIL:$($_.Exception.Message)"
  exit 0
}

try {
  $imgProbe = New-Object System.Drawing.Bitmap -ArgumentList '${pngPath}', $true
  $imgIsLandscape = $imgProbe.Width -gt $imgProbe.Height
  $imgProbe.Dispose()
} catch {
  Write-Output "PRINT_FAIL:$($_.Exception.Message)"
  exit 0
}

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = '${printerName}'
if (-not $doc.PrinterSettings.IsValid) { Write-Output 'PRINTER_NOT_FOUND'; exit 0 }
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false
$doc.DefaultPageSettings.Landscape = $imgIsLandscape

$script:renderError = $null
$doc.add_PrintPage({
  param($sender, $e)
  $img = $null
  try {
    $img = New-Object System.Drawing.Bitmap -ArgumentList '${pngPath}', $true
    $pWidth = $e.PageBounds.Width
    $pHeight = $e.PageBounds.Height
    $imgW = $img.Width
    $imgH = $img.Height
    $pageIsLandscape = $pWidth -gt $pHeight
    $imgIsLandscape2 = $imgW -gt $imgH
    if ($imgIsLandscape2 -ne $pageIsLandscape) {
      $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
      $imgW = $img.Width
      $imgH = $img.Height
    }
    $ratio = [Math]::Min($pWidth / $imgW, $pHeight / $imgH)
    $zoom = ${zoom}
    $offsetX = ${offsetX}
    $offsetY = ${offsetY}
    $newW = [int]($imgW * $ratio * $zoom)
    $newH = [int]($imgH * $ratio * $zoom)
    $posX = [int](($pWidth - $newW) / 2) + $offsetX
    $posY = [int](($pHeight - $newH) / 2) + $offsetY
    $e.Graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $e.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $e.Graphics.DrawImage($img, $posX, $posY, $newW, $newH)
  } catch {
    $script:renderError = $_.Exception.Message
    $e.Cancel = $true
  } finally {
    if ($null -ne $img) { $img.Dispose() }
  }
  $e.HasMorePages = $false
})
$doc.Print()
try { } catch {}

$slept = 0
while ($slept -le 8000) {
  Start-Sleep -Milliseconds 500
  $slept += 500
  try {
    $curRaw = (Get-CimInstance -ClassName Win32_Printer -Filter "Name='${printerName}'").JobCount
    $current = if ($null -eq $curRaw) { 0 } else { [int]$curRaw }
  } catch { break }
  if ($current -le $before) { Write-Output 'PRINT_OK'; exit 0 }
  if ($current -eq 0) { Write-Output 'PRINT_OK'; exit 0 }
}
Write-Output 'PRINT_OK'
`.trim()

    // Async để không block main process (trước đây execFileSync treo cả app khi driver bận).
    // windowsHide + -WindowStyle Hidden: cửa sổ PowerShell không hiện lên cướp focus
    // làm taskbar trồi ra trong lúc kiosk đang in.
    let out = ''
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript],
        { timeout: 30000, encoding: 'utf8', windowsHide: true },
      )
      out = stdout
    } catch (e) {
      const err = e as { stdout?: string; message?: string; killed?: boolean }
      if (err.stdout) {
        out = err.stdout
      } else if (err.killed) {
        return { ok: false, error: 'PRINT_TIMEOUT', detail: 'PowerShell quá 30s (driver bận?)' }
      } else {
        return { ok: false, error: 'POWERSHELL_EXEC_FAIL', detail: err.message || String(e) }
      }
    }
    const outTrim = (out || '').trim()
    if (outTrim.startsWith('PRINT_OK')) return { ok: true }
    if (!outTrim) return { ok: false, error: 'PRINT_EMPTY_RESPONSE' }
    return { ok: false, error: outTrim }
  } catch (e) {
    return { ok: false, error: 'POWERSHELL_EXEC_FAIL', detail: (e as Error).message }
  } finally {
    try {
      fs.unlinkSync(pngFile)
    } catch {}
    // Giành lại focus cho kiosk sau khi in (phòng driver/printer dialog cướp focus)
    try {
      const w = BrowserWindow.getAllWindows()[0]
      if (w && !w.isDestroyed()) {
        w.moveTop()
        w.focus()
      }
    } catch {}
  }
  })
})

ipcMain.handle('settings:get', () => getSettings())
ipcMain.handle('settings:save', (_event, patch: Record<string, unknown>) => saveSettings(patch as never))
ipcMain.handle('printer:list', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-ExecutionPolicy', 'Bypass', '-NoProfile', '-WindowStyle', 'Hidden',
      '-Command', 'Get-Printer | Select-Object -ExpandProperty Name',
    ], { timeout: 15000, encoding: 'utf8', windowsHide: true })
    const names = (stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    return { ok: true, printers: names }
  } catch (e) {
    return { ok: false, printers: [], error: (e as Error).message }
  }
})
ipcMain.handle('printer:open-preferences', async (_event, name: string) => {
  const { execFile } = await import('node:child_process')
  try {
    execFile('rundll32', ['printui.dll,PrintUIEntry', '/e', '/n', name], { windowsHide: false })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('save-timelapse', async (_event, base64: string) => {
  try {
    const videoDir = path.join(app.getPath('userData'), 'timelapse')
    if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true })
    const filePath = path.join(videoDir, `timelapse-${Date.now()}.webm`)
    const buffer = Buffer.from(base64.replace(/^data:video\/webm;base64,/, ''), 'base64')
    fs.writeFileSync(filePath, buffer)
    return filePath
  } catch {
    return null
  }
})

ipcMain.handle('save-event-photo', async (_event, base64: string, eventId: number | string) => {
  try {
    const eventDir = path.join(app.getPath('userData'), 'events', String(eventId))
    if (!fs.existsSync(eventDir)) fs.mkdirSync(eventDir, { recursive: true })
    const filename = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`
    const filePath = path.join(eventDir, filename)
    const buffer = Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64')
    fs.writeFileSync(filePath, buffer)
    return filePath
  } catch {
    return null
  }
})

// Mở thư mục dãn ảnh sự kiện
ipcMain.handle('events:open-folder', async (_event, eventId: number | string) => {
  try {
    const eventDir = path.join(app.getPath('userData'), 'events', String(eventId))
    if (!fs.existsSync(eventDir)) fs.mkdirSync(eventDir, { recursive: true })
    await shell.openPath(eventDir)
    return { ok: true, path: eventDir }
  } catch {
    return { ok: false }
  }
})

ipcMain.handle('list-event-photos', async (_event, eventId: number | string) => {
  try {
    pruneOldEventPhotos()
    const eventDir = path.join(app.getPath('userData'), 'events', String(eventId))
    if (!fs.existsSync(eventDir)) return []
    const files = fs.readdirSync(eventDir)
      .filter((f) => /\.png$/i.test(f))
      .sort()
      .reverse()
    return files.map((f) => ({ filename: f, path: path.join(eventDir, f) }))
  } catch {
    return []
  }
})

ipcMain.handle('read-event-photo', async (_event, filePath: string) => {
  try {
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
})

// Xóa ảnh event quá cũ (mặc định 2 ngày) để khỏi phình ổ cứng máy booth
const EVENT_PHOTO_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000

export function pruneOldEventPhotos(): void {
  try {
    const eventsDir = path.join(app.getPath('userData'), 'events')
    if (!fs.existsSync(eventsDir)) return
    const now = Date.now()
    for (const eventId of fs.readdirSync(eventsDir)) {
      const dir = path.join(eventsDir, eventId)
      try {
        if (!fs.statSync(dir).isDirectory()) continue
      } catch {
        continue
      }
      for (const f of fs.readdirSync(dir)) {
        if (!/\.png$/i.test(f)) continue
        const fp = path.join(dir, f)
        try {
          if (now - fs.statSync(fp).mtimeMs > EVENT_PHOTO_MAX_AGE_MS) fs.unlinkSync(fp)
        } catch {}
      }
      try {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
      } catch {}
    }
  } catch (e) {
    console.warn('[events] prune failed:', e)
  }
}