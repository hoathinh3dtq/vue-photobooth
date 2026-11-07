<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useFlowStore } from '../stores/flow'
import { useSelectionStore } from '../stores/selection'
import { useSessionStore } from '../stores/session'
import { useConfigStore } from '../stores/config'
import { createPaymentQR, checkPaymentStatus } from '../lib/api/payment'
import { showModal, showModalClose, hideModal } from '../lib/modal'

const flowStore = useFlowStore()
const selectionStore = useSelectionStore()
const sessionStore = useSessionStore()
const configStore = useConfigStore()

const timeLapsePath = ref(sessionStore.timeLapsePath)
const printedImage = ref(sessionStore.lastPrintedImage)
const qrCode = ref(sessionStore.sessionQR)
const uploadText = ref('')
const showUpload = ref(false)
const uploadOk = ref(false)

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
      uploadOk.value = false
    } else if (failed > 0) {
      uploadText.value = `Tải lên thất bại (${failed}/${total})`
      uploadOk.value = false
    } else {
      uploadText.value = `Tải lên hoàn tất`
      uploadOk.value = true
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
      <p>Bạn muốn in thêm mấy lần?</p>
      <div style="display:flex;align-items:center;justify-content:center;gap:1vw;margin:2vh 0;">
        <button class="qty-btn" id="qty-minus">−</button>
        <span id="qty-value" style="font-size:1.5vw;color:#b04a68;min-width:3vw;text-align:center;">1</span>
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
  // Clone sang plain object để tránh lỗi "An object could not be cloned"
  // do Pinia state là Vue reactive Proxy, không structured-clone được qua Electron IPC
  const opts = { ...sessionStore.lastPrintOptions }
  const imageDataUrl = `${sessionStore.lastPrintedImage}`
  if (!opts.printName) {
    showModal(
      `<p>❌ Không tìm thấy máy in. Kiểm tra tên máy in trong cài đặt. (PRINTER_NOT_FOUND)</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`,
    )
    document.getElementById('modal-ok-btn')!.onclick = hideModal
    return false
  }
  for (let i = 0; i < count; i++) {
    showModal(`<p>Đang in... (${i + 1}/${count})</p>`, false)
    try {
      // Timeout 40s để không treo modal "Đang in..." khi driver bận
      let _zoom = 0.98, _ox = 0, _oy = 0
      try {
        const _s = await (window as any).electronAPI?.settings?.get?.()
        if (_s) { _zoom = _s.zoom ?? 0.98; _ox = _s.offsetX ?? 0; _oy = _s.offsetY ?? 0 }
      } catch { /* ignore */ }
      const res = await Promise.race([
        window.electronAPI.printImage(imageDataUrl, { ...opts, zoom: _zoom, offsetX: _ox, offsetY: _oy }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 40000)),
      ])
      hideModal()
      if (!res) {
        showModal(`<p>In thất bại (bản ${i + 1}/${count}): PRINT_TIMEOUT - driver quá 40s, kiểm tra giấy/mực/máy in.</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
        document.getElementById('modal-ok-btn')!.onclick = hideModal
        return false
      }
      if (!res.ok) {
        const errMsg = res.error || 'Lỗi máy in'
        const detail = res.detail ? `: ${res.detail}` : ''
        showModal(`<p>In thất bại (bản ${i + 1}/${count}): ${errMsg}${detail}</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
        document.getElementById('modal-ok-btn')!.onclick = hideModal
        return false
      }
    } catch (e) {
      hideModal()
      showModal(`<p>In thất bại (bản ${i + 1}/${count}): ${(e as Error).message}</p><button class="modal-ok-btn" id="modal-ok-btn">OK</button>`)
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

    // Log soi: vì sao in lại đi nhánh event / test / thanh toán
    const t_dbg = configStore.config?.test_photo
    console.log(
      '[reprint] flow:', flowStore.type,
      'booth_type:', localStorage.getItem('booth_type'),
      'test_photo:', String(t_dbg ?? 'null'),
      'qty:', qty,
    )

    if (flowStore.type === 'event') {
      await printCopies(qty)
      return
    }

    // test_photo = 1: ảnh test, in lại thẳng như user kỹ thuật
    {
      const t = configStore.config?.test_photo
      if (t === 1 || t === true || String(t ?? '').trim() === '1') {
        await printCopies(qty)
        return
      }
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
  <div class="fin-root">
    <svg class="fin-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f2b7cb"
        opacity="0.6"
      />
      <path d="M-120,120 C60,140 190,230 170,360" fill="none" stroke="#ef8fae" stroke-width="5" opacity="0.7" />
      <path
        d="M1680,500 C1500,540 1440,660 1470,790 C1490,880 1560,930 1620,960 L1680,960 L1680,500 Z"
        fill="#f2b7cb"
        opacity="0.6"
      />
      <path d="M1560,560 C1450,600 1410,720 1440,840" fill="none" stroke="#ef8fae" stroke-width="5" opacity="0.7" />
    </svg>

    <svg class="fin-heart fin-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>
    <svg class="fin-heart fin-h2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>

    <header class="fin-brand">
      <span class="fin-logo">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z"
            fill="none"
            stroke="#fff"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
          <path
            d="M12 16.2s-3.4-2.1-4.3-4.2c-.5-1.2.1-2.6 1.5-2.6.9 0 1.6.5 2.1 1.4.4-.9 1.2-1.4 2.1-1.4 1.4 0 2 1.4 1.5 2.6-.9 2.1-4.3 4.2-4.3 4.2z"
            fill="#fff"
          />
        </svg>
      </span>
      <span class="fin-brand-text">
        <strong>Tạo Loại Theme</strong>
        <small>Lưu giữ khoảnh khắc đẹp</small>
      </span>
    </header>

    <div class="fin-sign" aria-hidden="true">for your smile ♡</div>

    <main class="fin-card">
      <span class="fin-badge">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>

      <h1 class="fin-title">In ảnh <span>thành công!</span></h1>
      <p class="fin-sub">Cảm ơn bạn đã sử dụng dịch vụ</p>
      <div class="fin-div" aria-hidden="true"><span></span><i>♥</i><span></span></div>

      <div class="fin-panels">
        <div class="fin-panel">
          <div v-if="timeLapsePath" class="tv">
            <span class="tv-ant tv-ant-l"></span>
            <span class="tv-ant tv-ant-r"></span>
            <div class="tv-screen">
              <video :src="`file://${timeLapsePath}`" autoplay muted loop playsinline></video>
            </div>
            <div class="tv-bar">
              <span class="tv-speaker"></span>
              <span class="tv-knob"></span>
              <span class="tv-knob"></span>
            </div>
          </div>
          <img v-else-if="printedImage" class="fin-photo" :src="printedImage" alt="Ảnh đã in" />
          <div v-else class="fin-empty">Chưa có ảnh</div>
          <p class="fin-cap">♥ {{ timeLapsePath ? 'Video của bạn' : 'Ảnh của bạn đã được lưu' }} ♥</p>
        </div>

        <div class="fin-panel">
          <div v-if="qrCode" class="fin-qr">
            <img :src="qrCode" alt="QR tải ảnh" />
          </div>
          <div v-else class="fin-empty">Chưa có mã QR</div>
          <p class="fin-cap">Quét mã để tải ảnh</p>
          <p class="fin-upload" :class="{ 'is-hidden': !showUpload }">
            <span class="fin-upload-text">
              <svg v-if="uploadOk" class="fin-check" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#22c55e" />
                <path
                  d="M8 12.5l2.8 2.8L16.5 9"
                  fill="none"
                  stroke="#fff"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>{{ uploadText || '&nbsp;' }}</span>
            </span>
          </p>
        </div>
      </div>

      <div class="fin-actions">
        <button id="finish-reprint-btn" class="fin-btn fin-btn-primary" type="button" @click="handleReprint">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="9" cy="10" r="1.4" fill="currentColor" />
            <path d="M3.5 15.5l4.5-4 3.5 3 3-2.5 5.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>In thêm ảnh</span>
          <span class="fin-arrow">→</span>
        </button>
        <button id="finish-home-btn" class="fin-btn fin-btn-ghost" type="button" @click="goHome">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 11l8-7 8 7M6.5 9.5V19h11V9.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>Về trang chủ</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.fin-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #f6dbe4;
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fin-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.fin-heart {
  position: absolute;
  z-index: 1;
}
.fin-h1 {
  width: 2.6vmin;
  left: 9%;
  top: 24%;
}
.fin-h2 {
  width: 2.2vmin;
  right: 7%;
  top: 22%;
}
.fin-brand {
  position: absolute;
  top: 3vh;
  left: 3vw;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.9vw;
}
.fin-logo {
  width: 3.4vw;
  height: 3.4vw;
  min-width: 52px;
  min-height: 52px;
  border-radius: 1vw;
  background: linear-gradient(135deg, #f7a9c6, #ef5b8d);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0.5vh 1.5vh rgba(239, 91, 141, 0.4);
}
.fin-logo svg {
  width: 60%;
  height: 60%;
}
.fin-brand-text {
  display: flex;
  flex-direction: column;
}
.fin-brand-text strong {
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 2.2vmin;
  font-weight: 800;
  color: #4a3540;
}
.fin-brand-text small {
  font-size: 1.7vmin;
  font-weight: 600;
  color: #9a8f94;
}
.fin-sign {
  position: absolute;
  top: 3.4vh;
  right: 3vw;
  z-index: 3;
  transform: rotate(-4deg);
  font-family: 'Segoe Script', 'Segoe Print', cursive;
  font-size: 2.6vmin;
  color: #ef8fae;
}
.fin-card {
  position: relative;
  z-index: 2;
  width: min(62vw, 110vh);
  max-height: 92vh;
  overflow: visible;
  background: #fff;
  border-radius: 24px;
  padding: 4.5vh 3vw 3.2vh;
  box-sizing: border-box;
  text-align: center;
  box-shadow: 0 1.4vh 4vh rgba(190, 90, 130, 0.25);
}
.fin-badge {
  position: absolute;
  top: -3.2vh;
  left: 50%;
  transform: translateX(-50%);
  width: 6.4vh;
  height: 6.4vh;
  border-radius: 50%;
  background: linear-gradient(135deg, #f7a9c6, #ef5b8d);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0.6vh 1.8vh rgba(239, 91, 141, 0.5);
}
.fin-badge svg {
  width: 55%;
  height: 55%;
}
.fin-title {
  margin: 0;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 4.2vmin;
  font-weight: 800;
  color: #4a3540;
}
.fin-title span {
  color: #e14e7d;
}
.fin-sub {
  margin: 0.6vh 0 0;
  font-size: 2vmin;
  font-weight: 600;
  color: #9a8f94;
}
.fin-div {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1vw;
  margin: 1.2vh 0 0;
}
.fin-div span {
  width: 9vw;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, #f4a9c6);
}
.fin-div span:last-child {
  background: linear-gradient(90deg, #f4a9c6, transparent);
}
.fin-div i {
  font-style: normal;
  font-size: 1.8vmin;
  color: #f2719b;
}
.fin-panels {
  display: flex;
  gap: 1.6vw;
  margin-top: 2vh;
}
.fin-panel {
  position: relative;
  flex: 1;
  min-width: 0;
  background: #fff5f8;
  border: 1px solid #f4c6d8;
  border-radius: 18px;
  padding: 1.4vh 1vw;
  box-sizing: border-box;
}
.tv {
  position: relative;
  margin-top: 2.6vh;
  background: #fff;
  border: 1px solid #f4c6d8;
  border-radius: 18px;
  padding: 12px 12px 8px;
  box-shadow: 0 0.5vh 1.5vh rgba(239, 91, 141, 0.16);
}
.tv-ant {
  position: absolute;
  top: -2.6vh;
  left: 50%;
  width: 3px;
  height: 3vh;
  background: #f4a9c6;
  border-radius: 2px;
  transform-origin: bottom center;
}
.tv-ant::after {
  content: '';
  position: absolute;
  top: -6px;
  left: -3.5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef6aa0;
}
.tv-ant-l {
  transform: translateX(-1.1vw) rotate(-24deg);
}
.tv-ant-r {
  transform: translateX(1.1vw) rotate(24deg);
}
.tv-screen {
  border-radius: 12px;
  overflow: hidden;
  background: #22222a;
  aspect-ratio: 16 / 10;
}
.tv-screen video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.fin-photo {
  width: 100%;
  aspect-ratio: 16 / 10;
  display: block;
  object-fit: cover;
  border-radius: 12px;
  background: #f6dbe4;
}
.fin-empty {
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #f9e7ee;
  color: #c49aac;
  font-size: 2vmin;
  font-weight: 700;
}
.fin-qr {
  background: #fff;
  border-radius: 12px;
  padding: 8px;
  aspect-ratio: 1 / 1;
  max-height: 30vh;
  margin: 0 auto;
  box-sizing: border-box;
}
.fin-qr img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
.fin-cap {
  margin: 1vh 0 0;
  font-family: 'Baloo 2', 'Nunito', sans-serif;
  font-size: 1.8vmin;
  font-weight: 700;
  color: #c08497;
}
.fin-upload {
  margin: 1.4vh 0 0;
  min-height: 1.4em;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Baloo 2', 'Nunito', sans-serif;
  font-size: 1.8vmin;
  font-weight: 700;
  color: #c08497;
}
.fin-upload-text {
  position: relative;
}
.fin-check {
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  width: 1.2em;
  height: 1.2em;
  margin-right: 0.4em;
}
.fin-upload.is-hidden {
  visibility: hidden;
}
.fin-panel .fin-upload {
  margin-top: 0.6vh;
  font-size: 1.6vmin;
}
.fin-actions {
  display: flex;
  gap: 1.2vw;
  margin-top: 2vh;
}
.fin-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8vw;
  padding: 1.6vh 1vw;
  border-radius: 999px;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 2.2vmin;
  font-weight: 800;
  cursor: pointer;
}
.fin-btn svg {
  width: 2.6vmin;
  height: 2.6vmin;
}
.fin-btn-primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #ef5b8d, #f2709c);
  box-shadow: 0 0.8vh 2.2vh rgba(239, 91, 141, 0.42);
}
.fin-btn-ghost {
  border: 1px solid #f4c6d8;
  color: #b04a68;
  background: #fff;
  box-shadow: 0 0.4vh 1.2vh rgba(239, 91, 141, 0.12);
}
.fin-arrow {
  font-size: 2.4vmin;
  line-height: 1;
}
</style>
