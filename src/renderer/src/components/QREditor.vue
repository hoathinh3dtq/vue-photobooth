<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  modelValue: { enabled: boolean; x: number; y: number; size: number }
  imageUrl?: string
  fw?: number
  fh?: number
}
const props = withDefaults(defineProps<Props>(), { imageUrl: '', fw: 1200, fh: 3600 })
const emit = defineEmits<{
  (e: 'update:modelValue', v: { enabled: boolean; x: number; y: number; size: number }): void
}>()

const v = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

function update(patch: Partial<typeof v.value>) {
  v.value = { ...v.value, ...patch }
}

// preview position % ( qr_x / fw *100 )
const previewStyle = computed(() => {
  const fw = props.fw || 1200
  const fh = props.fh || 3600
  const sizePct = Math.min(30, Math.max(5, ((v.value.size || 200) / fw) * 100))
  return {
    position: 'absolute' as const,
    left: clamp((v.value.x / fw) * 100) + '%',
    top: clamp((v.value.y / fh) * 100) + '%',
    width: sizePct + '%',
    aspectRatio: '1 / 1',
  }
})
function clamp(n: number) { return Math.max(0, Math.min(100, n)) }
</script>

<template>
  <div class="qr-editor">
    <label class="qr-toggle">
      <input type="checkbox" :checked="v.enabled" @change="update({ enabled: ($event.target as HTMLInputElement).checked })" />
      <span></span> Bật QR
    </label>

    <div v-if="v.enabled" class="qr-body">
      <div class="qr-preview">
        <img v-if="imageUrl" :src="imageUrl" alt="" />
        <div v-else class="qr-placeholder">Preview</div>
        <div class="qr-box" :style="previewStyle">QR</div>
      </div>

      <div class="qr-controls">
        <label>
          Vị trí X: {{ v.x }}px ({{ Math.round((v.x / (fw || 1200)) * 100) }}%)
          <input type="range" min="0" :max="fw || 1200" :value="v.x" @input="update({ x: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label>
          Vị trí Y: {{ v.y }}px ({{ Math.round((v.y / (fh || 3600)) * 100) }}%)
          <input type="range" min="0" :max="fh || 3600" :value="v.y" @input="update({ y: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <label>
          Kích thước: {{ v.size }}px
          <input type="range" min="50" max="800" :value="v.size" @input="update({ size: Number(($event.target as HTMLInputElement).value) })" />
        </label>
        <div class="qr-nums">
          <label>X <input type="number" :value="v.x" @input="update({ x: Number(($event.target as HTMLInputElement).value) })" /></label>
          <label>Y <input type="number" :value="v.y" @input="update({ y: Number(($event.target as HTMLInputElement).value) })" /></label>
          <label>Size <input type="number" :value="v.size" @input="update({ size: Number(($event.target as HTMLInputElement).value) })" /></label>
        </div>
      </div>
    </div>
    <p class="qr-hint">QR hiển thị góc phải dưới khung hình. Kéo slider để chỉnh vị trí &amp; kích thước.</p>
  </div>
</template>

<style scoped>
.qr-editor { padding:12px; border:1px solid #eef0ee; border-radius:12px; background:#fff; }
.qr-toggle { display:flex; gap:10px; align-items:center; cursor:pointer; font-weight:700; }
.qr-toggle input { display:none; }
.qr-toggle span { width:36px; height:20px; background:#ddd; border-radius:999px; position:relative; }
.qr-toggle span::after { content:''; position:absolute; width:16px; height:16px; background:#fff; border-radius:50%; top:2px; left:2px; transition:.2s; }
.qr-toggle input:checked + span { background:#ff4d6d; }
.qr-toggle input:checked + span::after { left:18px; }
.qr-body { display:grid; grid-template-columns: 180px 1fr; gap:16px; margin-top:12px; }
.qr-preview { position:relative; aspect-ratio:1/3; border:1px solid #ddd; border-radius:8px; overflow:hidden; background:#f8f8f8; }
.qr-preview img { width:100%; height:100%; object-fit:cover; display:block; }
.qr-placeholder { height:100%; display:grid; place-items:center; color:#aaa; }
.qr-box { background:#ff4d6d; color:#fff; display:grid; place-items:center; font-size:10px; font-weight:800; border:2px solid #fff; box-shadow:0 2px 8px rgba(0,0,0,0.2); }
.qr-controls label { display:block; font-size:12px; margin:8px 0; }
.qr-controls input[type=range] { width:100%; }
.qr-nums { display:flex; gap:8px; flex-wrap:wrap; }
.qr-nums input { width:70px; }
.qr-hint { font-size:11px; color:#888; margin-top:8px; }
</style>
