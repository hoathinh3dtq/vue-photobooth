<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listCategories, type Category } from '../lib/api/categories'
import { STORAGE_URL } from '../lib/api/client'
import { useSelectionStore } from '../stores/selection'

const router = useRouter()
const selectionStore = useSelectionStore()

const categories = ref<Category[]>([])
const loading = ref(true)
const error = ref('')

function thumbUrl(cat: Category): string {
  let url = cat.thumbnail_url || ''
  if (url && !url.startsWith('http')) url = `${STORAGE_URL}/${url.replace(/^\//, '')}`
  return url || `/assets/theme_${cat.type}.png`
}

function pick(cat: Category): void {
  selectionStore.select(cat)
  if (Number(cat.type_idol) === 1) {
    router.push('/idol-theme')
    return
  }
  router.push('/camera')
}

onMounted(async () => {
  try {
    const userId = Number(localStorage.getItem('user_id')) || 1
    categories.value = await listCategories(userId)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="select-layout">
    <p v-if="loading" class="hint">Đang tải...</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="categories.length === 0" class="hint">Chưa có loại ảnh nào cho booth này</p>

    <div v-for="cat in categories" :key="cat.id" class="card" :id="`type-${cat.type}`" @click="pick(cat)">
      <h3>{{ cat.type_name }}</h3>
      <p v-if="cat.price">{{ cat.price.toLocaleString('vi-VN') }}</p>
      <img :src="thumbUrl(cat)" :alt="cat.type_name" />
    </div>
  </div>
</template>
