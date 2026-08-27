<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login, saveSession } from '../lib/api/auth'

const router = useRouter()

const email = ref('')
const password = ref('')
const boothCode = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = ''

  try {
    const res = await login(email.value, password.value, boothCode.value)
    saveSession(res)
    router.push('/home')
  } catch (e) {
    try {
      const parsed = JSON.parse((e as Error).message)
      error.value = parsed.message || 'Sai email hoặc mật khẩu'
    } catch {
      error.value = 'Sai email hoặc mật khẩu'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-box">
      <h1 class="login-title">WELCOME</h1>
      <h2 class="login-subtitle">PHOTOBOOTH</h2>
      <form class="login-form" @submit.prevent="onSubmit">
        <input v-model="email" class="login-input" type="email" placeholder="Email" required autofocus />
        <input v-model="password" class="login-input" type="password" placeholder="Mật khẩu" required />
        <input v-model="boothCode" class="login-input" type="text" placeholder="Mã booth" required />
        <button class="login-btn" type="submit" :disabled="loading">
          {{ loading ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP' }}
        </button>
        <p class="login-error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>
