import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginPage.vue'),
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../pages/HomePage.vue'),
    },
    {
      path: '/select-type',
      name: 'select-type',
      component: () => import('../pages/SelectTypePage.vue'),
    },
    {
      path: '/camera',
      name: 'camera',
      component: () => import('../pages/CameraPage.vue'),
    },
    {
      path: '/event-action',
      name: 'event-action',
      component: () => import('../pages/EventActionPage.vue'),
    },
    {
      path: '/list-event-images',
      name: 'list-event-images',
      component: () => import('../pages/ListEventImagesPage.vue'),
    },
    {
      path: '/select-theme',
      name: 'select-theme',
      component: () => import('../pages/SelectThemePage.vue'),
    },
    {
      path: '/idol-theme',
      name: 'idol-theme',
      component: () => import('../pages/IdolThemePage.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../pages/SettingsPage.vue'),
    },
    {
      path: '/my-frames',
      name: 'my-frames',
      component: () => import('../pages/MyFramesPage.vue'),
    },

  ],
})

router.beforeEach((to) => {
  const hasToken = Boolean(localStorage.getItem('auth_token'))
  if (to.name === 'login' && hasToken) return { name: 'home' }
  if (to.name !== 'login' && !hasToken) return { name: 'login' }
  return true
})

const BODY_CLASS_BY_ROUTE: Record<string, string> = {
  login: 'page-login',
  home: 'page-home',
  'select-type': 'page-select_type_photo',
  camera: 'page-camera',
  'select-theme': 'page-select_theme',
  'idol-theme': 'page-select_theme',
  finish: 'page-finish',
  // v1 dùng lại nền pastel của home cho các màn event
  'event-action': 'page-home',
  'list-event-images': 'page-home',
}

router.afterEach((to) => {
  const cls = BODY_CLASS_BY_ROUTE[String(to.name)]
  document.body.className = cls || ''
})

export default router