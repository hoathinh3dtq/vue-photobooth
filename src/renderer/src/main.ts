import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/global.css'
import './styles/v1/main.css'
import './styles/v1/home.css'
import './styles/v1/select_type_photo.css'
import './styles/v1/camera.css'
import './styles/v1/select_theme.css'
import App from './App.vue'
import router from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
