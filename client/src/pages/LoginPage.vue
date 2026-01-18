<template>
  <div class="page">
    <div class="auth-panel">
      <div class="auth-title">线上自习室</div>

      <div class="auth-form">
        <label class="auth-label">
          <span>用户名</span>
          <input v-model.trim="username" class="auth-input" autocomplete="username" />
        </label>

        <label class="auth-label">
          <span>密码</span>
          <input
            v-model="password"
            class="auth-input"
            type="password"
            autocomplete="current-password"
            @keydown.enter="onLogin"
          />
        </label>

        <button class="auth-btn" type="button" @click="onLogin">进入自习室</button>
      </div>

      <div v-if="error" class="auth-error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')

async function onLogin() {
  error.value = ''
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || '登录失败')
    localStorage.setItem('token', data.token)
    router.push('/')
  } catch (e) {
    error.value = e?.message || String(e)
  }
}
</script>

<style scoped>
.page{
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #ffffff;
}

.auth-panel{
  width: min(420px, calc(100vw - 32px));
  padding: 22px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.10);
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12);
  pointer-events: auto;
}

.auth-title{
  font-weight: 950;
  letter-spacing: 1px;
  font-size: 22px;
  color: rgba(15, 23, 42, 0.92);
}

.auth-form{
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-label{
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.72);
}

.auth-input{
  height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(15, 23, 42, 0.03);
  color: rgba(15, 23, 42, 0.92);
  outline: none;
}

.auth-input::placeholder{ color: rgba(15, 23, 42, 0.35); }
.auth-input:focus{
  border-color: rgba(56, 160, 255, 0.55);
  box-shadow: 0 0 0 4px rgba(56, 160, 255, 0.14);
}

.auth-btn{
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(56, 160, 255, 0.92);
  color: rgba(255,255,255,0.98);
  font-weight: 900;
  letter-spacing: 1px;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 180ms ease, background 180ms ease;
}

.auth-btn:hover{
  transform: translateY(-1px);
  background: rgba(40, 148, 255, 0.96);
  box-shadow: 0 18px 40px rgba(0,0,0,0.26);
}

.auth-error{
  margin-top: 12px;
  color: rgba(255, 170, 170, 0.95);
  font-weight: 800;
}
</style>
