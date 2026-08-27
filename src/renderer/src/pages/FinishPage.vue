<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFlowStore } from '../stores/flow'
import { useSelectionStore } from '../stores/selection'
import { useSessionStore } from '../stores/session'
import { createPaymentQR, checkPaymentStatus } from '../lib/api/payment'
import { showModal, showModalClose, hideModal } from '../lib/modal'

const flowStore = useFlowStore()
const selectionStore = useSelectionStore()
const sessionStore = useSessionStore()

const timeLapsePath = ref(sessionStore.timeLapsePath)
const qrCode = ref(sessionStore.sessionQR)
const uploadText = ref('')
const showUpload = ref(false)

let checkTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  checkTimer = setInterval(() => {
    const uploads = sessionStore.pendingUploads
    if (uploads.length === 0) {
      if (checkTimer) clearInterval(checkTimer)
      showUpload.value = false
      return
    }
    const uploading = uploads.filter((p) => p.status === 'uploading').length
    const done = uploads.filter((p) => p.status === 'done').length
    const failed = uploads.filter((p) => p.status === 'failed').length
    const total = uploads.length
    if (uploading > 0) {
      uploadText.value = `Đang tải ảnh lên... (${done + failed}/${total})`
    } else if (failed > 0) {
      uploadText.value = `⚠️ Tải lên thất bại (${failed}/${total})`
    } else {
      uploadText.value = `✅ Tải lên hoàn tất`
      setTimeout(() => {
        showUpload.value = false
      }, 3000)
    }
    showUpload.value = true
  }, 1000)
})

onBeforeUnmount(() => {
  if (checkTimer) clearInterval(checkTimer)
})

function goHome(): void {
  selectionStore.reset()
  sessionStore.resetSession()
  flowStore.go('home')
}

function promptQuantity(): Promise<number> {
  return new Promise((resolve) => {
    showModal(
      `
      <p>Bạn muốn in thêm mấy tấm?</p>
      <div style="display:flex;align-items:center;justify-content:center;gap:1vw;margin:2vh 0;">
        <button class="qty-btn" id="qty-minus">−</button>
        <span id="qty-value" style="font-size:1.5vw;color:#fff0f6;min-width:3vw;text-align:center;">1</span>
        <button class="qty-btn" id="qty-plus">+</button>
      </div>
      <button class="print-preview-print" id="qty-confirm" style="width:100%;padding:1vh 2vw;">In</button>
      `,
      false,
    )

    let qty = 1
    const valEl = document.getElementById('qty-value')
    document.getElementById('qty-minus')!.onclick = () => {
      qty = Math.max(1, qty - 1)
      if (valEl) valEl.textContent = String(qty)
    }
    document.getElementById('qty-plus')!.onclick = () => {
      qty = Math.min(10, qty + 1)
      if (valEl) valEl.textContent = String(qty)
    }
    document.getElementById('qty-confirm')!.onclick = () => {
      hideModal()
      resolve(qty)
    }
  })
}

async function printCopies(count: number): Promise<boolean> {
  if (!sessionStore.lastPrintedImage) {
    showModal(
      `<p>Không tìm thấy ảnh để in lại</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`,
    )
    document.getElementById('modal-ok-btn')!.onclick = hideModal
    return false
  }
  const opts = sessionStore.lastPrintOptions
  for (let i = 0; i < count; i++) {
    showModal(`<p>Đang in... (${i + 1}/${count})</p>`, false)
    const res = await window.electronAPI.printImage(sessionStore.lastPrintedImage, opts)
    hideModal()
    if (!res || !res.ok) {
      const errMsg = (res && res.error) || 'Lỗi máy in'
      showModal(`<p>In thất bại (bản ${i + 1}/${count}): ${errMsg}</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
      document.getElementById('modal-ok-btn')!.onclick = hideModal
      return false
    }
    if (i < count - 1) await new Promise((r) => setTimeout(r, 2000))
  }
  showModal(`<p>In thêm thành công! (${count} tấm)</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
  document.getElementById('modal-ok-btn')!.onclick = hideModal
  return true
}

function handleReprint(): void {
  void (async () => {
    const qty = await promptQuantity()
    if (!qty) return

    if (flowStore.type === 'event') {
      await printCopies(qty)
      return
    }

    try {
      const payment = await createPaymentQR(selectionStore.categoryId, { type: 'reprint', quantity: qty })
      const data = ((payment as { data?: unknown }).data || payment) as {
        qr_code?: string
        payment_url?: string
        url?: string
        amount?: number
        id?: number | string
      }
      const qrUrl = data.qr_code || data.payment_url || data.url || ''
      const amount = data.amount || 20000
      showModal(
        `
        <p>Quét mã QR để thanh toán ${amount.toLocaleString('vi-VN')} VNĐ</p>
        <img src="${qrUrl}" alt="QR" style="width:240px;height:300px;object-fit:contain;">
        <p style="font-size:0.9vw;opacity:0.7;">${amount.toLocaleString('vi-VN')} VNĐ</p>
        <p style="font-size:0.8vw;opacity:0.6;" id="payment-countdown">Mã sẽ hết hạn sau 05:00</p>
        `,
        false,
      )

      let pollTimer: ReturnType<typeof setInterval> | null = null
      const created = Date.now()
      const el = document.getElementById('payment-countdown')

      function cleanup() {
        if (timer) clearInterval(timer)
        if (pollTimer) clearInterval(pollTimer)
        hideModal()
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
            const result = await checkPaymentStatus(data.id ?? '')
            const st = ((result as { data?: { status?: string } }).data || result) as { status?: string }
            if (st.status === 'paid') {
              if (pollTimer) clearInterval(pollTimer)
              clearInterval(timer)
              hideModal()
              await printCopies(qty)
            }
          } catch {}
        }, 5000)
      }, 5000)
    } catch {
      showModal(`<p>Lỗi kết nối thanh toán</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
      document.getElementById('modal-ok-btn')!.onclick = hideModal
    }
  })()
}
</script>

<template>
  <div class="finish-container">
    <div class="finish-box">
      <div class="finish-header">
        <div class="finish-icon">&#10003;</div>
        <h1>In ảnh thành công!</h1>
        <p>Cảm ơn bạn đã sử dụng dịch vụ.</p>
      </div>
      <div class="finish-content">
        <div class="finish-left">
          <video
            v-if="timeLapsePath"
            class="timelapse-video"
            :src="`file://${timeLapsePath}`"
            controls
            autoplay
            muted
            loop
          ></video>
          <p v-if="timeLapsePath" class="finish-video-label">Video time lapse</p>
        </div>
        <div class="finish-right">
          <div v-if="qrCode" class="finish-qr">
            <img :src="qrCode" alt="QR code" />
            <p>Quét mã để tải ảnh</p>
          </div>
        </div>
      </div>
      <div class="finish-actions">
        <div v-if="showUpload" id="upload-status">
          <span id="upload-status-text">{{ uploadText }}</span>
        </div>
        <button class="btn-camera" id="finish-reprint-btn" type="button" @click="handleReprint">
          <p>In thêm ảnh</p>
        </button>
        <button class="btn-camera" id="finish-home-btn" type="button" @click="goHome">
          <p>Về trang chủ</p>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
#upload-status {
  font-size: 0.8vw;
  color: #ffb8d4;
}
</style>
