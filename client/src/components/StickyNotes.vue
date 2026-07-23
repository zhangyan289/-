<template>
  <div
    v-if="myNotes"
    ref="notesContainerEl"
    class="sticky-notes-container"
    aria-label="便利贴"
    @pointerdown="onContainerPointerDown"
  >
    <div class="sticky-notes-user-header">
      <img
        class="sticky-notes-avatar"
        :src="getAvatarSrc(myUsername)"
        :alt="displayName(myUsername)"
        draggable="false"
        @dragstart.prevent
      />
      <span class="sticky-notes-user-name">{{ displayName(myUsername) }}</span>
    </div>
    <div class="sticky-notes-list">
      <div
        v-for="note in myNotes"
        :key="note.slotIndex"
        class="sticky-note"
        :class="`note-${note.type}`"
      >
        <div class="sticky-note-header">
          <span class="sticky-note-label">{{ noteLabel(note.type) }}</span>
        </div>
        <div class="sticky-note-title">{{ note.title }}</div>
        <div class="sticky-note-content">{{ note.content }}</div>
        <div class="sticky-note-time">{{ formatTime(note.generatedAt) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  me: { type: Object, default: null },
  users: { type: Array, default: () => [] }
})

const allNotes = ref({})
let pollTimer = null
const notesContainerEl = ref(null)

const dragScroll = {
  active: false,
  startY: 0,
  startScrollTop: 0
}

function onContainerPointerDown(e) {
  if (!e.isPrimary) return
  // 点击子元素时不启用拖拽滚动
  if (e.target !== notesContainerEl.value && !e.target?.classList?.contains('sticky-notes-list')) return

  const el = notesContainerEl.value
  if (!el) return

  dragScroll.active = false
  dragScroll.startY = e.clientY
  dragScroll.startScrollTop = el.scrollTop

  window.addEventListener('pointermove', onContainerPointerMove)
  window.addEventListener('pointerup', onContainerPointerUp)
  window.addEventListener('pointercancel', onContainerPointerUp)
  try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch (_) {}
}

function onContainerPointerMove(e) {
  if (dragScroll.startY === 0) return
  const dy = Math.abs(e.clientY - dragScroll.startY)
  if (!dragScroll.active && dy > 6) {
    dragScroll.active = true
  }
  if (!dragScroll.active) return

  const el = notesContainerEl.value
  if (!el) return
  el.scrollTop = dragScroll.startScrollTop - (e.clientY - dragScroll.startY)
}

function onContainerPointerUp(e) {
  window.removeEventListener('pointermove', onContainerPointerMove)
  window.removeEventListener('pointerup', onContainerPointerUp)
  window.removeEventListener('pointercancel', onContainerPointerUp)
  dragScroll.startY = 0
  dragScroll.active = false
}

const myUsername = computed(() => props.me?.username || '')

const myNotes = computed(() => {
  const name = myUsername.value
  if (!name) return []
  return (allNotes.value[name] || []).slice(0, 3)
})

function displayName(username) {
  if (username === 'userA' || username === '小鸡毛') return '小鸡毛'
  if (username === 'userB' || username === '小白') return '小白'
  return username || '-'
}

function getAvatarSrc(username) {
  if (username === 'userA' || username === '小鸡毛') return '/assets/user/avatar_userA.png'
  if (username === 'userB' || username === '小白') return '/assets/user/avatar_userB.png'
  return '/assets/user/avatar_userA.png'
}

function noteLabel(type) {
  const map = {
    english: '英语',
    math: '数学',
    cs408: '408',
    control: '自动控制',
    modern_control: '现代控制'
  }
  return map[type] || type
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ''
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${mm}-${dd} ${hh}:${mi}`
  } catch {
    return ''
  }
}

async function fetchNotes() {
  try {
    const res = await fetch('/api/sticky-notes', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    })
    const data = await res.json()
    if (data?.notes) allNotes.value = data.notes
  } catch {
    // ignore
  }
}

onMounted(() => {
  fetchNotes()
  pollTimer = setInterval(fetchNotes, 5 * 60 * 1000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.sticky-notes-container{
  position: fixed;
  top: 260px;
  right: 20px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  width: 220px;
  padding-right: 8px;
  scroll-behavior: auto;
  overscroll-behavior: contain;
  cursor: grab;
  touch-action: none;
}

.sticky-notes-container:active{
  cursor: grabbing;
}

/* 自定义滚动条 */
.sticky-notes-container::-webkit-scrollbar{
  width: 6px;
}

.sticky-notes-container::-webkit-scrollbar-track{
  background: rgba(255, 255, 255, 0.25);
  border-radius: 999px;
}

.sticky-notes-container::-webkit-scrollbar-thumb{
  background: rgba(120, 100, 80, 0.45);
  border-radius: 999px;
}

.sticky-notes-container::-webkit-scrollbar-thumb:hover{
  background: rgba(120, 100, 80, 0.65);
}

.sticky-notes-user-header{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 4px 12px rgba(12, 6, 12, 0.08);
  backdrop-filter: blur(4px);
  pointer-events: auto;
  cursor: default;
  flex-shrink: 0;
}

.sticky-notes-list{
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  cursor: default;
  flex-shrink: 0;
}

.sticky-note{
  padding: 12px;
  border-radius: 14px;
  box-shadow: 0 6px 18px rgba(12, 6, 12, 0.12);
  transform: rotate(-1deg);
  transition: transform 160ms ease, box-shadow 160ms ease;
  position: relative;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: auto;
  cursor: default;
}

.sticky-note:hover{
  transform: rotate(0deg) translateY(-3px);
  box-shadow: 0 10px 24px rgba(12, 6, 12, 0.18);
}

.sticky-note::after{
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.15);
  opacity: 0.35;
}

.note-english{
  background: linear-gradient(135deg, #fff9c4 0%, #fff59d 100%);
  border: 1px solid rgba(220, 180, 40, 0.25);
  color: rgba(80, 50, 10, 0.95);
}

.note-math{
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
  border: 1px solid rgba(60, 130, 200, 0.25);
  color: rgba(20, 40, 70, 0.95);
}

.note-cs408{
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  border: 1px solid rgba(60, 150, 80, 0.25);
  color: rgba(20, 60, 30, 0.95);
}

.note-control,
.note-modern_control,
.note-specialty{
  background: linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%);
  border: 1px solid rgba(180, 80, 120, 0.25);
  color: rgba(70, 20, 40, 0.95);
}

.sticky-note-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sticky-note-label{
  font-size: 10px;
  font-weight: 900;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: rgba(40, 20, 10, 0.85);
}

.sticky-note-title{
  font-weight: 950;
  font-size: 14px;
  line-height: 1.4;
  color: rgba(20, 10, 5, 0.95);
}

.sticky-note-content{
  font-weight: 700;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.92;
  flex: 1;
}

.sticky-note-time{
  font-size: 10px;
  font-weight: 800;
  opacity: 0.6;
  text-align: right;
}

@media (max-width: 1024px){
  .sticky-notes-container{
    top: 240px;
    right: 12px;
    width: 180px;
    max-height: calc(100vh - 280px);
  }

  .sticky-note{
    min-height: 90px;
    padding: 10px;
  }

  .sticky-note-title{
    font-size: 13px;
  }

  .sticky-note-content{
    font-size: 11px;
  }
}
</style>
