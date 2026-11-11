import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { installTauriBridge } from './lib/tauriBridge'
import { login, saveSession } from './lib/api/auth'
import './styles/global.css'
import './styles/v1/main.css'
import './styles/v1/home.css'
import './styles/v1/select_type_photo.css'
import './styles/v1/camera.css'
import './styles/v1/select_theme.css'
import App from './App.vue'
import router from './router'

// Tauri bridge (Rust shell) — phải install trước mọi electronAPI call
try { installTauriBridge() } catch { /* ignore */ }

// Forward console ra terminal main (kiosk full màn hình không mở devtools được)
function fmtArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}
{
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)
  const send = (level: string, args: unknown[]): void => {
    try {
      ;(window as unknown as { electronAPI?: { log?: (l: string, m: string) => void } }).electronAPI?.log?.(
        level,
        fmtArgs(args).slice(0, 2000),
      )
    } catch {}
  }
  console.log = (...args: unknown[]): void => {
    origLog(...(args as []))
    send('info', args)
  }
  console.warn = (...args: unknown[]): void => {
    origWarn(...(args as []))
    send('warn', args)
  }
  console.error = (...args: unknown[]): void => {
    origError(...(args as []))
    send('error', args)
  }
}

// Tự động đăng nhập nếu chưa có session, để ẩn màn hình login trên mọi máy
// (code login vẫn giữ nguyên, chỉ bỏ qua khi đã có token).
async function boot(): Promise<void> {
  const defaultBooth = (): string => localStorage.getItem('default_booth_code') || 'LOCAL001'
  const token = localStorage.getItem('auth_token')
  if (!token) {
    try {
      const res = await login('admin@photobooth.com', '123456', defaultBooth())
      saveSession(res)
    } catch (e) {
      console.error('auto-login failed', e)
    }
  } else {
    // Token có thể hết hạn (server restart) — verify và refresh nếu 401
    try {
      const host = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000'
      const res = await fetch(`${String(host).replace(/\/$/, '')}/api/user`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('auth_token')
        const r = await login('admin@photobooth.com', '123456', defaultBooth())
        saveSession(r)
      }
    } catch (e) {
      console.error('token check failed', e)
    }
  }
  createApp(App).use(createPinia()).use(router).mount('#app')
}

void boot()
