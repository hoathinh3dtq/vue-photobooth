<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '../stores/config'
import { useFlowStore } from '../stores/flow'
import { startTimeLapse } from '../lib/timelapse'

const router = useRouter()
const configStore = useConfigStore()
const flowStore = useFlowStore()

onMounted(() => {
  configStore.fetchConfig().catch(() => {})
})

function goNext(): void {
  void startTimeLapse()
  flowStore.next('home')
}

function logout(): void {
  localStorage.clear()
  router.push('/login')
}
</script>

<template>
  <div class="hb-root">
    <svg class="hb-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f0b9cd"
      />
      <path
        d="M-120,120 C60,140 190,230 170,360"
        fill="none"
        stroke="#f7b8d2"
        stroke-width="5"
      />
      <path
        d="M-80,560 C40,520 150,580 170,700 C190,820 90,900 20,960 L-80,960 L-80,560 Z"
        fill="#f0b9cd"
      />
      <path
        d="M-40,640 C80,620 160,690 165,800"
        fill="none"
        stroke="#f7b8d2"
        stroke-width="5"
      />
      <path
        d="M1680,500 C1500,540 1440,660 1470,790 C1490,880 1560,930 1620,960 L1680,960 L1680,500 Z"
        fill="#f0b9cd"
      />
      <path
        d="M1560,560 C1450,600 1410,720 1440,840"
        fill="none"
        stroke="#f7b8d2"
        stroke-width="5"
      />
    </svg>

    <button
      v-if="configStore.config?.hide_logout_button !== 1"
      class="hb-logout"
      id="logoutBtn"
      type="button"
      aria-label="Đăng xuất"
      @click="logout"
    >
      ✕
    </button>


    <svg class="hb-heart hb-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="hb-heart hb-h2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>
    <svg class="hb-heart hb-h3" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="hb-heart hb-h4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="hb-heart hb-h5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>

    <main class="hb-main">
      <svg class="hb-camera" viewBox="0 0 340 250" aria-hidden="true">
        <ellipse cx="170" cy="222" rx="95" ry="12" fill="#f3c6d8" opacity="0.8" />
        <rect x="118" y="52" width="52" height="30" rx="9" fill="#ffffff" stroke="#f191b8" stroke-width="6" />
        <circle cx="252" cy="60" r="11" fill="#f191b8" />
        <rect x="60" y="80" width="220" height="128" rx="28" fill="#ffffff" stroke="#f191b8" stroke-width="6" />
        <path d="M60,150 h220 v30 a28,28 0 0 1 -28,28 h-164 a28,28 0 0 1 -28,-28 Z" fill="#ffc9de" />
        <rect x="84" y="100" width="20" height="13" rx="5" fill="#f9b1cd" />
        <circle cx="170" cy="148" r="46" fill="#ffffff" stroke="#f191b8" stroke-width="6" />
        <circle cx="170" cy="148" r="31" fill="#6b5566" />
        <circle cx="170" cy="148" r="19" fill="#46334a" />
        <circle cx="160" cy="138" r="7" fill="#ffffff" opacity="0.85" />
        <path
          d="M240 118s-4.5-2.8-5.7-5.6c-.7-1.6.3-3.4 2.1-3.4 1.2 0 2.1.7 2.7 1.8.6-1.1 1.5-1.8 2.7-1.8 1.8 0 2.8 1.8 2.1 3.4-1.2 2.8-5.7 5.6-5.7 5.6z"
          fill="#f2719b"
        />
        <path
          d="M100 176s-4.5-2.8-5.7-5.6c-.7-1.6.3-3.4 2.1-3.4 1.2 0 2.1.7 2.7 1.8.6-1.1 1.5-1.8 2.7-1.8 1.8 0 2.8 1.8 2.1 3.4-1.2 2.8-5.7 5.6-5.7 5.6z"
          fill="#f2719b"
        />
        <path d="M292 40l3.2 8.2 8.2 3.2-8.2 3.2-3.2 8.2-3.2-8.2-8.2-3.2 8.2-3.2z" fill="#f4a9c6" />
        <path d="M48 66l2.4 6.2 6.2 2.4-6.2 2.4-2.4 6.2-2.4-6.2-6.2-2.4 6.2-2.4z" fill="#f4a9c6" />
        <path d="M66 96l-9 3M258 96l9 3M62 190l-8 6M262 190l8 6" stroke="#f4a9c6" stroke-width="5" stroke-linecap="round" />
      </svg>

      <h1 class="hb-title">Chụp ảnh</h1>
      <h2 class="hb-sub">cùng nhau nhé!</h2>
      <p class="hb-desc">
        Lưu giữ những khoảnh khắc đẹp nhất của bạn<br />
        bằng những bức ảnh xinh xắn!
      </p>

      <button class="hb-cta" id="startBtn" type="button" @click="goNext">
        <span class="hb-cta-text">Chạm để bắt đầu</span>
      </button>
    </main>

    <div class="hb-sign" aria-hidden="true">for your smile ♡</div>
  </div>
