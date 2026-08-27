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
  <div class="frame">
    <button
      v-if="configStore.config?.hide_logout_button !== 1"
      class="logout-btn"
      id="logoutBtn"
      type="button"
      @click="logout"
    >
      ✕
    </button>
    <img id="img-logo" src="/assets/logo.png" alt="Photobooth" />
    <button class="btn-camera" id="startBtn" type="button" @click="goNext">
      <span class="icon">
        <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#f0afaf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="18" cy="6" r="1" />
        </svg>
      </span>
      <p id="text-btn-start">Bắt đầu</p>
    </button>
  </div>
</template>
