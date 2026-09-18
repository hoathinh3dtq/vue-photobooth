<template>
  <div class="heart-loader" role="status" aria-label="Đang tải">
    <svg v-for="i in 3" :key="i" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s-7.5-4.7-9.5-9.4C1.3 8.9 3 5.9 6 5.9c2 0 3.6 1.2 4.6 3 1-1.8 2.6-3 4.6-3 3 0 4.7 3 3.5 5.7C19.5 16.3 12 21 12 21z"
      />
    </svg>
  </div>
</template>

<style scoped>
.heart-loader {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin: auto;
  flex: 0 0 auto;
  padding: 14px 4px 2px;
  box-sizing: border-box;
}
.heart-loader svg {
  width: 30px;
  height: 30px;
  fill: #f9c3d7;
  animation: heart-jump 1.2s ease-in-out infinite;
}
.heart-loader svg:nth-child(2) {
  animation-delay: 0.15s;
}
.heart-loader svg:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes heart-jump {
  0%,
  60%,
  100% {
    transform: translateY(0) scale(1) rotate(12deg);
    fill: #f9c3d7;
  }
  30% {
    transform: translateY(-10px) scale(1.15) rotate(12deg);
    fill: #e14e7f;
  }
}
</style>
