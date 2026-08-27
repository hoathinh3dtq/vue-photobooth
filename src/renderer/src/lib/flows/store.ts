import type { BoothFlow } from './types'
import { listThemesByCategory } from '../api/themes'
import { printSession as printSessionApi } from '../api/print'
import { createPaymentQR, checkPaymentStatus } from '../api/payment'
import { showModal, showModalClose, hideModal } from '../modal'
import { useConfigStore } from '../../stores/config'
import { useSelectionStore } from '../../stores/selection'

export const storeFlow: BoothFlow = {
  screens: ['home', 'select-type', 'camera', 'select-theme', 'finish'],
  camera: {
    totalTake() {
      const sel = useSelectionStore()
      const cfg = useConfigStore()
      return sel.totalPhoto || cfg.config?.total_take_photo || 5
    },
  },
  selectTheme: {
    listThemes(page) {
      const sel = useSelectionStore()
      return listThemesByCategory(sel.categoryId || null, page, 10, null)
    },
    printSession(sessionId) {
      const sel = useSelectionStore()
      return printSessionApi(sessionId, sel.categoryId || null)
    },
    previewLabel() {
      return String(localStorage.getItem('user_type')).trim() === '1'
        ? 'IN ẢNH'
        : 'THANH TOÁN VÀ IN'
    },
    copies() {
      const sel = useSelectionStore()
      return sel.type === '2x6' ? 1 : 2
    },
    isTwoBySix(ratio) {
      const sel = useSelectionStore()
      return sel.type === '2x6'
    },
    beforePrint() {
    if (String(localStorage.getItem('user_type')).trim() === '1') {
      return Promise.resolve(true)
    }
      const sel = useSelectionStore()
      return new Promise<boolean>((resolve) => {
        createPaymentQR(sel.categoryId)
          .then((res) => {
            const data = (res as { data?: unknown }).data || res
            const payment = data as { qr_code?: string; payment_url?: string; url?: string; amount?: number; id?: number | string }
            const qrUrl = payment.qr_code || payment.payment_url || payment.url || ''
            if (!qrUrl) {
              resolve(true)
              return
            }
            const amount = payment.amount || 20000
            showModal(`
              <p>Quét mã QR để thanh toán ${amount.toLocaleString('vi-VN')} VNĐ</p>
              <img src="${qrUrl}" alt="QR" style="width:240px;height:300px;object-fit:contain;">
              <p style="font-size:0.9vw;opacity:0.7;">${amount.toLocaleString('vi-VN')} VNĐ</p>
              <p style="font-size:0.8vw;opacity:0.6;" id="payment-countdown">Mã sẽ hết hạn sau 05:00</p>
            `, false)

            let paid = false
            let pollTimer: ReturnType<typeof setInterval> | null = null
            const created = Date.now()
            const el = document.getElementById('payment-countdown')

            function cleanup() {
              if (timer) clearInterval(timer)
              if (pollTimer) clearInterval(pollTimer)
              hideModal()
              resolve(paid)
            }

            const timer = setInterval(() => {
              const elapsed = Math.floor((Date.now() - created) / 1000)
              const remain = 320 - elapsed
              if (remain <= 0) {
                clearInterval(timer)
                if (el) el.textContent = 'Hết thời gian thanh toán'
                showModalClose(cleanup)
                return
              }
              if (remain > 20) {
                const m = String(Math.floor((remain - 20) / 60)).padStart(2, '0')
                const s = String((remain - 20) % 60).padStart(2, '0')
                if (el) el.textContent = `Mã sẽ hết hạn sau ${m}:${s}`
              } else {
                if (el) el.textContent = 'Đang chờ xác nhận thanh toán...'
              }
            }, 1000)

            setTimeout(() => {
              pollTimer = setInterval(async () => {
                try {
                  const result = await checkPaymentStatus(payment.id ?? '')
                  const st = ((result as { data?: { status?: string } }).data || result) as { status?: string }
                  if (st.status === 'paid') {
                    paid = true
                    if (pollTimer) clearInterval(pollTimer)
                    clearInterval(timer)
                    hideModal()
                    resolve(true)
                  } else if (Date.now() - created >= 310000) {
                    if (pollTimer) clearInterval(pollTimer)
                  }
                } catch {}
              }, 5000)
            }, 5000)
          })
          .catch(() => resolve(false))
      })
    },
  },
}