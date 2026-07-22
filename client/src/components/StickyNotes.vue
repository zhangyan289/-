<template>
  <div v-if="myNotes" class="sticky-notes-container" aria-label="便利贴">
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
  pointer-events: none;
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  width: 220px;
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
}

.sticky-notes-avatar{
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.85);
}

.sticky-notes-user-name{
  font-weight: 950;
  font-size: 13px;
  color: rgba(40, 20, 10, 0.9);
}

.sticky-notes-list{
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
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
.note-modern_control{
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
