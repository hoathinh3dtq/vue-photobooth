<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listThemesByCategory, type ThemeItem } from '../lib/api/themes'
import { STORAGE_URL } from '../lib/api/client'
import { useSelectionStore } from '../stores/selection'

interface IdolThemeCard {
  id: number | string
  frameUrl: string
  icons: Array<{ id: number | string; url: string }>
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

function extractIcons(item: ThemeItem): Array<{ id: number | string; url: string }> {
  const raw = pickField(item, ['idol_icons', 'idolIcons', 'icons'])
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>)
    .map((it, i) => ({
      id: (it.id as number | string) ?? i,
      url: resolveUrl(it.image_url ?? it.src ?? it.url),
    }))
    .filter((it) => it.url)
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
  selectionStore.selectedTheme = `theme-${card.id}`
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
  void load()
})
</script>

<template>
  <div class="idol-layout">
    <p v-if="loading" class="hint">Đang tải theme idol...</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="cards.length === 0" class="hint">Chưa có theme idol nào</p>

    <div v-else class="idol-main">
      <button type="button" class="idol-nav" aria-label="Theme trước" @click="scrollGrid(-1)">&#8249;</button>
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
      <button type="button" class="idol-nav" aria-label="Theme tiếp" @click="scrollGrid(1)">&#8250;</button>
    </div>

    <button type="button" class="idol-back" @click="goBack">Quay lại</button>
  </div>
</template>

<style scoped>
.idol-layout {
  height: 100vh;
  box-sizing: border-box;
  padding: 50px 3vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2vh;
  overflow: hidden;
}
.hint {
  font-size: 1.4vw;
  opacity: 0.8;
}
.hint.error {
  color: #ff5f7e;
}
.idol-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 1vw;
}
.idol-grid {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  gap: 1.5vw;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px;
}
.idol-nav {
  flex: 0 0 auto;
  font-size: 2.5vw;
  line-height: 1;
  padding: 1vh 1vw;
  border-radius: 10px;
  cursor: pointer;
}
.idol-card {
  flex: 0 0 auto;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 2px solid transparent;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  padding: 8px;
}
.idol-card:hover {
  border-color: #f0afaf;
}
.idol-title {
  margin: 0 0 6px;
  font-size: 1vw;
  font-weight: 700;
  text-align: center;
}
.idol-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 8px;
}
.idol-frame-wrap {
  flex: 0 0 auto;
  min-width: 0;
  width: 25vh;
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
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
  font-size: 2vw;
  font-weight: 800;
}
.idol-icons {
  flex: 0 0 auto;
  width: 16vh;
  min-width: 0;
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
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.idol-icon-box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.idol-back {
  font-size: 1.1vw;
  padding: 1vh 2vw;
  border-radius: 10px;
  cursor: pointer;
}
</style>
