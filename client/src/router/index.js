import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../pages/LoginPage.vue'
import RoomPage from '../pages/RoomPage.vue'

function isAuthed() {
  return Boolean(localStorage.getItem('token'))
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginPage },
    { path: '/', component: RoomPage, meta: { requiresAuth: true } }
  ]
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthed()) return '/login'
  if (to.path === '/login' && isAuthed()) return '/'
  return true
})

export default router
