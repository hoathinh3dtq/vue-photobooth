<script setup lang="ts">
import { useFlowStore } from '../stores/flow'
import { startTimeLapse } from '../lib/timelapse'

const flowStore = useFlowStore()

function newCapture(): void {
  void startTimeLapse()
  flowStore.go('camera')
}

function printExisting(): void {
  flowStore.go('list-event-images')
}
</script>

<template>
  <div class="frame">
    <img id="img-logo" src="/assets/logo.png" alt="Photobooth" />
    <div class="event-action-buttons">
      <button class="btn-camera event-action-btn" type="button" @click="newCapture">
        <span class="icon">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#f0afaf" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="18" cy="6" r="1" />
          </svg>
        </span>
        <p>Chụp ảnh mới</p>
      </button>
      <button class="btn-camera event-action-btn" type="button" @click="printExisting">
        <span class="icon">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#f0afaf" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="6" width="16" height="13" rx="2" />
            <path d="M6 6V2h12v4" />
            <rect x="7" y="10" width="10" height="9" rx="1" />
          </svg>
        </span>
        <p>In ảnh đã chụp</p>
      </button>
    </div>
  </div>
</template>
