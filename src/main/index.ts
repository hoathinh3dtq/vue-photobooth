import { app, BrowserWindow, session } from 'electron'
import path from 'node:path'
import { initCameraService } from './ipc'

// Tự động cấp quyền media (như v1) - phải append trước khi app ready
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: false,
    },
  })

  win.setFullScreen(true)
  win.setMenuBarVisibility(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const allowed = new Set(['media', 'audioCapture', 'videoCapture'])

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    console.log('[perm] request:', permission)
    callback(allowed.has(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin) => {
    return allowed.has(permission as never) || permission === 'media'
  })

  createWindow()

  void initCameraService().catch(() => {})

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})