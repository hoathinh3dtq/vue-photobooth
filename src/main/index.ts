import { app, BrowserWindow, session, screen } from 'electron'
import path from 'node:path'
import { initCameraService } from './ipc'

// Tự động cấp quyền media (như v1) - phải append trước khi app ready
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')

function createWindow(): void {
  const primary = screen.getPrimaryDisplay()
  const sw = primary.size.width
  const sh = primary.size.height

  const win = new BrowserWindow({
    x: 0,
    y: 0,
    width: sw,
    height: sh,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    fullscreen: true,
    fullscreenable: true,
    kiosk: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: false,
    },
  })

  win.removeMenu()
  win.setMenuBarVisibility(false)
  win.setAutoHideMenuBar(true)
  // Kiosk + fullscreen để kín màn hình, che luôn taskbar Windows
  // Lưu ý: không gọi maximize() vì sẽ phá trạng thái fullscreen trên Windows
  win.setFullScreen(true)
  win.setKiosk(true)
  win.setAlwaysOnTop(true, 'screen-saver')
  // Fallback: ép bounds phủ kín display (kể cả vùng taskbar)
  try {
    win.setBounds({ x: 0, y: 0, width: sw, height: sh })
  } catch {}

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
    try {
      win.setBounds({ x: 0, y: 0, width: sw, height: sh })
    } catch {}
    win.moveTop()
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setFullScreen(true)
    win.setKiosk(true)
    console.log('[window] fullscreen=', win.isFullScreen(), 'kiosk=', win.isKiosk(), 'bounds=', win.getBounds(), 'display=', { sw, sh })
  })

  // Giữ fullscreen nếu user vô tình thoát (production kiosk)
  win.on('leave-full-screen', () => {
    win.setFullScreen(true)
  })

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