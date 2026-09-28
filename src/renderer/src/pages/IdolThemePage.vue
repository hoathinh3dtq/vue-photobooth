<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { listThemesByCategory, type ThemeItem } from '../lib/api/themes'
import { STORAGE_URL } from '../lib/api/client'
import FlowerLoader from '../components/FlowerLoader.vue'
import { useSelectionStore, normalizeIdolSide, type IdolIcon } from '../stores/selection'

interface IdolThemeCard {
  id: number | string
  frameUrl: string
  icons: Array<{ id: number | string; url: string; side: 'left' | 'right' }>
  idolName: string
}

const router = useRouter()
const selectionStore = useSelectionStore()

const cards = ref<IdolThemeCard[]>([])
const loading = ref(true)
const error = ref('')
const brokenFrames = ref<Array<number | string>>([])
const brokenIcons = ref<string[]>([])
const gridRef = ref<HTMLDivElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let gridScrollBound = false

function updateScrollGrid(): void {
  const el = gridRef.value
  if (!el) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  canScrollLeft.value = el.scrollLeft > 4
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
}

function attachGridScroll(): void {
  const el = gridRef.value
  if (!el || gridScrollBound) return
  el.addEventListener('scroll', updateScrollGrid, { passive: true })
  gridScrollBound = true
}

function scrollGrid(direction: number): void {
  const el = gridRef.value
  if (!el) return
  el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
}

function markIconBroken(url: string): void {
  if (import.meta.env.DEV) console.warn('[idol-theme] icon load failed:', url)
  if (!brokenIcons.value.includes(url)) brokenIcons.value.push(url)
}

function isBroken(id: number | string): boolean {
  return brokenFrames.value.includes(id)
}

function markBroken(id: number | string, url: string): void {
  if (import.meta.env.DEV) console.warn('[idol-theme] frame load failed:', url)
  if (!brokenFrames.value.includes(id)) brokenFrames.value.push(id)
}

function resolveUrl(url: unknown): string {
  const u = String(url || '')
  if (!u) return ''
  if (u.startsWith('http')) return u
  return `${STORAGE_URL}/${u.replace(/^\//, '')}`
}

function pickField(item: ThemeItem, keys: string[]): unknown {
  for (const k of keys) {
    const v = item[k]
    if (v) return v
  }
  const detail = item.detail as Record<string, unknown> | undefined
  if (detail) {
    for (const k of keys) {
      const v = detail[k]
      if (v) return v
    }
  }
  return ''
}

function extractIcons(item: ThemeItem): Array<{ id: number | string; url: string; side: 'left' | 'right' }> {
  const raw = pickField(item, ['idol_icons', 'idolIcons', 'icons'])
  if (!Array.isArray(raw)) return []
  // Thứ tự icon giữ nguyên BE trả về; idol gắn theo capturedIndex của từng ảnh
  return (raw as Array<Record<string, unknown>>)
    .map((it, i) => {
      const url = resolveUrl(it.image_url ?? it.src ?? it.url)
      if (!url) return null
      return {
        id: (it.id as number | string) ?? i,
        url,
        side: normalizeIdolSide(it.side ?? it.position ?? it.pos ?? it.align),
      }
    })
    .filter((it): it is { id: number | string; url: string; side: 'left' | 'right' } => it !== null)
}

function toCard(item: ThemeItem): IdolThemeCard {
  return {
    id: item.id,
    frameUrl: resolveUrl(
      pickField(item, ['thumbnail_url', 'thumbnail', 'thumb_url', 'image_url', 'image', 'processedSrc', 'src']),
    ),
    icons: extractIcons(item),
    idolName: String(pickField(item, ['theme_name', 'idol_name', 'idol', 'name', 'title']) ?? ''),
  }
}

function extractItems(res: unknown): ThemeItem[] {
  if (Array.isArray(res)) return res as ThemeItem[]
  const r = res as { data?: unknown[]; themes?: unknown[] }
  return ((r?.data || r?.themes || []) as ThemeItem[]) || []
}

