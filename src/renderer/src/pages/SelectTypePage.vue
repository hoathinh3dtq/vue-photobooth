<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listCategories, type Category } from '../lib/api/categories'
import { STORAGE_URL } from '../lib/api/client'
import { useSelectionStore } from '../stores/selection'
import FlowerLoader from '../components/FlowerLoader.vue'

const router = useRouter()
const selectionStore = useSelectionStore()

const categories = ref<Category[]>([])
const loading = ref(true)
const error = ref('')
const selectedId = ref<number | string | null>(null)

function thumbUrl(cat: Category): string {
  let url = cat.thumbnail_url || ''
  if (url && !url.startsWith('http')) url = `${STORAGE_URL}/${url.replace(/^\//, '')}`
  return url || `/assets/theme_${cat.type}.png`
}

function priceText(cat: Category): string {
  if (!cat.price || cat.price <= 0) return ''
  return cat.price.toLocaleString('vi-VN')
}

function typeIcon(cat: Category): string {
  const n = cat.total_photo && cat.total_photo > 0 ? cat.total_photo : cat.type === '2x6' ? 2 : 4
  const cols = n <= 2 ? 1 : 2
  const rows = Math.ceil(n / cols)
  const W = 44
  const H = 60
  const gap = 5
  const cw = (W - gap * (cols + 1)) / cols
  const ch = (H - gap * (rows + 1)) / rows
  let cells = ''
  for (let i = 0; i < n; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = gap + c * (cw + gap)
    const y = gap + r * (ch + gap)
    cells += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="4" fill="#f8bbd0"/>`
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" aria-hidden="true"><rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="9" fill="#ffffff" stroke="#f06292" stroke-width="3"/>${cells}</svg>`
}

const activeCat = computed<Category | null>(() => {
  if (categories.value.length === 0) return null
  return categories.value.find((c) => c.id === selectedId.value) || categories.value[0]
})

const activeThumb = computed(() => (activeCat.value ? thumbUrl(activeCat.value) : ''))

function step(direction: number): void {
  if (categories.value.length === 0) return
  const idx = Math.max(
    0,
    categories.value.findIndex((c) => (selectedId.value === null ? true : c.id === selectedId.value)),
  )
  const next = (idx + direction + categories.value.length) % categories.value.length
  selectedId.value = categories.value[next].id
}

function goHome(): void {
  router.push('/home')
}

function select(cat: Category): void {
  selectedId.value = cat.id
  selectionStore.select(cat)
}

function proceed(): void {
  const cat = activeCat.value
  if (!cat) return
  selectionStore.select(cat)
  router.push(selectionStore.typeIdol === 1 ? '/idol-theme' : '/camera')
}

onMounted(async () => {
  try {
    const userId = Number(localStorage.getItem('user_id')) || 1
    categories.value = await listCategories(userId)
    if (categories.value.length > 0) selectedId.value = categories.value[0].id
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="st-root">
    <svg class="st-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f0b9cd"
      />
      <path d="M-120,120 C60,140 190,230 170,360" fill="none" stroke="#f7b8d2" stroke-width="5" />
      <path
        d="M1680,500 C1500,540 1440,660 1470,790 C1490,880 1560,930 1620,960 L1680,960 L1680,500 Z"
        fill="#f0b9cd"
      />
      <path d="M1560,560 C1450,600 1410,720 1440,840" fill="none" stroke="#f7b8d2" stroke-width="5" />
    </svg>

    <svg class="st-heart st-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="st-heart st-h2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>

    <button type="button" class="st-back-btn" @click="goHome">← Quay lại</button>
    <FlowerLoader v-if="loading" />
    <p v-else-if="error" class="st-hint st-error">{{ error }}</p>
    <p v-else-if="categories.length === 0" class="st-hint">Chưa có loại ảnh nào cho booth này</p>

    <template v-else>
      <header class="st-head">
        <h1>Chọn mẫu ảnh</h1>
        <p>Vui lòng chọn bố cục bạn muốn sử dụng</p>
      </header>

      <div class="st-main">
        <div class="st-types">
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="st-type"
            :class="{ 'is-selected': selectedId === cat.id }"
            @click="select(cat)"
          >
            <span class="st-type-icon" v-html="typeIcon(cat)"></span>
            <span class="st-type-text">
              <strong>{{ cat.type_name }}</strong>
              <small v-if="priceText(cat)" class="st-price">{{ priceText(cat) }}</small>
            </span>
          </button>
        </div>

        <button type="button" class="st-nav" aria-label="Mẫu trước" @click="step(-1)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>

        <div class="st-preview">
          <img v-if="activeThumb" :src="activeThumb" :alt="activeCat?.type_name || ''" />
        </div>

        <button type="button" class="st-nav" aria-label="Mẫu tiếp" @click="step(1)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <button v-if="activeCat" type="button" class="st-pill" @click="proceed()">{{ activeCat.type_name }}</button>

      <div class="st-sign" aria-hidden="true">for your smile ♡</div>
    </template>
  </div>
</template>

<style scoped>
.st-back-btn {
  position: absolute;
  top: 2vh;
  left: 2vw;
  z-index: 20;
  padding: 10px 18px;
  border: 1.5px solid rgba(225, 78, 127, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
  color: #e14e7f;
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.st-back-btn:hover { background: #fff; }

.st-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #f2d3de;
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3vh 3vw;
  box-sizing: border-box;
}
.st-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.st-heart {
  position: absolute;
  z-index: 1;
}
.st-h1 {
  width: 3vmin;
  left: 8%;
  top: 26%;
}
.st-h2 {
  width: 2.4vmin;
  right: 6%;
  top: 20%;
}
.st-hint {
  position: relative;
  z-index: 2;
  margin: auto;
  font-size: 2.4vmin;
  color: #9a8f94;
}
.st-error {
  color: #d14e7d;
}
.st-head {
  position: relative;
  z-index: 2;
  text-align: center;
  margin-bottom: 2vh;
}
.st-head h1 {
  margin: 0;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 5.4vmin;
  font-weight: 800;
  color: #5b3a44;
}
.st-head p {
  margin: 0.6vh 0 0;
  font-size: 2.2vmin;
  font-weight: 600;
  color: #9a8f94;
}
.st-main {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2vw;
}
.st-types {
  width: 24vw;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.8vh;
  padding: 4px;
  scrollbar-width: none;
}
.st-types::-webkit-scrollbar {
  display: none;
}
.st-type {
  display: flex;
  align-items: center;
  gap: 1.2vw;
  padding: 1.6vh 1.2vw;
  border-radius: 18px;
  border: 2px solid transparent;
  background: #fff;
  box-shadow: 0 0.5vh 1.6vh rgba(239, 91, 141, 0.12);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.st-type.is-selected {
  border-color: #f06292;
  background: #fff5f8;
  box-shadow: 0 0.6vh 2vh rgba(239, 91, 141, 0.25);
}
.st-type-icon {
  flex: 0 0 auto;
  width: 3.4vw;
  height: 4.6vh;
  display: block;
}
.st-type-text {
  display: flex;
  flex-direction: column;
  gap: 0.3vh;
}
.st-type-text strong {
  font-size: 2.6vmin;
  font-weight: 800;
  color: #5b3a44;
}
.st-type-text small {
  font-size: 1.9vmin;
  font-weight: 600;
  color: #9a8f94;
}
.st-type-text .st-price {
  color: #e14e7f;
  font-weight: 800;
}
.st-nav {
  flex: 0 0 auto;
  width: 3.4vw;
  height: 3.4vw;
  min-width: 48px;
  min-height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #f7a9c6, #f27ba4);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0.5vh 1.6vh rgba(239, 91, 141, 0.35);
  animation: st-float 2s ease-in-out infinite;
}
.st-nav svg {
  width: 42%;
  height: 42%;
}
.st-nav:active {
  transform: scale(0.94);
}
@keyframes st-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-0.8vh);
  }
}
.st-preview {
  height: 100%;
  max-height: 56vh;
  aspect-ratio: 3 / 4;
  background: #fff;
  border-radius: 22px;
  padding: 1.2vh;
  box-sizing: border-box;
  box-shadow: 0 1vh 3vh rgba(239, 91, 141, 0.22);
  border: 1px solid #f4c6d8;
  cursor: pointer;
}
.st-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  border-radius: 14px;
  background: #fdf0f4;
}
.st-pill {
  position: relative;
  z-index: 2;
  margin-top: 2vh;
  padding: 1vh 3.4vw;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #ef5b8d, #f2709c);
  color: #fff;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 2.6vmin;
  font-weight: 800;
  box-shadow: 0 0.6vh 1.8vh rgba(239, 91, 141, 0.4);
  cursor: pointer;
}
.st-pill:active {
  transform: scale(0.97);
}
.st-sign {
  position: absolute;
  right: 3.5vw;
  bottom: 3vh;
  z-index: 2;
  transform: rotate(-6deg);
  font-family: 'Segoe Script', 'Segoe Print', cursive;
  font-size: 2.6vmin;
  color: #ef8fae;
}
</style>
