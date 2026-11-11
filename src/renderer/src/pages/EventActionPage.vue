<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFlowStore } from '../stores/flow'
import { startTimeLapse } from '../lib/timelapse'

const flowStore = useFlowStore()
const router = useRouter()

const selected = ref<'new' | 'print' | null>(null)
let navTimer: ReturnType<typeof setTimeout> | null = null

function newCapture(): void {
  void startTimeLapse()
  flowStore.go('camera')
}

function printExisting(): void {
  flowStore.go('list-event-images')
}

function choose(which: 'new' | 'print'): void {
  if (navTimer) return
  selected.value = which
  navTimer = setTimeout(() => {
    if (which === 'new') newCapture()
    else printExisting()
  }, 320)
}

function logout(): void {
  localStorage.clear()
  router.push('/login')
}

// Nút ⚙ ẩn: bấm 5 lần trong 3 giây mới vào cài đặt (giống Home)
let settingsClickCount = 0
let settingsClickTimer: ReturnType<typeof setTimeout> | null = null
function handleSettingsClick(): void {
  settingsClickCount += 1
  if (settingsClickCount >= 5) {
    if (settingsClickTimer) { clearTimeout(settingsClickTimer); settingsClickTimer = null }
    settingsClickCount = 0
    router.push('/settings')
    return
  }
  if (settingsClickTimer) clearTimeout(settingsClickTimer)
  settingsClickTimer = setTimeout(() => { settingsClickCount = 0; settingsClickTimer = null }, 3000)
}
</script>