async function load(): Promise<void> {
  try {
    const res = await listThemesByCategory(selectionStore.categoryId || null, 1, 20, null)
    const raw = extractItems(res)
    if (import.meta.env.DEV && raw.length > 0) {
      console.log('[idol-theme] sample item:', JSON.stringify(raw[0]).slice(0, 800))
    }
    cards.value = raw.map(toCard).filter((c) => c.frameUrl)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function choose(card: IdolThemeCard): void {
  const icons: IdolIcon[] = card.icons.map((icon) => ({ url: icon.url, side: icon.side }))
  selectionStore.saveIdolTheme(`theme-${card.id}`, card.frameUrl, icons)
  router.push('/camera')
}

function goBack(): void {
  router.push('/select-type')
}

onMounted(() => {
  if (!selectionStore.categoryId) {
    router.replace('/select-type')
    return
  }
  window.addEventListener('resize', updateScrollGrid)
  void load().finally(() => {
    void nextTick(() => {
      attachGridScroll()
      updateScrollGrid()
    })
  })
})

watch(cards, async () => {
  await nextTick()
  attachGridScroll()
  updateScrollGrid()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScrollGrid)
})
</script>

<template>
  <div class="idol-layout">
    <svg class="idol-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path
        d="M-80,-60 C160,-40 260,60 230,180 C200,300 60,320 -40,380 L-80,940 L-80,-60 Z"
        fill="#f0b9cd"
      />
      <path d="M-120,120 C60,140 190,230 170,360" fill="none" stroke="#ef8fae" stroke-width="5" />
      <path
        d="M1680,500 C1500,540 1440,660 1470,790 C1490,880 1560,930 1620,960 L1680,960 L1680,500 Z"
        fill="#f0b9cd"
      />
      <path d="M1560,560 C1450,600 1410,720 1440,840" fill="none" stroke="#ef8fae" stroke-width="5" />
    </svg>
    <svg class="idol-heart idol-h1" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="none"
        stroke="#f2719b"
        stroke-width="1.8"
      />
    </svg>
    <svg class="idol-heart idol-h2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
        fill="#f2719b"
      />
    </svg>
    <header class="idol-head">
      <h1>Chọn idol</h1>
      <p>Chạm vào theme để chụp cùng idol</p>
    </header>
    <FlowerLoader v-if="loading" />
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="cards.length === 0" class="hint">Chưa có theme idol nào</p>

    <div v-else class="idol-main">
      <button v-show="canScrollLeft || canScrollRight" type="button" class="idol-nav idol-nav-left" aria-label="Theme trước" @click="scrollGrid(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div ref="gridRef" class="idol-grid">
      <button
        v-for="card in cards"
        :key="card.id"
        type="button"
        class="idol-card"
        @click="choose(card)"
      >
        <p class="idol-title">{{ card.idolName || 'Idol theme' }}</p>
        <div class="idol-body">
          <div class="idol-frame-wrap">
            <img
              v-if="!isBroken(card.id)"
              class="idol-frame"
              :src="card.frameUrl"
              :alt="card.idolName || 'Idol theme'"
              @error="markBroken(card.id, card.frameUrl)"
            />
            <div v-else class="idol-frame-missing">{{ card.idolName || '?' }}</div>
          </div>
          <div class="idol-icons">
            <template v-for="icon in card.icons" :key="icon.id">
              <div v-if="!brokenIcons.includes(icon.url)" class="idol-icon-box">
                <img :src="icon.url" alt="" @error="markIconBroken(icon.url)" />
              </div>
            </template>
          </div>
        </div>
      </button>
      </div>
      <button v-show="canScrollLeft || canScrollRight" type="button" class="idol-nav idol-nav-right" aria-label="Theme tiếp" @click="scrollGrid(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <button type="button" class="idol-back" @click="goBack">Quay lại</button>
    <div class="idol-sign" aria-hidden="true">for your smile ♡</div>
  </div>
</template>

<style scoped>
.idol-layout {
  position: fixed;
  inset: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding: 3vh 3vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6vh;
  background: #f2d3de;
  font-family: 'Nunito', 'Segoe UI', Arial, sans-serif;
}
.idol-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.idol-heart {
  position: absolute;
  z-index: 1;
}
.idol-h1 {
  width: 3vmin;
  left: 7%;
  top: 24%;
}
.idol-h2 {
  width: 2.4vmin;
  right: 6%;
  top: 20%;
}
.idol-head {
  position: relative;
  z-index: 2;
  text-align: center;
}
.idol-head h1 {
  margin: 0;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 5vmin;
  font-weight: 800;
  color: #5b3a44;
}
.idol-head p {
  margin: 0.5vh 0 0;
  font-size: 2.1vmin;
  font-weight: 600;
  color: #9a8f94;
}
.hint {
  position: relative;
  z-index: 2;
  margin: auto;
  font-size: 2.2vmin;
  font-weight: 600;
  color: #9a8f94;
  text-align: center;
}
.hint.error {
  color: #d14e7d;
}
.idol-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1.4vw;
  position: relative;
  z-index: 2;
}
.idol-grid {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  gap: 1.6vw;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 6px;
  scrollbar-width: none;
  position: relative;
  z-index: 2;
}
.idol-grid::-webkit-scrollbar {
  display: none;
}
.idol-nav {
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
}
.idol-nav svg {
  width: 42%;
  height: 42%;
}
.idol-nav-left,
.idol-nav-right {
  animation: idol-float 2s ease-in-out infinite;
}
@keyframes idol-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-0.8vh);
  }
}
.idol-card {
  flex: 0 0 auto;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 2px solid transparent;
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
  padding: 10px;
  box-shadow: 0 0.6vh 1.8vh rgba(239, 91, 141, 0.16);
  font-family: inherit;
}
.idol-card:hover {
  border-color: #f06292;
  transform: translateY(-0.4vh);
  box-shadow: 0 1vh 2.4vh rgba(239, 91, 141, 0.3);
}
.idol-title {
  margin: 0 0 8px;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 2.2vmin;
  font-weight: 800;
  color: #5b3a44;
  text-align: center;
}
.idol-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 10px;
}
.idol-frame-wrap {
  flex: 0 0 auto;
  flex-shrink: 0;
  min-width: 0;
  width: 26vh;
  max-width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #fdf0f4;
}
.idol-frame {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.idol-frame-missing {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0 1vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Baloo 2', 'Segoe UI', sans-serif;
  font-size: 3vmin;
  font-weight: 800;
  color: #e14e7f;
}
.idol-icons {
  flex: 0 0 auto;
  flex-shrink: 0;
  width: 12vh;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.idol-icon-box {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: #fdf0f4;
  border: 1px solid #f7dce6;
}
.idol-icon-box img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.idol-back {
  position: relative;
  z-index: 2;
  font-family: 'Nunito', 'Segoe UI', sans-serif;
  font-size: 2vmin;
  font-weight: 800;
  color: #d14e7d;
  background: #fff;
  border: 1px solid #f4a9c6;
  padding: 1.1vh 3vw;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 0.4vh 1.2vh rgba(239, 91, 141, 0.15);
}
.idol-sign {
  position: absolute;
  right: 3vw;
  bottom: 2.6vh;
  z-index: 2;
  transform: rotate(-6deg);
  font-family: 'Segoe Script', 'Segoe Print', cursive;
  font-size: 2.4vmin;
  color: #ef8fae;
}
</style>