</template>

<style scoped>
@font-face {
  font-family: 'Great Vibes';
  src: url('/assets/fonts/GreatVibes-Regular.ttf') format('truetype');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Bong Gio';
  src: url('/assets/fonts/BongGio-Regular.ttf') format('truetype');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Dancing Script';
  src: url('/assets/fonts/DancingScript.ttf') format('truetype');
  font-weight: 100 1000;
  font-display: swap;
}
@font-face {
  font-family: 'Baloo 2';
  src: url('/assets/fonts/Baloo2.ttf') format('truetype');
  font-weight: 100 1000;
  font-display: swap;
}
@font-face {
  font-family: 'Nunito';
  src: url('/assets/fonts/Nunito.ttf') format('truetype');
  font-weight: 100 1000;
  font-display: swap;
}
.hb-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #f2d3de;
  font-family: 'Segoe UI', Arial, sans-serif;
}
.hb-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.hb-logout {
  position: absolute;
  top: 2.5vh;
  right: 2.5vw;
  z-index: 5;
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
.hb-heart {
  position: absolute;
  z-index: 1;
}
.hb-h1 {
  width: 3.2vmin;
  left: 30%;
  top: 30%;
}
.hb-h2 {
  width: 2.2vmin;
  left: 9%;
  bottom: 12%;
}
.hb-h3 {
  width: 3.6vmin;
  right: 6%;
  top: 52%;
}
.hb-h4 {
  width: 2.6vmin;
  left: 22%;
  top: 55%;
}
.hb-h5 {
  width: 3vmin;
  right: 30%;
  top: 14%;
}
.hb-main {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2vh 4vw;
  box-sizing: border-box;
}
.hb-camera {
  width: min(34vmin, 46vh);
  height: auto;
  margin-bottom: 0.5vh;
}
.hb-title {
  margin: 0;
  font-family: 'Dancing Script', 'Segoe Script', cursive;
  font-size: 9vmin;
  font-weight: 700;
  line-height: 1.1;
  color: #e14e7f;
}
.hb-sub {
  margin: 0.5vh 0 0;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 4.6vmin;
  font-weight: 800;
  color: #4a4a4a;
}
.hb-desc {
  margin: 1.6vh 0 0;
  font-family: 'Nunito', 'Segoe UI', sans-serif;
  font-weight: 600;
  font-size: 2.3vmin;
  line-height: 1.6;
  color: #9a8f94;
}
.hb-cta {
  margin-top: 3vh;
  border: none;
  cursor: pointer;
  background: none;
  padding: 1vh 2vw;
  width: 100%;
  text-align: center;
  animation: hb-float 2s ease-in-out infinite;
}
.hb-cta-text {
  display: inline-block;
  font-family: 'Great Vibes', 'Segoe Script', cursive;
  font-size: 10vmin;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: #e14e7f;
  transform: translateX(-1.8vmin) skewX(-6deg) scaleX(1.2);
  filter: drop-shadow(0.4vmin 0.4vmin 0 #f9c3d7);
}
@keyframes hb-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-1.2vh);
  }
}
.hb-sign {
  position: absolute;
  right: 4vw;
  bottom: 4vh;
  z-index: 2;
  transform: rotate(-6deg);
  font-family: 'Segoe Script', 'Segoe Print', 'Comic Sans MS', cursive;
  font-size: 3vmin;
  color: #ef8fae;
}
</style>