<template>
  <div class="ea-root">
    <button class="ea-logout" type="button" aria-label="Đăng xuất" @click="logout" style="right: 7vw;">✕</button>
    <button class="ea-logout" id="eventSettingsBtn" type="button" aria-label="Cài đặt" @click="handleSettingsClick" style="right: 2.5vw;">⚙</button>
    <svg class="ea-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f4c9d8"
      />
      <path
        d="M1680,560 C1500,600 1440,720 1470,840 C1490,910 1550,940 1610,960 L1680,960 L1680,560 Z"
        fill="#f4c9d8"
      />
    </svg>

    <svg class="ea-heart ea-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="ea-heart ea-h2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>
    <svg class="ea-spark ea-s1" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="#f4a9c6" />
    </svg>

    <div class="ea-sign ea-sign-tr" aria-hidden="true">for your smile ♡</div>
    <div class="ea-sign ea-sign-bl" aria-hidden="true">Smile More ♡</div>

    <header class="ea-head">
      <span class="ea-logo">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z"
            fill="none"
            stroke="#fff"
            stroke-width="2.2"
            stroke-linejoin="round"
          />
          <path
            d="M12 16.2s-3.4-2.1-4.3-4.2c-.5-1.2.1-2.6 1.5-2.6.9 0 1.6.5 2.1 1.4.4-.9 1.2-1.4 2.1-1.4 1.4 0 2 1.4 1.5 2.6-.9 2.1-4.3 4.2-4.3 4.2z"
            fill="#fff"
          />
        </svg>
      </span>
      <span class="ea-head-text">
        <strong>Chọn hình thức<br /><em>chụp ảnh</em></strong>
        <small>Vui lòng chọn chế độ bạn muốn sử dụng</small>
      </span>
    </header>

    <div class="ea-actions">
      <button
        type="button"
        class="ea-card"
        :class="{ 'is-selected': selected === 'new' }"
        @click="choose('new')"
      >
        <svg class="ea-deco-heart" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
            fill="none"
            stroke="#f4a9c6"
            stroke-width="2.2"
          />
        </svg>
        <span class="ea-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z"
              fill="none"
              stroke="#fff"
              stroke-width="2.2"
              stroke-linejoin="round"
            />
            <path
              d="M12 16.2s-3.4-2.1-4.3-4.2c-.5-1.2.1-2.6 1.5-2.6.9 0 1.6.5 2.1 1.4.4-.9 1.2-1.4 2.1-1.4 1.4 0 2 1.4 1.5 2.6-.9 2.1-4.3 4.2-4.3 4.2z"
              fill="#fff"
            />
          </svg>
        </span>
        <span class="ea-title">Chụp ảnh <em>mới</em></span>
        <span class="ea-desc">Bắt đầu chụp những khoảnh khắc đáng nhớ của bạn</span>
        <span class="ea-check" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="#fff"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </button>

      <button
        type="button"
        class="ea-card"
        :class="{ 'is-selected': selected === 'print' }"
        @click="choose('print')"
      >
        <svg class="ea-deco-heart" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
            fill="none"
            stroke="#f4a9c6"
            stroke-width="2.2"
          />
        </svg>
        <span class="ea-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 8V3.5h10V8M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-6A1.5 1.5 0 0 1 4.5 8h15A1.5 1.5 0 0 1 21 9.5v6a1.5 1.5 0 0 1-1.5 1.5H17M7 13.5h10v7H7z"
              fill="none"
              stroke="#fff"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M12 18.6s-1.7-1-2.1-2c-.3-.6 0-1.3.7-1.3.5 0 .8.3 1 .7.2-.4.6-.7 1-.7.7 0 1 .7.7 1.3-.4 1-2.1 2-2.1 2z"
              fill="#fff"
            />
          </svg>
        </span>
        <span class="ea-title">In ảnh <em>đã chụp</em></span>
        <span class="ea-desc">Xem lại và in những bức ảnh đã chụp trước đó</span>
        <span class="ea-check" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="#fff"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ea-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #f9e7ee;
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4vh;
  padding: 3vh 3vw;
  box-sizing: border-box;
}
.ea-logout {
  position: absolute;
  top: 2.5vh;
  z-index: 6;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(242, 113, 155, 0.4);
  background: rgba(255, 255, 255, 0.7);
  color: #d14e7d;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.55;
}
.ea-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ea-heart {
  position: absolute;
  z-index: 1;
}
.ea-h1 {
  width: 2.6vmin;
  left: 9%;
  top: 26%;
}
.ea-h2 {
  width: 2.2vmin;
  right: 8%;
  top: 62%;
}
.ea-spark {
  position: absolute;
  z-index: 1;
  width: 2.6vmin;
  right: 12%;
  top: 18%;
}
.ea-sign {
  position: absolute;
  z-index: 2;
  font-family: 'Segoe Script', 'Segoe Print', cursive;
  font-size: 2.6vmin;
  color: #ef8fae;
}
.ea-sign-tr {
  top: 3vh;
  right: 3vw;
  transform: rotate(-4deg);
}
.ea-sign-bl {
  left: 3.5vw;
  bottom: 3vh;
  transform: rotate(-6deg);
}
.ea-head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 1.4vw;
}
.ea-logo {
  width: 4.6vw;
  height: 4.6vw;
  min-width: 64px;
  min-height: 64px;
  border-radius: 1.2vw;
  background: linear-gradient(135deg, #f2709c, #e14e7f);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 0 0 3px rgba(255, 255, 255, 0.35),
    0 0.6vh 1.8vh rgba(225, 78, 127, 0.5);
}
.ea-logo svg {
  width: 62%;
  height: 62%;
}
.ea-head-text {
  display: flex;
  flex-direction: column;
  text-align: left;
}
.ea-head-text strong {
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 4.6vmin;
  font-weight: 800;
  line-height: 1.15;
  color: #4a3540;
}
.ea-head-text strong em {
  font-style: normal;
  color: #e14e7d;
}
.ea-head-text small {
  margin-top: 0.6vh;
  font-size: 2vmin;
  font-weight: 600;
  color: #9a8f94;
}
.ea-actions {
  position: relative;
  z-index: 2;
  display: flex;
  gap: 3vw;
}
.ea-card {
  position: relative;
  width: min(26vw, 420px);
  padding: 3.4vh 2vw 4vh;
  box-sizing: border-box;
  border-radius: 24px;
  border: 2px solid transparent;
  background: #fff;
  box-shadow: 0 1vh 3vh rgba(190, 100, 140, 0.18);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4vh;
  font-family: inherit;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.ea-card:hover {
  transform: translateY(-0.5vh);
  border-color: #f4a9c6;
}
.ea-card.is-selected {
  border-color: #ef5b8d;
  box-shadow: 0 1.2vh 3.2vh rgba(239, 91, 141, 0.35);
}
.ea-deco-heart {
  position: absolute;
  top: 1.4vh;
  left: 1.2vw;
  width: 2.2vmin;
  opacity: 0.9;
}
.ea-icon {
  width: 8.5vh;
  height: 8.5vh;
  border-radius: 50%;
  background: linear-gradient(135deg, #f2709c, #e14e7f);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 0 0 3px rgba(255, 255, 255, 0.35),
    0 0.6vh 1.8vh rgba(225, 78, 127, 0.5);
}
.ea-icon svg {
  width: 52%;
  height: 52%;
}
.ea-title {
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 3vmin;
  font-weight: 800;
  color: #4a3540;
}
.ea-title em {
  font-style: normal;
  color: #e14e7f;
}
.ea-desc {
  font-size: 1.9vmin;
  font-weight: 600;
  line-height: 1.55;
  color: #9a8f94;
  max-width: 22vw;
}
.ea-check {
  position: absolute;
  left: 50%;
  bottom: -2.4vh;
  transform: translateX(-50%) scale(0);
  width: 4.6vh;
  height: 4.6vh;
  border-radius: 50%;
  background: linear-gradient(135deg, #f7a9c6, #ef5b8d);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0.5vh 1.5vh rgba(239, 91, 141, 0.5);
  transition: transform 0.22s ease;
}
.ea-card.is-selected .ea-check {
  transform: translateX(-50%) scale(1);
}
.ea-check svg {
  width: 55%;
  height: 55%;
}
</style>
