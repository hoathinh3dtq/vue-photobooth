import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/global.css'
import './styles/v1/main.css'
import './styles/v1/home.css'
import './styles/v1/select_type_photo.css'
import './styles/v1/camera.css'
import './styles/v1/select_theme.css'
import App from './App.vue'
import router from './router'

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

createApp(App).use(createPinia()).use(router).mount('#app')
