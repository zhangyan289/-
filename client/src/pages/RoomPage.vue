<template>
  <div class="room">
    <!-- 左上角倒计时：红色数字 + 下拉管理（考研 + 自定义） -->
    <div class="corner-countdown" :class="{ 'is-open': showCountdownMenu }" aria-label="countdown">
      <div class="corner-countdown-btn">
        <div class="corner-countdown-row">
          <img
            v-if="countdownSideOk"
            :src="countdownSideSrc"
            alt="countdown"
            class="corner-countdown-side"
            draggable="false"
            @dragstart.prevent
            @click="toggleCountdownMenu"
            @error="countdownSideOk = false"
          />

          <button
            class="corner-countdown-badge"
            type="button"
            :aria-expanded="showCountdownMenu ? 'true' : 'false'"
            aria-haspopup="menu"
            @click="toggleCountdownMenu"
          >{{ kaoyanDaysLeftBadge }}</button>
        </div>
      </div>

      <div v-if="showCountdownMenu" class="countdown-menu" role="menu">
        <div class="countdown-menu-head">
          <div class="countdown-menu-title">倒计时</div>
          <button class="simple-btn" style="height:36px; padding:0 12px;" @click="showCountdownMenu = false">关闭</button>
        </div>

        <div class="countdown-section">
          <div class="countdown-row">
            <div class="countdown-name">考研</div>
            <input v-model="kaoyanDate" class="countdown-date" type="date" />
            <div class="countdown-days countdown-days-red">{{ formatDaysLeft(daysLeftFor(kaoyanDate)) }}</div>
          </div>
        </div>

        <div class="countdown-section">
          <div class="countdown-section-title">自定义</div>
          <div v-if="countdowns.length === 0" class="countdown-empty">还没有自定义倒计时</div>
          <div v-for="c in countdowns" :key="c.id" class="countdown-row">
            <input v-model="c.name" class="countdown-name-input" type="text" placeholder="比如：生日 / 复试 / 旅行" />
            <input v-model="c.date" class="countdown-date" type="date" />
            <div class="countdown-days">{{ formatDaysLeft(daysLeftFor(c.date)) }}</div>
            <button class="simple-btn simple-btn-danger" style="height:34px; padding:0 10px; border-radius:10px;" @click="removeCountdown(c.id)">删除</button>
          </div>

          <div class="countdown-add">
            <input v-model="newCountdownName" class="countdown-name-input" type="text" placeholder="新增倒计时名称" />
            <input v-model="newCountdownDate" class="countdown-date" type="date" />
            <button class="simple-btn" style="height:34px; padding:0 12px;" @click="addCountdown">添加</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 左上角音乐入口：按钮 + 下拉（跳转主流音乐网站） -->
    <div class="corner-music" :class="{ 'is-open': showMusicMenu }" aria-label="music">
      <div class="corner-music-btn">
        <div class="corner-music-row">
          <img
            v-if="musicSideOk"
            :src="musicSideSrc"
            alt="music"
            class="corner-music-side"
            draggable="false"
            @dragstart.prevent
            @click="toggleMusicMenu"
            @error="musicSideOk = false"
          />
          <div
            v-else
            class="corner-music-side corner-side-placeholder"
            role="button"
            tabindex="0"
            aria-label="music"
            @click="toggleMusicMenu"
          />

          <button
            class="corner-music-icon"
            type="button"
            :aria-expanded="showMusicMenu ? 'true' : 'false'"
            aria-haspopup="menu"
            @click="toggleMusicMenu"
            title="音乐"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 3v12.2c-.6-.3-1.3-.5-2.1-.5C7.7 14.7 6 16.1 6 18s1.7 3.3 3.9 3.3c2.1 0 3.9-1.4 3.9-3.3V8.2l8-2V14c-.6-.3-1.3-.5-2.1-.5-2.1 0-3.9 1.4-3.9 3.3s1.7 3.3 3.9 3.3c2.1 0 3.9-1.4 3.9-3.3V3l-12 3Z"
                fill="rgba(255,255,255,0.98)"
              />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="showMusicMenu" class="music-menu" role="menu">
        <div class="music-menu-head">
          <div class="music-menu-title">音乐</div>
          <button class="simple-btn" style="height:36px; padding:0 12px;" @click="showMusicMenu = false">关闭</button>
        </div>

        <div class="music-links">
          <a
            v-for="s in musicSites"
            :key="s.url"
            class="music-link"
            :href="s.url"
            target="_blank"
            rel="noopener noreferrer"
          >{{ s.name }}</a>
        </div>
      </div>
    </div>

    <!-- 左上角留言箱：非实时留言（在音乐下面） -->
    <div class="corner-message" :class="{ 'is-open': showMessageMenu }" aria-label="message">
      <div class="corner-message-btn">
        <div class="corner-message-row">
          <img
            v-if="messageSideOk"
            :src="messageSideSrc"
            alt="message"
            class="corner-message-side"
            draggable="false"
            @dragstart.prevent
            @click="toggleMessageMenu"
            @error="messageSideOk = false"
          />
          <div
            v-else
            class="corner-message-side corner-side-placeholder"
            role="button"
            tabindex="0"
            aria-label="message"
            @click="toggleMessageMenu"
          />

          <button
            class="corner-message-icon"
            type="button"
            :aria-expanded="showMessageMenu ? 'true' : 'false'"
            aria-haspopup="menu"
            @click="toggleMessageMenu"
            title="留言箱"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 4H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3.8l3.6 2.7c.4.3 1 .3 1.4 0L19.4 19H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 13H18.7c-.2 0-.4.1-.6.2l-3.6 2.7-3.6-2.7c-.2-.1-.4-.2-.6-.2H4V6h16v11Z"
                fill="rgba(255,255,255,0.98)"
              />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="showMessageMenu" class="message-menu" role="menu">
        <div class="message-menu-head">
          <div class="message-menu-title">留言箱</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="simple-btn" style="height:36px; padding:0 12px;" @click="loadMessagesFromServer">刷新</button>
            <button class="simple-btn" style="height:36px; padding:0 12px;" @click="showMessageMenu = false">关闭</button>
          </div>
        </div>

        <div class="message-list">
          <div v-if="messageLoading" class="message-empty">加载中…</div>
          <div v-else-if="messages.length === 0" class="message-empty">还没有留言</div>
          <div v-else v-for="m in messages" :key="m.id" class="message-item">
            <div class="message-meta">
              <div class="message-author">
                <img
                  v-if="isAvatarOk(m.author)"
                  :src="getAvatarSrc(m.author)"
                  :alt="m.author"
                  class="message-avatar"
                  draggable="false"
                  @dragstart.prevent
                  @error="markAvatarError(m.author)"
                />
                <span>{{ displayName(m.author) }}</span>
              </div>
              <div class="message-time">{{ formatMessageTime(m.createdAt) }}</div>
            </div>
            <div class="message-text">{{ m.text }}</div>
          </div>
        </div>

        <div class="message-compose">
          <textarea
            v-model="newMessageText"
            class="message-input"
            rows="2"
            maxlength="280"
            placeholder="写点什么…"
          />
          <button class="simple-btn" style="height:38px; padding:0 14px; border-radius:12px;" @click="sendMessage" :disabled="messageSending">
            {{ messageSending ? '发送中…' : '发送' }}
          </button>
        </div>
        <div v-if="messageError" class="message-error">{{ messageError }}</div>
      </div>
    </div>

    <!-- 顶部 HUD：时间固定正上方 + 右上角退出 -->
    <div class="hud-top">
      <div class="hud-clock" aria-label="clock">
        <div class="hud-clock-text">{{ nowText }}</div>
      </div>

      <!-- 计时：放在时钟下方，记录当前登录用户的学习时长 -->
      <div v-if="meUser" class="hud-timer">
        <div class="hud-timer-row">
          <button class="simple-btn" @click="toggleTimer">{{ running ? '停止计时' : '开始计时' }}</button>
          <div class="hud-timer-text">今日学习总时长：{{ formatSeconds(meTodaySecondsLive) }}</div>
          <button class="simple-btn" @click="openHistory">学习记录</button>
          <div class="hud-timer-text" :style="{ opacity: 0.75 }">运行中：{{ running ? '是' : '否' }}</div>
        </div>
      </div>

      <!-- 番茄钟：主页面直接使用（不影响学习计时），25/5，4 个番茄后长休 -->
      <div class="hud-pomo">
        <div class="hud-pomo-row" aria-label="pomodoro">
          <div class="hud-pomo-left">
            <img
              v-if="pomoIconOk"
              :src="pomoIconSrc"
              alt="tomato"
              class="pomo-icon"
              draggable="false"
              @dragstart.prevent
              @error="pomoIconOk = false"
            />
            <div class="hud-pomo-label">番茄钟</div>
            <div class="hud-pomo-badge" :class="`pomo-${pomoMode}`">{{ pomoModeLabel }}</div>
            <div class="hud-pomo-time">{{ pomoTimeText }}</div>
            <div class="hud-pomo-meta">已完成：{{ pomoCompleted }}</div>
          </div>

          <div class="hud-pomo-actions">
            <button class="simple-btn" @click="togglePomodoro">{{ pomoRunning ? '暂停' : '开始' }}</button>
            <button class="simple-btn" @click="resetPomodoro">重置</button>
            <button class="simple-btn" @click="skipPomodoro">跳过</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hud-menu">
      <div class="hud-menu-top">
        <button class="simple-btn" @click="cycleScene" :title="`切换场景（当前：${bgSceneId}/5）`">场景：{{ bgSceneId }}/5</button>
        <button class="simple-btn" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '进入全屏'">{{ isFullscreen ? '退出全屏' : '全屏' }}</button>
        <button class="simple-btn hud-logout" @click="logout">退出账号</button>
      </div>

      <div class="hud-menu-bottom">
        <div class="bg-auto">
          <span class="bg-auto-label">自动切换</span>
          <input
            v-model.number="bgAutoMinutes"
            class="bg-auto-input"
            type="number"
            min="0"
            step="1"
            :max="BG_AUTO_MAX_MINUTES"
            placeholder="0"
            title="填 0 关闭；填 N 表示每 N 分钟自动切换"
          />
          <span class="bg-auto-unit">分钟</span>
        </div>
      </div>
    </div>

    <!-- Todo 浮动窗：由小狗点击打开；可拖动；不阻塞页面其它操作 -->
    <div
      v-if="showTodo"
      class="todo-float todo-panel-simple"
      :class="todoThemeClass"
      :style="{ left: `${todoPos.x}px`, top: `${todoPos.y}px` }"
      @pointerdown="onTodoPointerDown"
    >
      <div class="todo-panel-inner">
        <div class="todo-header">
          <div class="todo-title">
            <img
              v-if="todoUser && isAvatarOk(todoUser.username)"
              :src="getAvatarSrc(todoUser.username)"
              :alt="todoUser.username"
              class="user-avatar"
              draggable="false"
              @dragstart.prevent
              @error="markAvatarError(todoUser.username)"
            />
            <div>Todo - {{ displayName(todoUser?.username) }}</div>
          </div>

          <div class="todo-header-right">
            <div class="todo-drag-handle" title="拖动">
              <img :src="dragHandleIcon" alt="drag" class="todo-drag-icon" draggable="false" @dragstart.prevent />
            </div>
            <button class="simple-btn" @click="closeTodo">关闭</button>
          </div>
        </div>

        <div class="todo-meta">
          <div class="todo-mode" :class="todoEditable ? 'mode-edit' : 'mode-read'">
            {{ todoEditable ? '可编辑' : '只读' }}
          </div>
          <div class="todo-today" v-if="todoUser">今日学习总时长：{{ formatSeconds(todoTodaySecondsLive) }}</div>
        </div>

        <div v-if="todoEditable" class="todo-tools">
          <div class="todo-tools-right">
            <input v-model="newTodoText" class="simple-input" placeholder="添加 Todo..." type="text" />
            <button class="simple-btn" @click="addTodo">添加</button>
          </div>
        </div>

        <div class="todo-list todo-list-panel">
          <div
            v-for="t in (todoUser?.todos || [])"
            :key="t.id"
            class="todo-item"
            :style="{ backgroundImage: `url(${listItemImg})` }"
          >
            <div class="todo-left">
              <button
                class="simple-check"
                :class="{ checked: t.done, disabled: !todoEditable }"
                type="button"
                aria-label="toggle"
                @click="todoEditable ? toggleTodo(t) : null"
              />
              <div
                class="todo-text"
                :style="{
                  textDecoration: t.done ? 'line-through' : 'none',
                  opacity: t.done ? 0.7 : 1
                }"
              >
                {{ t.text }}
              </div>
            </div>

            <button
              v-if="todoEditable"
              class="simple-btn simple-btn-danger"
              style="height:40px; padding:0 12px; border-radius:10px;"
              @click.stop="deleteTodo(t)"
            >删除</button>
          </div>

          <div v-if="(todoUser?.todos || []).length === 0" class="todo-empty">暂无 Todo</div>
        </div>
      </div>
    </div>

    <!-- 学习记录弹窗（朴素风格面板） -->
    <div v-if="showHistory" class="overlay overlay-history" @click.self="showHistory = false">
      <div
        class="history-panel history-panel-simple"
      >
        <div class="history-header">
          <div class="history-title">学习记录（每日）</div>
          <button class="simple-btn" @click="showHistory = false">关闭</button>
        </div>

        <div class="history-range">
          <div class="history-range-actions">
            <button v-if="canLoadMore" class="simple-btn" @click="loadMoreHistory">加载更多</button>
            <div v-else class="history-range-end">已到最早记录</div>
          </div>
        </div>

        <div class="history-grid">
          <div v-for="u in users" :key="u.username" class="history-user-card">
            <div class="history-user-head">
              <div class="history-user-left">
                <img
                  v-if="isAvatarOk(u.username)"
                  :src="getAvatarSrc(u.username)"
                  :alt="u.username"
                  class="user-avatar user-avatar-sm"
                  draggable="false"
                  @dragstart.prevent
                  @error="markAvatarError(u.username)"
                />
                <div class="history-user-name">{{ displayName(u.username) }}</div>
              </div>
              <div class="history-user-today">今日：{{ formatSeconds(todaySecondsForUser(u)) }}</div>
            </div>

            <div class="history-day-grid">
              <div v-for="h in historyListForUser(u)" :key="h.date" class="history-day-item">
                <div class="history-day-date">{{ shortDate(h.date) }}</div>
                <div class="history-day-seconds">{{ formatSeconds(h.seconds) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 背景场景（bg1~bg5）：仅切换背景与小狗热点；不影响其它功能
const BG_SCENE_COUNT = 5
const BG_SCENE_STORAGE_KEY = 'bg_scene_id'
const bgSceneId = ref(1)

const BG_AUTO_STORAGE_KEY = 'bg_scene_auto_minutes'
const BG_AUTO_MAX_MINUTES = 240
const bgAutoMinutes = ref(0)
let bgAutoTimer = null

const isFullscreen = ref(false)

function readFullscreenState() {
  const d = document
  // 兼容部分浏览器前缀
  isFullscreen.value = Boolean(d.fullscreenElement || d.webkitFullscreenElement)
}

async function toggleFullscreen() {
  const d = document
  const el = document.documentElement

  try {
    const currentlyFullscreen = Boolean(d.fullscreenElement || d.webkitFullscreenElement)
    if (!currentlyFullscreen) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen
      if (req) await req.call(el)
    } else {
      const exit = d.exitFullscreen || d.webkitExitFullscreen
      if (exit) await exit.call(d)
    }
  } catch {
    // ignore
  } finally {
    readFullscreenState()
  }
}

function clampSceneId(x) {
  const n = Number(x)
  if (!Number.isFinite(n)) return 1
  return Math.min(BG_SCENE_COUNT, Math.max(1, Math.floor(n)))
}

function emitSceneId(id) {
  window.dispatchEvent(new CustomEvent('bg-scene-set', { detail: { sceneId: id } }))
}

function setScene(id) {
  const next = clampSceneId(id)
  bgSceneId.value = next
  localStorage.setItem(BG_SCENE_STORAGE_KEY, String(next))
  emitSceneId(next)
}

function clampAutoMinutes(x) {
  const n = Number(x)
  if (!Number.isFinite(n)) return 0
  return Math.min(BG_AUTO_MAX_MINUTES, Math.max(0, Math.floor(n)))
}

function stopAutoScene() {
  if (bgAutoTimer) {
    clearInterval(bgAutoTimer)
    bgAutoTimer = null
  }
}

function startAutoScene(minutes) {
  stopAutoScene()
  const m = clampAutoMinutes(minutes)
  if (m <= 0) return
  bgAutoTimer = setInterval(() => {
    cycleScene()
  }, m * 60 * 1000)
}

function cycleScene() {
  const next = bgSceneId.value >= BG_SCENE_COUNT ? 1 : (bgSceneId.value + 1)
  setScene(next)
}

watch(bgAutoMinutes, (val) => {
  const m = clampAutoMinutes(val)
  if (m !== val) bgAutoMinutes.value = m
  localStorage.setItem(BG_AUTO_STORAGE_KEY, String(m))
  startAutoScene(m)
})

const error = ref('')
const now = ref(new Date())
const nowText = computed(() => {
  const d = now.value
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
})

// 倒计时（考研 + 自定义）：两人共享（服务端存储），本地 localStorage 作为兜底缓存
const COUNTDOWN_CACHE_KEY = 'countdownCache'
const showCountdownMenu = ref(false)

const countdownLoaded = ref(false)
const kaoyanDate = ref('2026-12-20')
const countdowns = ref([])
const newCountdownName = ref('')
const newCountdownDate = ref('')

function daysLeftFor(dateStr) {
  if (!dateStr) return null
  const today = new Date(now.value)
  today.setHours(0, 0, 0, 0)

  const target = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  target.setHours(0, 0, 0, 0)

  const diffMs = target.getTime() - today.getTime()
  return Math.ceil(diffMs / 86400000)
}

function formatDaysLeft(days) {
  if (days === null) return '-'
  if (days < 0) return '已过'
  if (days === 0) return '今天'
  return `${days} 天`
}

const kaoyanDaysLeftBadge = computed(() => {
  const days = daysLeftFor(kaoyanDate.value)
  if (days === null) return '--'
  if (days < 0) return '0'
  return String(days)
})

// 左上角倒计时旁边的图片（你待会放到 client/public/assets/user 下）
// 默认文件名：countdown_side.png（也可以改成你自己的）
const countdownSideSrc = '/assets/user/countdown_side.png'
const countdownSideOk = ref(true)

// 左上角音乐按钮旁边的图片（放在 client/public/assets/user/music.png）
const musicSideSrc = '/assets/user/music.png'
const musicSideOk = ref(true)
const showMusicMenu = ref(false)
const musicSites = [
  { name: '网易云音乐', url: 'https://music.163.com/' },
  { name: 'QQ 音乐', url: 'https://y.qq.com/' },
  { name: '汽水音乐', url: 'https://music.douyin.com/' },
  { name: '酷狗音乐', url: 'https://www.kugou.com/' },
  { name: '酷我音乐', url: 'https://www.kuwo.cn/' }
]

// 左上角留言箱旁边的图片（放在 client/public/assets/user/message.png）
const messageSideSrc = '/assets/user/message.png'
const messageSideOk = ref(true)
const showMessageMenu = ref(false)
const messages = ref([])
const newMessageText = ref('')
const messageLoading = ref(false)
const messageSending = ref(false)
const messageError = ref('')

function formatMessageTime(iso) {
  try {
    if (!iso) return ''
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return String(iso)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  } catch {
    return String(iso || '')
  }
}

async function loadMessagesFromServer() {
  messageError.value = ''
  messageLoading.value = true
  try {
    const data = await apiGet('/api/shared/messages')
    const list = Array.isArray(data?.messages) ? data.messages : []
    messages.value = list
  } catch (e) {
    messageError.value = e?.message || String(e)
  } finally {
    messageLoading.value = false
  }
}

async function sendMessage() {
  const text = (newMessageText.value || '').trim()
  if (!text) return
  messageError.value = ''
  messageSending.value = true
  try {
    const data = await apiPost('/api/shared/messages', { text })
    if (data?.message) {
      messages.value = [data.message, ...(messages.value || [])].slice(0, 120)
    } else {
      await loadMessagesFromServer()
    }
    newMessageText.value = ''
  } catch (e) {
    messageError.value = e?.message || String(e)
  } finally {
    messageSending.value = false
  }
}

function saveCountdownState() {
  try {
    const payload = {
      kaoyanDate: kaoyanDate.value,
      countdowns: (countdowns.value || []).map((c) => ({ id: c.id, name: c.name, date: c.date }))
    }
    localStorage.setItem(COUNTDOWN_CACHE_KEY, JSON.stringify(payload))
  } catch (_) {
    // ignore
  }
}

function loadCountdownCache() {
  try {
    const raw = localStorage.getItem(COUNTDOWN_CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)

    if (typeof parsed?.kaoyanDate === 'string' && parsed.kaoyanDate) kaoyanDate.value = parsed.kaoyanDate

    if (Array.isArray(parsed?.countdowns)) {
      countdowns.value.splice(0, countdowns.value.length)
      for (const c of parsed.countdowns) {
        if (!c || typeof c !== 'object') continue
        const id = String(c.id || '')
        const name = typeof c.name === 'string' ? c.name : ''
        const date = typeof c.date === 'string' ? c.date : ''
        if (!id) continue
        countdowns.value.push({ id, name, date })
      }
    }
  } catch (_) {
    // ignore
  }
}

async function loadCountdownFromServer() {
  try {
    const data = await apiGet('/api/shared/countdowns')
    if (typeof data?.kaoyanDate === 'string' && data.kaoyanDate) kaoyanDate.value = data.kaoyanDate
    if (Array.isArray(data?.countdowns)) {
      countdowns.value.splice(0, countdowns.value.length)
      for (const c of data.countdowns) {
        if (!c || typeof c !== 'object') continue
        const id = String(c.id || '')
        const name = typeof c.name === 'string' ? c.name : ''
        const date = typeof c.date === 'string' ? c.date : ''
        if (!id) continue
        countdowns.value.push({ id, name, date })
      }
    }
    saveCountdownState()
  } catch (_) {
    // 服务端不可用时，退回本地缓存
    loadCountdownCache()
  }
}

let countdownSaveTimer = null
async function saveCountdownToServerNow() {
  try {
    await apiPut('/api/shared/countdowns', {
      kaoyanDate: kaoyanDate.value,
      countdowns: (countdowns.value || []).map((c) => ({ id: c.id, name: c.name, date: c.date }))
    })
  } catch (_) {
    // ignore: 离线/后端异常时不阻塞输入
  }
}

function scheduleSaveCountdownToServer() {
  if (countdownSaveTimer) clearTimeout(countdownSaveTimer)
  countdownSaveTimer = setTimeout(async () => {
    saveCountdownState()
    await saveCountdownToServerNow()
  }, 450)
}

function addCountdown() {
  const name = (newCountdownName.value || '').trim()
  const date = (newCountdownDate.value || '').trim()
  if (!name || !date) return
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  countdowns.value.push({ id, name, date })
  newCountdownName.value = ''
  newCountdownDate.value = ''
  scheduleSaveCountdownToServer()
}

function removeCountdown(id) {
  const idx = (countdowns.value || []).findIndex((c) => c.id === id)
  if (idx >= 0) countdowns.value.splice(idx, 1)
  scheduleSaveCountdownToServer()
}

async function toggleCountdownMenu() {
  const next = !showCountdownMenu.value
  showCountdownMenu.value = next
  if (next) {
    showMusicMenu.value = false
    // 打开时拉取最新共享状态，便于两人共同编辑
    await loadCountdownFromServer()
  }
}

function toggleMusicMenu() {
  const next = !showMusicMenu.value
  showMusicMenu.value = next
  if (next) {
    showCountdownMenu.value = false
    showMessageMenu.value = false
  }
}

async function toggleMessageMenu() {
  const next = !showMessageMenu.value
  showMessageMenu.value = next
  if (next) {
    showCountdownMenu.value = false
    showMusicMenu.value = false
    await loadMessagesFromServer()
  }
}

function onDocumentPointerDown(e) {
  if (!showCountdownMenu.value && !showMusicMenu.value && !showMessageMenu.value) return
  const el = e?.target
  if (!(el instanceof Element)) return
  if (el.closest('.corner-countdown')) return
  if (el.closest('.corner-music')) return
  if (el.closest('.corner-message')) return
  showCountdownMenu.value = false
  showMusicMenu.value = false
  showMessageMenu.value = false
}

watch(
  [kaoyanDate, countdowns],
  () => {
    if (!countdownLoaded.value) return
    scheduleSaveCountdownToServer()
  },
  { deep: true }
)

let clockTimer = null

const me = ref(null)
const users = ref([
  { username: '小鸡毛', todos: [], todayStudySeconds: 0 },
  { username: '小白', todos: [], todayStudySeconds: 0 }
])

const historyDays = 14
const earliestDate = ref('')
const loadedStartDate = ref('')
const loadedEndDate = ref('')

const canLoadMore = computed(() => {
  if (!earliestDate.value || !loadedStartDate.value) return false
  return loadedStartDate.value > earliestDate.value
})

const newTodoText = ref('')

// 占位素材
const leftChar = '/assets/placeholders/character_left.svg'
const rightChar = '/assets/placeholders/character_right.svg'
const listItemImg = '/assets/placeholders/list_item.svg'
const historyPanelImg = '/assets/placeholders/history_panel.svg'
const dragHandleIcon = '/assets/placeholders/drag_handle.svg'
// 时钟不使用“背景色/底板”，只显示文字

const showHistory = ref(false)
const showTodo = ref(false)
const todoTargetUsername = ref('')
const todoEditable = ref(false)

function displayName(username) {
  if (username === 'userA' || username === '小鸡毛') return '小鸡毛'
  if (username === 'userB' || username === '小白') return '小白'
  return username || '-'
}

const avatarOk = reactive({ left: true, right: true })

function isLeftUser(username) {
  return username === 'userA' || username === '小鸡毛'
}

function isRightUser(username) {
  return username === 'userB' || username === '小白'
}

function getAvatarSrc(username) {
  // 沿用原文件名，避免用户资源需要跟着改名
  if (isLeftUser(username)) return '/assets/user/avatar_userA.png'
  if (isRightUser(username)) return '/assets/user/avatar_userB.png'
  return ''
}
function isAvatarOk(username) {
  if (isLeftUser(username)) return avatarOk.left
  if (isRightUser(username)) return avatarOk.right
  return false
}
function markAvatarError(username) {
  if (isLeftUser(username)) avatarOk.left = false
  if (isRightUser(username)) avatarOk.right = false
}

const meUser = computed(() => {
  const myName = me.value?.username
  if (!myName) return null
  return users.value.find((u) => u.username === myName) || null
})

// 计时中：UI 需要“今日学习时长”实时变化。
// 服务端只在每 60s（或停止时）累计入库；这里在显示层叠加本地未上报的增量。
const runningDeltaSeconds = computed(() => {
  if (!running.value || !startedAtMs) return 0
  const baseNow = now.value instanceof Date ? now.value.getTime() : Date.now()
  return Math.max(0, Math.floor((baseNow - startedAtMs) / 1000))
})

function todaySecondsForUser(u) {
  const base = Number(u?.todayStudySeconds || 0)
  if (u?.username && u.username === me.value?.username) return base + runningDeltaSeconds.value
  return base
}

const meTodaySecondsLive = computed(() => (meUser.value ? todaySecondsForUser(meUser.value) : 0))
const todoTodaySecondsLive = computed(() => (todoUser.value ? todaySecondsForUser(todoUser.value) : 0))

const todoPos = ref({ x: 0, y: 0 })
let todoDragActive = false
let todoDragOffsetX = 0
let todoDragOffsetY = 0

const TODO_FLOAT_W = 420
const TODO_FLOAT_H = 520

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function loadTodoPos() {
  try {
    const raw = localStorage.getItem('todoFloatPos')
    if (!raw) return
    const obj = JSON.parse(raw)
    if (typeof obj?.x === 'number' && typeof obj?.y === 'number') {
      todoPos.value = { x: obj.x, y: obj.y }
    }
  } catch (_) {
    // ignore
  }
}

function saveTodoPos() {
  try {
    localStorage.setItem('todoFloatPos', JSON.stringify(todoPos.value))
  } catch (_) {
    // ignore
  }
}

function ensureTodoPosInView() {
  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  const panelW = Math.min(TODO_FLOAT_W, w - 24)
  const panelH = Math.min(TODO_FLOAT_H, h - 24)
  const x = todoPos.value.x || Math.floor((w - panelW) / 2)
  const y = todoPos.value.y || Math.floor((h - panelH) / 2)
  todoPos.value = {
    x: clamp(x, 12, Math.max(12, w - panelW - 12)),
    y: clamp(y, 12, Math.max(12, h - panelH - 12))
  }
}

function isInteractiveEl(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return true
  return Boolean(el.closest?.('button, input, textarea, select, a'))
}

function onTodoPointerDown(e) {
  if (!showTodo.value) return
  // 输入/按钮上不触发拖动（避免影响点击、滚轮、输入）
  if (isInteractiveEl(e.target)) return
  startTodoDrag(e)
}

function startTodoDrag(e) {
  if (!showTodo.value) return
  // pointer 事件：鼠标/触控都可用
  e.preventDefault()
  e.stopPropagation()

  todoDragActive = true
  todoDragOffsetX = e.clientX - todoPos.value.x
  todoDragOffsetY = e.clientY - todoPos.value.y

  try {
    e.currentTarget?.setPointerCapture?.(e.pointerId)
  } catch (_) {
    // ignore
  }

  window.addEventListener('pointermove', onTodoDragMove)
  window.addEventListener('pointerup', stopTodoDrag)
}

function onTodoDragMove(e) {
  if (!todoDragActive) return
  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  const panelW = Math.min(TODO_FLOAT_W, w - 24)
  const panelH = Math.min(TODO_FLOAT_H, h - 24)
  const nextX = e.clientX - todoDragOffsetX
  const nextY = e.clientY - todoDragOffsetY
  todoPos.value = {
    x: clamp(nextX, 12, Math.max(12, w - panelW - 12)),
    y: clamp(nextY, 12, Math.max(12, h - panelH - 12))
  }
}

function stopTodoDrag() {
  todoDragActive = false
  window.removeEventListener('pointermove', onTodoDragMove)
  window.removeEventListener('pointerup', stopTodoDrag)
  saveTodoPos()
}

const todoUser = computed(() => {
  if (!todoTargetUsername.value) return null
  return users.value.find((u) => u.username === todoTargetUsername.value) || null
})

const todoThemeClass = computed(() => {
  // 左边小狗对应 userA：淡黄色主题；右边 userB：白色主题（默认）
  if (isLeftUser(todoUser.value?.username)) return 'todo-theme-golden'
  return 'todo-theme-white'
})

function closeTodo() {
  showTodo.value = false
}

function openTodo(targetUsername, editable) {
  const myName = me.value?.username
  todoTargetUsername.value = targetUsername
  todoEditable.value = Boolean(editable && myName && targetUsername === myName)
  // 不要遮挡/打断其它操作：保持菜单/页面可用，但为了避免多层弹窗冲突，关闭学习记录。
  showHistory.value = false
  showTodo.value = true
  ensureTodoPosInView()
}

function openHistory() {
  showHistory.value = true
  reloadHistoryFromToday()
}

function todayIsoString() {
  const d = now.value instanceof Date ? new Date(now.value) : new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function historyListForUser(u) {
  const list = Array.isArray(u?.history) ? u.history : []
  const todayISO = todayIsoString()
  // 从今天开始向过去展示；未来日期过滤；不做“缺失日期补 0”
  return list
    .filter((h) => h?.date && h.date <= todayISO)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

async function reloadHistoryFromToday() {
  error.value = ''
  try {
    const end = todayIsoString()
    const history = await apiGet(`/api/study/history?days=${historyDays}&end=${end}`)

    earliestDate.value = history.earliestDate || ''
    loadedStartDate.value = history.startDate || ''
    loadedEndDate.value = history.endDate || ''

    const historyMap = new Map((history.users || []).map((u) => [u.username, u.history || []]))
    users.value = users.value.map((u) => ({
      ...u,
      history: historyMap.get(u.username) || []
    }))
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

function onDogClick(evt) {
  const dog = evt?.detail?.dog
  const myName = me.value?.username
  if (!myName) return

  if (myName === 'userA') {
    if (dog === 'left') openTodo('userA', true)
    else if (dog === 'right') openTodo('userB', false)
  } else if (myName === 'userB') {
    if (dog === 'right') openTodo('userB', true)
    else if (dog === 'left') openTodo('userA', false)
  }
}

function authHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

function isMe(username) {
  return me.value?.username === username
}

function formatSeconds(total) {
  const s = Math.max(0, Math.floor(total || 0))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function shortDate(dateISO) {
  // YYYY-MM-DD -> MM-DD
  if (!dateISO || typeof dateISO !== 'string') return String(dateISO || '')
  const parts = dateISO.split('-')
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : dateISO
}

function addDaysISO(dateISO, deltaDays) {
  if (!dateISO) return ''
  const [y, m, d] = dateISO.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function mergeHistory(existing, incoming, direction) {
  // direction: 'prepend' | 'replace'
  if (direction === 'replace') return incoming
  const byDate = new Map(existing.map((h) => [h.date, h.seconds]))
  for (const h of incoming) {
    if (!byDate.has(h.date)) byDate.set(h.date, h.seconds)
  }
  return Array.from(byDate.entries())
    .map(([date, seconds]) => ({ date, seconds }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

async function apiGet(path) {
  const res = await fetch(path, { headers: authHeaders() })
  const data = await res.json()
  if (res.status === 401) {
    localStorage.removeItem('token')
    router.push('/login')
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) throw new Error(data?.error || '请求失败')
  return data
}

async function apiPost(path, body) {
  const res = await fetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json()
  if (res.status === 401) {
    localStorage.removeItem('token')
    router.push('/login')
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) throw new Error(data?.error || '请求失败')
  return data
}

async function apiPatch(path, body) {
  const res = await fetch(path, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json()
  if (res.status === 401) {
    localStorage.removeItem('token')
    router.push('/login')
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) throw new Error(data?.error || '请求失败')
  return data
}

async function apiPut(path, body) {
  const res = await fetch(path, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) })
  const data = await res.json()
  if (res.status === 401) {
    localStorage.removeItem('token')
    router.push('/login')
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) throw new Error(data?.error || '请求失败')
  return data
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE', headers: authHeaders() })
  const data = await res.json()
  if (res.status === 401) {
    localStorage.removeItem('token')
    router.push('/login')
    throw new Error('登录已过期，请重新登录')
  }
  if (!res.ok) throw new Error(data?.error || '请求失败')
  return data
}

async function refresh() {
  error.value = ''
  try {
    const profile = await apiGet('/api/me')
    me.value = profile.user

    const overview = await apiGet('/api/overview/today')
    const history = await apiGet(`/api/study/history?days=${historyDays}`)

    earliestDate.value = history.earliestDate || ''
    loadedStartDate.value = history.startDate || ''
    loadedEndDate.value = history.endDate || ''

    const historyMap = new Map((history.users || []).map((u) => [u.username, u.history || []]))
    users.value = (overview.users || []).map((u) => ({
      ...u,
      history: historyMap.get(u.username) || []
    }))
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

async function loadMoreHistory() {
  if (!canLoadMore.value) return
  error.value = ''
  try {
    // 继续向过去翻一页：end = 当前已加载 start 的前一天
    const nextEnd = addDaysISO(loadedStartDate.value, -1)
    const history = await apiGet(`/api/study/history?days=${historyDays}&end=${nextEnd}`)

    earliestDate.value = history.earliestDate || earliestDate.value
    loadedStartDate.value = history.startDate || loadedStartDate.value
    // loadedEndDate 保持首次加载的 end（一般是 today），不随“加载更多”变化

    const incomingByUser = new Map((history.users || []).map((u) => [u.username, u.history || []]))
    users.value = users.value.map((u) => ({
      ...u,
      history: mergeHistory(u.history || [], incomingByUser.get(u.username) || [], 'prepend')
    }))
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

function logout() {
  localStorage.removeItem('token')
  router.push('/login')
}

async function addTodo() {
  if (!newTodoText.value.trim()) return
  try {
    await apiPost('/api/todos', { text: newTodoText.value.trim() })
    newTodoText.value = ''
    await refresh()
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

async function toggleTodo(todo) {
  try {
    await apiPatch(`/api/todos/${todo.id}`, { done: !todo.done })
    await refresh()
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

async function deleteTodo(todo) {
  try {
    await apiDelete(`/api/todos/${todo.id}`)
    await refresh()
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

// 学习计时：前端计时 + 定时上报
const running = ref(false)
let startedAtMs = 0
let pingTimer = null

// 番茄钟（Pomodoro）：本地倒计时，不影响学习计时上报
const POMO_STATE_KEY_BASE = 'pomodoroState'
function pomoStorageKeyFor(username) {
  const u = (username || '').trim()
  return u ? `${POMO_STATE_KEY_BASE}:${u}` : POMO_STATE_KEY_BASE
}

function currentPomoStorageKey() {
  return pomoStorageKeyFor(me.value?.username)
}

function migrateLegacyPomoStateIfNeeded(username) {
  // 兼容历史：以前用固定 key，导致同机切换用户会覆盖。
  // 现在按用户拆分：若用户 key 不存在但旧 key 存在，则迁移一次。
  try {
    const legacyRaw = localStorage.getItem(POMO_STATE_KEY_BASE)
    if (!legacyRaw) return
    const userKey = pomoStorageKeyFor(username)
    if (userKey === POMO_STATE_KEY_BASE) return
    if (localStorage.getItem(userKey)) return
    localStorage.setItem(userKey, legacyRaw)
    localStorage.removeItem(POMO_STATE_KEY_BASE)
  } catch (_) {
    // ignore
  }
}

const pomoIconSrc = '/assets/user/pomodoro_tomato.png'
const pomoIconOk = ref(true)
const pomoMode = ref('work') // work | short | long
const pomoRunning = ref(false)
const pomoEndAtMs = ref(0)
const pomoRemainingSeconds = ref(25 * 60)
const pomoCompleted = ref(0)

const pomoConfig = {
  workSeconds: 25 * 60,
  shortBreakSeconds: 5 * 60,
  longBreakSeconds: 15 * 60,
  longBreakEvery: 4
}

const pomoModeLabel = computed(() => {
  if (pomoMode.value === 'work') return '专注 25'
  if (pomoMode.value === 'short') return '短休 05'
  return '长休 15'
})

const pomoTimeText = computed(() => {
  const s = Math.max(0, Math.floor(pomoRemainingSeconds.value || 0))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
})

function pomoDefaultSecondsForMode(mode) {
  if (mode === 'work') return pomoConfig.workSeconds
  if (mode === 'short') return pomoConfig.shortBreakSeconds
  return pomoConfig.longBreakSeconds
}

function savePomodoroState() {
  try {
    const key = currentPomoStorageKey()
    localStorage.setItem(
      key,
      JSON.stringify({
        mode: pomoMode.value,
        running: Boolean(pomoRunning.value),
        endAtMs: Number(pomoEndAtMs.value || 0),
        remainingSeconds: Number(pomoRemainingSeconds.value || 0),
        completed: Number(pomoCompleted.value || 0)
      })
    )
  } catch (_) {
    // ignore
  }
}

function loadPomodoroState() {
  try {
    migrateLegacyPomoStateIfNeeded(me.value?.username)
    const raw = localStorage.getItem(currentPomoStorageKey())
    if (!raw) return
    const obj = JSON.parse(raw)
    if (obj?.mode) pomoMode.value = String(obj.mode)
    if (typeof obj?.completed === 'number') pomoCompleted.value = Math.max(0, Math.floor(obj.completed))
    if (typeof obj?.remainingSeconds === 'number') {
      pomoRemainingSeconds.value = Math.max(0, Math.floor(obj.remainingSeconds))
    }
    if (typeof obj?.endAtMs === 'number') pomoEndAtMs.value = Math.floor(obj.endAtMs)
    if (typeof obj?.running === 'boolean') pomoRunning.value = obj.running
  } catch (_) {
    // ignore
  }
}

function syncPomodoroRemaining() {
  if (!pomoRunning.value) return
  const endAt = Number(pomoEndAtMs.value || 0)
  if (!endAt) return
  const left = Math.ceil((endAt - Date.now()) / 1000)
  pomoRemainingSeconds.value = Math.max(0, left)
}

function advancePomodoroPhase() {
  // 完成当前阶段后，自动切换到下一阶段；默认不自动开始（更符合“自己点开始”）
  pomoRunning.value = false
  pomoEndAtMs.value = 0

  if (pomoMode.value === 'work') {
    pomoCompleted.value += 1
    const isLong = pomoCompleted.value % pomoConfig.longBreakEvery === 0
    pomoMode.value = isLong ? 'long' : 'short'
  } else {
    pomoMode.value = 'work'
  }

  pomoRemainingSeconds.value = pomoDefaultSecondsForMode(pomoMode.value)

  try {
    document.title = `${pomoModeLabel.value} 完成 · 线上自习室`
  } catch (_) {
    // ignore
  }
  savePomodoroState()
}

function togglePomodoro() {
  if (!pomoRunning.value) {
    // start/resume
    const left = Math.max(1, Math.floor(pomoRemainingSeconds.value || 0))
    pomoEndAtMs.value = Date.now() + left * 1000
    pomoRunning.value = true
    savePomodoroState()
  } else {
    // pause
    syncPomodoroRemaining()
    pomoRunning.value = false
    pomoEndAtMs.value = 0
    savePomodoroState()
  }
}

function resetPomodoro() {
  pomoRunning.value = false
  pomoEndAtMs.value = 0
  pomoRemainingSeconds.value = pomoDefaultSecondsForMode(pomoMode.value)
  savePomodoroState()
}

function skipPomodoro() {
  // 直接进入下一阶段（不计入额外番茄）
  advancePomodoroPhase()
}

async function flushStudyDelta(deltaSeconds) {
  if (!deltaSeconds || deltaSeconds <= 0) return
  await apiPost('/api/study/add', { seconds: deltaSeconds })
}

async function toggleTimer() {
  error.value = ''
  try {
    if (!running.value) {
      running.value = true
      startedAtMs = Date.now()
      pingTimer = setInterval(async () => {
        const delta = Math.floor((Date.now() - startedAtMs) / 1000)
        if (delta >= 60) {
          startedAtMs = Date.now()
          await flushStudyDelta(delta)
          await refresh()
        }
      }, 15000)
    } else {
      running.value = false
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = null
      const delta = Math.floor((Date.now() - startedAtMs) / 1000)
      startedAtMs = 0
      await flushStudyDelta(delta)
      await refresh()
    }
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

onMounted(async () => {
  readFullscreenState()
  document.addEventListener('fullscreenchange', readFullscreenState)
  document.addEventListener('webkitfullscreenchange', readFullscreenState)

  bgSceneId.value = clampSceneId(localStorage.getItem(BG_SCENE_STORAGE_KEY) || 1)
  emitSceneId(bgSceneId.value)

  bgAutoMinutes.value = clampAutoMinutes(localStorage.getItem(BG_AUTO_STORAGE_KEY) || 0)
  startAutoScene(bgAutoMinutes.value)

  clockTimer = setInterval(() => (now.value = new Date()), 250)
  window.addEventListener('bg-dog-click', onDogClick)
  document.addEventListener('pointerdown', onDocumentPointerDown)
  loadTodoPos()
  loadCountdownCache()
  await refresh()
  loadPomodoroState()
  await loadCountdownFromServer()
  countdownLoaded.value = true
  // 防止“旧状态 endAt 已经过期”导致卡住
  syncPomodoroRemaining()
  if (pomoRunning.value && pomoRemainingSeconds.value <= 0) advancePomodoroPhase()
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', readFullscreenState)
  document.removeEventListener('webkitfullscreenchange', readFullscreenState)

  if (clockTimer) clearInterval(clockTimer)
  if (pingTimer) clearInterval(pingTimer)
  stopAutoScene()
  stopTodoDrag()
  window.removeEventListener('bg-dog-click', onDogClick)
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (countdownSaveTimer) clearTimeout(countdownSaveTimer)
})

// 番茄钟：使用现有 now 定时器驱动（无需额外 setInterval）
let lastPomoDoneKey = ''
watchEffect(() => {
  // 依赖 now，确保每 ~250ms 刷新一次
  now.value

  if (!pomoRunning.value) return
  syncPomodoroRemaining()

  if (pomoRemainingSeconds.value > 0) {
    savePomodoroState()
    try {
      document.title = `${pomoTimeText.value} · ${pomoModeLabel.value}`
    } catch (_) {
      // ignore
    }
    return
  }

  const doneKey = `${pomoMode.value}-${pomoCompleted.value}-${pomoEndAtMs.value}`
  if (lastPomoDoneKey !== doneKey) {
    lastPomoDoneKey = doneKey
    advancePomodoroPhase()
  }
})
</script>

<style scoped>
.room{
  min-height: 100vh;
  pointer-events: none;

  /* 左上角组件对齐：让音乐“图标按钮”的 x 与倒计时“天数徽标”的 x 对齐 */
  --corner-left: 22px;
  --countdown-side-w: 160px;
  --countdown-badge-overlap: -18px;
  --music-side-w: 80px;
  --music-side-offset: -36px;
  --music-icon-overlap: 12px;
  --corner-music-top: 170px;

  --corner-message-top: 262px;

  --message-side-w: 96px;
  --message-side-offset: -30px;
  --message-icon-overlap: 12px;
}

.corner-countdown{
  position: fixed;
  top: 22px;
  left: var(--corner-left);
  z-index: 80;
  pointer-events: auto;
}

.corner-countdown.is-open{
  z-index: 220;
}

.corner-music{
  position: fixed;
  top: var(--corner-music-top);
  left: calc(
    var(--corner-left)
    + (var(--countdown-side-w) + var(--countdown-badge-overlap))
    - (var(--music-side-w))
  );
  z-index: 80;
  pointer-events: auto;
}

.corner-music.is-open{
  z-index: 220;
}

.corner-message{
  position: fixed;
  top: var(--corner-message-top);
  left: calc(
    var(--corner-left)
    + (var(--countdown-side-w) + var(--countdown-badge-overlap))
    - (var(--message-side-w))
  );
  z-index: 90;
  pointer-events: auto;
}

.corner-message.is-open{
  z-index: 220;
}

.corner-message-row{
  display: flex;
  align-items: center;
  gap: 0px;
}

.corner-message-side{
  width: var(--message-side-w);
  height: var(--message-side-w);
  transform: translateX(var(--message-side-offset));
  object-fit: contain;
  user-select: none;
  cursor: pointer;
  z-index: 1;
  filter: drop-shadow(0 16px 30px rgba(0,0,0,0.22));
  transition: transform 140ms ease, filter 180ms ease;
}

.corner-message-side:hover{
  transform: translateX(var(--message-side-offset)) translateY(-1px);
  filter: drop-shadow(0 18px 34px rgba(0,0,0,0.22));
}

.corner-message-icon{
  position: relative;
  width: 42px;
  height: 42px;
  margin-left: var(--message-icon-overlap);
  z-index: 2;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(120, 120, 255, 0.92);
  box-shadow:
    0 18px 34px rgba(0,0,0,0.22),
    0 0 0 10px rgba(120, 120, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 140ms ease,
    box-shadow 180ms ease,
    background 180ms ease,
    filter 180ms ease;
}

.corner-message-icon:hover{
  transform: translateY(-2px) scale(1.03);
  background: rgba(104, 104, 255, 0.96);
  box-shadow:
    0 26px 46px rgba(0,0,0,0.26),
    0 0 0 14px rgba(120, 120, 255, 0.16);
  filter: saturate(1.06) brightness(1.02);
}

.message-menu{
  position: absolute;
  left: 0;
  top: calc(100% + 10px);
  width: min(460px, calc(100vw - 32px));
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(20, 10, 18, 0.12);
  box-shadow: 0 26px 60px rgba(0,0,0,0.24);
  padding: 14px;
  z-index: 230;
  pointer-events: auto;
}

.message-menu *{ pointer-events: auto; }

.message-menu-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(20, 10, 18, 0.10);
}

.message-menu-title{
  font-weight: 950;
  color: rgba(16, 10, 18, 0.92);
  letter-spacing: 1px;
}

.message-list{
  margin-top: 10px;
  max-height: min(420px, calc(100vh - 220px));
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-empty{
  padding: 14px 10px;
  color: rgba(16, 10, 18, 0.62);
  font-weight: 800;
}

.message-item{
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(250, 250, 252, 0.96);
  border: 1px solid rgba(20, 10, 18, 0.08);
}

.message-meta{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.message-author{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 950;
  color: rgba(16, 10, 18, 0.88);
  font-size: 12px;
}

.message-avatar{
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid rgba(16, 10, 18, 0.10);
}

.message-time{
  font-size: 12px;
  color: rgba(16, 10, 18, 0.55);
  font-weight: 800;
}

.message-text{
  color: rgba(16, 10, 18, 0.84);
  font-weight: 750;
  line-height: 1.35;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-compose{
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.message-input{
  flex: 1;
  resize: none;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid rgba(20, 10, 18, 0.12);
  background: rgba(255, 255, 255, 0.82);
  color: rgba(16, 10, 18, 0.88);
  font-weight: 750;
  font-size: 14px;
  outline: none;
}

.message-input::placeholder{ color: rgba(16, 10, 18, 0.40); }

.message-error{
  margin-top: 8px;
  color: rgba(220, 40, 40, 0.92);
  font-weight: 850;
}

.corner-music-row{
  display: flex;
  align-items: center;
  gap: 0px;
}

.corner-music-side{
  width: var(--music-side-w);
  height: var(--music-side-w);
  transform: translateX(var(--music-side-offset));
  object-fit: contain;
  user-select: none;
  cursor: pointer;
  z-index: 1;
  filter: drop-shadow(0 16px 30px rgba(0,0,0,0.22));
  transition: transform 140ms ease, filter 180ms ease;
}

.corner-music-side:hover{
  transform: translateX(var(--music-side-offset)) translateY(-1px);
  filter: drop-shadow(0 18px 34px rgba(0,0,0,0.22));
}

.corner-side-placeholder{
  opacity: 0;
}

.corner-music-icon{
  position: relative;
  width: 42px;
  height: 42px;
  margin-left: var(--music-icon-overlap);
  z-index: 2;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(56, 160, 255, 0.92);
  box-shadow:
    0 18px 34px rgba(0,0,0,0.22),
    0 0 0 10px rgba(56, 160, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 140ms ease,
    box-shadow 180ms ease,
    background 180ms ease,
    filter 180ms ease;
}

.corner-music-icon:hover{
  transform: translateY(-2px) scale(1.03);
  background: rgba(40, 148, 255, 0.96);
  box-shadow:
    0 26px 46px rgba(0,0,0,0.26),
    0 0 0 14px rgba(56, 160, 255, 0.16);
  filter: saturate(1.08) brightness(1.02);
}

.music-menu{
  position: absolute;
  left: 0;
  top: calc(100% + 10px);
  width: min(320px, calc(100vw - 32px));
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(20, 10, 18, 0.12);
  box-shadow: 0 26px 60px rgba(0,0,0,0.24);
  padding: 12px;
  z-index: 230;
  pointer-events: auto;
}

.music-menu *{ pointer-events: auto; }

.music-menu-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(20, 10, 18, 0.10);
}

.music-menu-title{
  font-weight: 950;
  color: rgba(16, 10, 18, 0.92);
  letter-spacing: 1px;
}

.music-links{
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 12px;
}

.music-link{
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  background: rgba(250, 250, 252, 0.96);
  border: 1px solid rgba(20, 10, 18, 0.08);
  color: rgba(16, 10, 18, 0.88);
  font-weight: 850;
  text-decoration: none;
  transition: transform 140ms ease, box-shadow 160ms ease;
}

.music-link:hover{
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(0,0,0,0.18);
}

.corner-countdown-btn{
  display: inline-block;
}

.corner-countdown-row{
  display: flex;
  align-items: center;
  gap: 0px;
}

.corner-countdown-badge{
  position: relative;
  min-width: 56px;
  height: 42px;
  padding: 0 14px;
  margin-left: var(--countdown-badge-overlap);
  z-index: 2;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 52, 52, 0.92);
  color: rgba(255, 255, 255, 0.98);
  font-weight: 950;
  letter-spacing: 1px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 18px;
  box-shadow:
    0 18px 34px rgba(0,0,0,0.22),
    0 0 0 10px rgba(255, 80, 80, 0.10);
  transition:
    transform 140ms ease,
    box-shadow 180ms ease,
    background 180ms ease,
    filter 180ms ease;
}

.corner-countdown-badge:hover{
  transform: translateY(-2px) scale(1.03);
  background: rgba(255, 42, 42, 0.96);
  box-shadow:
    0 26px 46px rgba(0,0,0,0.26),
    0 0 0 14px rgba(255, 80, 80, 0.14);
  filter: saturate(1.10) brightness(1.03);
}

.corner-countdown-side{
  width: var(--countdown-side-w);
  height: var(--countdown-side-w);
  object-fit: contain;
  user-select: none;
  cursor: pointer;
  z-index: 1;
  filter: drop-shadow(0 18px 34px rgba(0,0,0,0.22));
}

.corner-countdown-side:hover{
  transform: translateY(-1px);
}

.countdown-menu{
  position: absolute;
  left: 0;
  top: calc(100% + 10px);
  margin-top: 0;
  width: min(520px, calc(100vw - 32px));
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(20, 10, 18, 0.12);
  box-shadow: 0 26px 60px rgba(0,0,0,0.24);
  padding: 12px;
  z-index: 230;
  pointer-events: auto;
}

.countdown-menu *{
  pointer-events: auto;
}

.countdown-menu-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(20, 10, 18, 0.10);
}

.countdown-menu-title{
  font-weight: 950;
  color: rgba(16, 10, 18, 0.92);
  letter-spacing: 1px;
}

.countdown-section{
  margin-top: 12px;
}

.countdown-section-title{
  font-weight: 900;
  opacity: 0.85;
  margin-bottom: 8px;
}

.countdown-row{
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(250, 250, 252, 0.96);
  border: 1px solid rgba(20, 10, 18, 0.08);
  position: relative;
}

.countdown-row + .countdown-row{ margin-top: 8px; }

.countdown-name{
  width: 64px;
  font-weight: 950;
  color: rgba(16, 10, 18, 0.86);
}

.countdown-name-input{
  flex: 1;
  min-width: 140px;
  height: 34px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(20, 10, 18, 0.12);
  background: rgba(255,255,255,0.92);
  outline: none;
  pointer-events: auto;
  cursor: text;
  position: relative;
  z-index: 1;
  color: rgba(16, 10, 18, 0.92);
  caret-color: rgba(16, 10, 18, 0.92);
}

.countdown-name-input::placeholder{
  color: rgba(16, 10, 18, 0.45);
}

.countdown-name-input:focus{
  border-color: rgba(255, 64, 64, 0.30);
  box-shadow:
    0 16px 30px rgba(0,0,0,0.12),
    0 0 0 6px rgba(255, 80, 80, 0.12);
}

.countdown-date{
  height: 34px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(20, 10, 18, 0.12);
  background: rgba(255,255,255,0.92);
  outline: none;
  pointer-events: auto;
  cursor: pointer;
  position: relative;
  z-index: 1;
  color: rgba(16, 10, 18, 0.92);
  caret-color: rgba(16, 10, 18, 0.92);
}

.countdown-date:focus{
  border-color: rgba(255, 64, 64, 0.30);
  box-shadow:
    0 16px 30px rgba(0,0,0,0.12),
    0 0 0 6px rgba(255, 80, 80, 0.12);
}

.countdown-days{
  width: 86px;
  text-align: right;
  font-weight: 950;
  color: rgba(16, 10, 18, 0.78);
  white-space: nowrap;
}

.countdown-days-red{
  color: rgba(255, 64, 64, 0.98);
}

.countdown-empty{
  opacity: 0.7;
  padding: 6px 2px;
}

.countdown-add{
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hud-top{
  position: fixed;
  top: 46px;
  left: 50%;
  transform: translateX(-50%);
  width: min(980px, calc(100% - 24px));
  z-index: 20;
  pointer-events: none;
}

.hud-clock{
  position: relative;
  margin: 0 auto;
  width: fit-content;
  max-width: calc(100% - 120px);
  pointer-events: none;
}

.hud-clock-text{
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 80px;
  font-weight: 950;
  letter-spacing: 3px;
  color: rgba(255, 255, 255, 0.98);
  line-height: 1;
  -webkit-text-stroke: 1px rgba(20, 8, 18, 0.18);
  text-shadow:
    0 16px 38px rgba(0, 0, 0, 0.52),
    0 2px 12px rgba(255, 255, 255, 0.10);
}

.hud-menu{
  position: fixed;
  right: 60px;
  top: 46px;
  z-index: 30;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.hud-menu-top{
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.hud-menu-bottom{
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.hud-logout{
  height: 44px;
  padding: 0 16px;
}

.bg-auto{
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.22);
  background: rgba(0, 0, 0, 0.16);
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
  backdrop-filter: blur(4px);
  pointer-events: auto;
}

.bg-auto-label,
.bg-auto-unit{
  font-size: 12px;
  font-weight: 850;
  color: rgba(255,255,255,0.78);
  user-select: none;
}

.bg-auto-input{
  width: 64px;
  height: 30px;
  padding: 0 8px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.22);
  background: rgba(255, 255, 255, 0.10);
  color: rgba(255,255,255,0.92);
  outline: none;
  font-weight: 900;
}

.bg-auto-input::placeholder{ color: rgba(255,255,255,0.35); }

.hud-timer{
  margin-top: 10px;
  display: flex;
  justify-content: center;
  pointer-events: auto;
}

.hud-timer-row{
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(0, 0, 0, 0.18);
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
  backdrop-filter: blur(2px);
}


.hud-pomo{
  margin-top: 10px;
  display: flex;
  justify-content: center;
  pointer-events: auto;
}

.hud-pomo-row{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(0, 0, 0, 0.18);
  box-shadow: 0 18px 44px rgba(0,0,0,0.18);
  backdrop-filter: blur(2px);
  width: fit-content;
  max-width: calc(100% - 24px);
}

.hud-pomo-left{
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pomo-icon{
  width: 120px;
  height: 120px;
  margin: -30px 0 -22px -10px;
  object-fit: contain;
  user-select: none;
  filter:
    drop-shadow(0 14px 24px rgba(12, 6, 12, 0.26))
    saturate(1.08);
}

.hud-pomo-label{
  font-weight: 950;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 12px 26px rgba(0,0,0,0.35);
  opacity: 0.92;
  white-space: nowrap;
  font-size: 16px;
}

.hud-pomo-badge{
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 950;
  letter-spacing: 1px;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 12px 26px rgba(0,0,0,0.35);
  white-space: nowrap;
}

.hud-pomo-badge.pomo-work{
  background: rgba(255, 197, 84, 0.20);
  border-color: rgba(255, 197, 84, 0.30);
}

.hud-pomo-badge.pomo-short{
  background: rgba(76, 140, 255, 0.18);
  border-color: rgba(76, 140, 255, 0.28);
}

.hud-pomo-badge.pomo-long{
  background: rgba(150, 110, 255, 0.18);
  border-color: rgba(150, 110, 255, 0.28);
}

.hud-pomo-time{
  font-weight: 950;
  letter-spacing: 2px;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.98);
  text-shadow: 0 12px 26px rgba(0,0,0,0.45);
}

.hud-pomo-meta{
  font-weight: 950;
  opacity: 0.88;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 12px 26px rgba(0,0,0,0.35);
  white-space: nowrap;
}

.hud-pomo-actions{
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 980px){
  /* 小屏避免图标挤压过度：允许少一点外溢 */
  .pomo-icon{ margin: -18px 0 -18px -8px; }
}

.simple-btn{
  height: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(20, 10, 18, 0.24);
  background: rgba(255, 255, 255, 0.92);
  color: rgba(20, 10, 18, 0.92);
  font-weight: 950;
  letter-spacing: 1px;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(12, 6, 12, 0.14);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  white-space: nowrap;
  transition:
    transform 120ms ease,
    box-shadow 160ms ease,
    background 160ms ease,
    border-color 160ms ease,
    filter 160ms ease;
}

.simple-btn:hover{
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(76, 140, 255, 0.30);
  transform: translateY(-2px) scale(1.01);
  box-shadow:
    0 20px 40px rgba(12, 6, 12, 0.18),
    0 0 0 8px rgba(76, 140, 255, 0.12);
  filter: saturate(1.10) brightness(1.02);
}

.simple-btn:active{
  transform: translateY(0px);
  box-shadow: 0 10px 20px rgba(12, 6, 12, 0.10);
  filter: none;
}

.simple-btn:focus-visible{
  outline: none;
  box-shadow:
    0 16px 30px rgba(12, 6, 12, 0.14),
    0 0 0 6px rgba(76, 140, 255, 0.14);
}

.simple-btn-danger{
  background: rgba(255, 245, 245, 0.96);
  border-color: rgba(180, 40, 60, 0.22);
  color: rgba(140, 30, 50, 0.92);
}

.hud-timer-text{
  font-weight: 950;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.96);
  text-shadow: 0 12px 26px rgba(0,0,0,0.45);
}

.overlay{
  pointer-events: auto;
}

.overlay{
  position: fixed;
  inset: 0;
  background: rgba(12, 6, 12, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 40;
}

.overlay-history{
  z-index: 60;
}

.overlay.overlay-history{
  background: rgba(12, 6, 12, 0.32);
}


.todo-float{
  position: fixed;
  width: 420px;
  max-width: calc(100% - 24px);
  height: 520px;
  max-height: calc(100% - 24px);
  z-index: 58;
  pointer-events: auto;
}

.todo-panel-inner{
  width: 100%;
  height: 100%;
  padding: 18px;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.todo-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.todo-title{
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 950;
  letter-spacing: 1px;
  font-size: 20px;
  min-width: 0;
}

.user-avatar{
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(20, 10, 18, 0.10);
  box-shadow:
    0 14px 28px rgba(12, 6, 12, 0.14),
    0 0 0 6px rgba(255, 255, 255, 0.14);
}

.user-avatar-sm{
  width: 52px;
  height: 52px;
  border-radius: 50%;
  box-shadow:
    0 12px 22px rgba(12, 6, 12, 0.12),
    0 0 0 5px rgba(255, 255, 255, 0.14);
}

.todo-title > div{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.todo-header-right{
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-drag-handle{
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(20, 10, 18, 0.12);
  background: rgba(255, 255, 255, 0.85);
  cursor: grab;
  user-select: none;
}

.todo-drag-handle:active{
  cursor: grabbing;
}

.todo-drag-icon{
  width: 18px;
  height: 18px;
  opacity: 0.8;
}

.simple-input{
  width: 220px;
  max-width: 100%;
  height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(20, 10, 18, 0.14);
  background: rgba(255, 255, 255, 0.92);
  color: rgba(20, 10, 18, 0.92);
  font-weight: 900;
  outline: none;
  box-shadow: 0 10px 20px rgba(12, 6, 12, 0.08);
}

.simple-input::placeholder{
  color: rgba(20, 10, 18, 0.50);
}

.simple-check{
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(20, 10, 18, 0.18);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 16px rgba(12, 6, 12, 0.10);
  cursor: pointer;
  position: relative;
  flex: 0 0 auto;
}

.simple-check.checked{
  background: rgba(76, 140, 255, 0.16);
  border-color: rgba(76, 140, 255, 0.28);
}

.simple-check.checked::after{
  content: '';
  position: absolute;
  left: 7px;
  top: 5px;
  width: 8px;
  height: 12px;
  border-right: 2px solid rgba(30, 60, 120, 0.9);
  border-bottom: 2px solid rgba(30, 60, 120, 0.9);
  transform: rotate(45deg);
}

.simple-check.disabled{
  cursor: default;
  opacity: 0.7;
}

.todo-panel-simple{
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(20, 10, 18, 0.10);
  box-shadow:
    0 30px 70px rgba(12, 6, 12, 0.18),
    0 10px 22px rgba(12, 6, 12, 0.10);
  border-radius: 18px;
  color: rgba(20, 10, 18, 0.92);
  text-shadow: none;
}

/* Todo 主题：userA（左狗/小金毛）淡黄色 */
.todo-theme-golden{
  background: rgba(255, 248, 215, 0.86);
  border-color: rgba(160, 110, 20, 0.14);
  box-shadow:
    0 32px 74px rgba(12, 6, 12, 0.18),
    0 10px 22px rgba(12, 6, 12, 0.10),
    0 0 0 10px rgba(255, 216, 120, 0.08);
}

.todo-theme-golden .todo-item{
  background: rgba(255, 252, 236, 0.82) !important;
  border-color: rgba(160, 110, 20, 0.10) !important;
}

.todo-theme-golden .simple-btn{
  background: rgba(255, 252, 236, 0.96);
}

.todo-theme-golden .simple-btn:hover{
  border-color: rgba(255, 197, 84, 0.40);
  box-shadow:
    0 20px 40px rgba(12, 6, 12, 0.18),
    0 0 0 8px rgba(255, 197, 84, 0.14);
}

.todo-theme-golden .mode-edit{
  background: rgba(255, 197, 84, 0.22);
  border-color: rgba(255, 197, 84, 0.36);
}

.todo-theme-golden .mode-read{
  background: rgba(255, 197, 84, 0.14);
  border-color: rgba(255, 197, 84, 0.28);
}



.todo-panel-simple .user-running{
  color: rgba(20, 10, 18, 0.75);
  text-shadow: none;
}

.todo-meta{
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.todo-mode{
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 950;
  letter-spacing: 1px;
  font-size: 13px;
}

.mode-edit{
  background: rgba(255, 197, 84, 0.18);
  border: 1px solid rgba(255, 197, 84, 0.30);
}

.mode-read{
  background: rgba(76, 140, 255, 0.14);
  border: 1px solid rgba(76, 140, 255, 0.22);
}

.todo-today{
  font-weight: 900;
  opacity: 0.92;
}

.todo-tools{
  margin-top: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.todo-tools-left{
  display: flex;
  gap: 10px;
  align-items: center;
}

.todo-tools-right{
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.todo-list-panel{
  margin-top: 14px;
  flex: 1;
  overflow: auto;
  padding-right: 6px;
  overscroll-behavior: contain;
}

.todo-panel-simple .todo-item{
  background-image: none !important;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(20, 10, 18, 0.08);
  box-shadow: 0 10px 24px rgba(12, 6, 12, 0.08);
}

.todo-panel-simple .todo-text{
  color: rgba(20, 10, 18, 0.92);
}

.todo-panel-simple .todo-empty{
  color: rgba(20, 10, 18, 0.62);
}

.todo-empty{
  margin-top: 12px;
  text-align: center;
  font-weight: 900;
  opacity: 0.75;
}

.users-grid{
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 980px){
  .users-grid{ grid-template-columns: 1fr; }
  .hud-clock{ max-width: calc(100% - 90px); }
  .hud-clock-text{ font-size: 62px; }
}

.user-card{
  background: rgba(0,0,0,0.16);
  border-radius: 18px;
  padding: 14px;
}

.user-card-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.user-card-title{
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-title-icon{
  width: 42px;
  height: 42px;
}

.user-name{
  font-size: 18px;
  font-weight: 950;
}

.user-today{
  font-weight: 900;
  opacity: 0.95;
}

.user-tools{
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.user-tools-left{
  display: flex;
  gap: 10px;
  align-items: center;
}

.user-running{
  opacity: 0.85;
  font-size: 13px;
  font-weight: 900;
}

.user-tools-right{
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.todo-list{
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.todo-item{
  background-size: 100% 100%;
  background-repeat: no-repeat;
  padding: 12px 14px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.todo-left{
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.todo-check{
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.todo-text{
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-panel{
  width: 1100px;
  max-width: calc(100% - 24px);
  height: 720px;
  max-height: calc(100% - 24px);
  padding: 28px;
  box-sizing: border-box;
}

.history-panel-simple{
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(20, 10, 18, 0.10);
  box-shadow:
    0 30px 70px rgba(12, 6, 12, 0.18),
    0 10px 22px rgba(12, 6, 12, 0.10);
  border-radius: 18px;
  color: rgba(20, 10, 18, 0.92);
  text-shadow: none;
  backdrop-filter: blur(2px);
  overflow: hidden;
}

.history-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-title{
  font-size: 22px;
  font-weight: 950;
  letter-spacing: 1px;
}

.history-range{
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.history-range-text{
  font-weight: 900;
  opacity: 0.85;
}

.history-range-actions{
  display: flex;
  align-items: center;
  gap: 10px;
}

.history-range-end{
  opacity: 0.65;
  font-size: 12px;
  font-weight: 900;
}

.history-grid{
  margin-top: 14px;
  height: calc(100% - 120px);
  overflow: auto;
  padding-right: 6px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.history-user-card{
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(20, 10, 18, 0.08);
  box-shadow: 0 10px 24px rgba(12, 6, 12, 0.08);
  border-radius: 18px;
  padding: 14px;
}

.history-user-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-user-left{
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.history-user-name{
  font-size: 18px;
  font-weight: 950;
}

.history-user-today{
  font-weight: 900;
  opacity: 0.92;
}

.history-day-grid{
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.history-day-item{
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(20, 10, 18, 0.08);
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-day-date{
  font-weight: 950;
  opacity: 0.88;
}

.history-day-seconds{
  font-weight: 950;
}

@media (max-width: 980px){
  .history-grid{ grid-template-columns: 1fr; }
}
</style>
