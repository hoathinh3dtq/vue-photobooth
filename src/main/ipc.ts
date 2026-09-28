import { ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { detectCamera, capture, status } from './services/digiCam'

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

ipcMain.handle('camera:detect', () => detectCamera())
ipcMain.handle('camera:status', () => status())
ipcMain.handle('camera:capture', () => capture())

ipcMain.handle('print-image', async (_event, dataUrl: string, opts: { type?: string; printName?: string }) => {
  const targetPrinter = opts?.printName ?? ''
  if (!targetPrinter) return { ok: false, error: 'PRINTER_NOT_FOUND' }

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
  $img = [System.Drawing.Image]::FromFile('${pngPath}')
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = '${printerName}'
  if (-not $doc.PrinterSettings.IsValid) { Write-Output 'PRINTER_NOT_FOUND'; exit 0 }
  $doc.DefaultPageSettings.Landscape = $true
  $doc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.DrawImage($img, $e.PageBounds)
    $e.HasMorePages = $false
  })
  $doc.Print()
  try { $img.Dispose() } catch {}

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
} catch {
  Write-Output "PRINT_FAIL:$($_.Exception.Message)"
}
`.trim()

    // Async để không block main process (trước đây execFileSync treo cả app khi driver bận)
    let out = ''
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-Command', psScript],
        { timeout: 30000, encoding: 'utf8' },
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

ipcMain.handle('list-event-photos', async (_event, eventId: number | string) => {
  try {
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