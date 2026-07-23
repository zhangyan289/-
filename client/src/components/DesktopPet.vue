<template>
  <div class="desktop-pets" aria-hidden="false">
    <div
      v-for="pet in pets"
      :key="pet.key"
      class="pet-actor"
      :class="[pet.key, { 'is-eating': isEating(pet), 'is-dragging': pet.dragging, 'is-runaway': pet.runaway }]"
      :style="actorStyle(pet)"
      @pointerdown="onPetPointerDown(pet, $event)"
    >
      <img
        :src="petGifSrc(pet)"
        :alt="pet.name"
        class="pet-gif"
        draggable="false"
        @dragstart.prevent
        @error="pet.gifOk = false"
      />
      <div v-if="!pet.gifOk" class="pet-fallback">{{ pet.name }}</div>
      <button
        v-if="showQuizBubble(pet)"
        class="pet-quiz-bubble"
        :class="{ 'bubble-cooldown': isQuizCooldown(pet) }"
        type="button"
        @pointerdown.stop
        @click.stop="onQuizBubbleClick(pet)"
      >
        <span class="pet-quiz-bubble-text">{{ quizBubbleText(pet) }}</span>
        <span class="pet-quiz-bubble-tail" />
        <span v-if="!isQuizCooldown(pet)" class="pet-quiz-bulb" />
      </button>
    </div>

    <PetStatusPanel
      v-for="pet in pets"
      :key="`panel-${pet.key}`"
      :pet="pet"
      :user-points="userPoints"
      :food-config="foodConfig?.[pet.key] || {}"
      :feed-log="feedLogForPet(pet.key)"
      :visible="activePetKey === pet.key"
      @feed="feedPet(pet.key, $event)"
      @close="activePetKey = ''"
      @todo="openTodoForPet(pet.key)"
    />

    <PetQuizModal
      v-if="quizPet"
      :pet="quizPet"
      :visible="showQuizModal"
      :quiz="currentQuiz"
      :status="quizStatus"
      :result="quizResult"
      @close="showQuizModal = false"
      @answer="answerQuiz($event.petKey, $event.selectedOption)"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PetStatusPanel from './PetStatusPanel.vue'
import PetQuizModal from './PetQuizModal.vue'

const PET_DEFINITIONS = [
  { key: 'golden', name: '小鸡毛', side: 'left' },
  { key: 'white', name: '小白', side: 'right' }
]

const PET_GIF_BASE = {
  golden: '/assets/user/pets/golden',
  white: '/assets/user/pets/white'
}

const props = defineProps({
  me: { type: Object, default: null },
  users: { type: Array, default: () => [] },
  onOpenTodo: { type: Function, default: null }
})

const emit = defineEmits(['open-todo'])

const pets = ref(PET_DEFINITIONS.map((def) => ({
  ...def,
  happiness: 70,
  runaway: 0,
  runaway_since: null,
  eating_state: '',
  eating_until: '',
  feed_cooldown_until: '',
  total_feeds: 0,
  last_fed_by: '',
  current_state: '',
  dragging: false,
  gifOk: true,
  x: def.side === 'left' ? 24 : 180,
  y: 0
})))

const userPoints = ref(0)
const foodConfig = ref({})
const eatingGifMap = ref({})
const currentStates = ref({})
const feedLog = ref([])
const activePetKey = ref('')
const showQuizModal = ref(false)
const quizPetKey = ref('')
const currentQuiz = ref({})
const quizStatus = ref('loading')
const quizResult = ref(null)
const quizAvailability = ref({ golden: 'pending', white: 'pending' })

const QUOTE_POOL = [
  '命运的洪流不可阻挡，我的答案是向前',
  '请赐予我独行的勇气和敢于直视他人的双眼',
  '在黑暗的尽头，太阳扶着我站起来',
  '坚刚不可夺其志，万念不能乱其心',
  '世界颠倒，我不必随它倾斜',
  '万物流转，我即湍流',
  '飞鸟立枝不惧，非信枝实，而信己翼',
  '万物明澈，便向高处去',
  '面对年迈的寰宇，我们如此年轻',
  '生命就像一颗长满可能的树',
  '没有永恒的梅雨季，只有久违的艳阳天',
  '我相信缓慢、平和、细水长流的力量',
  '一切都很好，我听到自己向上的声音',
  '眼泪和坚持一样伟大',
  '祝来年春山昂首，我为己筹谋，不再自否',
  '向外求求而不得，向内求生生不息',
  '我要坚韧、要挣扎、要长青、要在四季潺潺地流淌',
  '痛苦只是流经我，我接受，我成长',
  '能否像棵树一样坚毅又盎然',
  '我想，生命这卷书，落款应是亭亭常青树',
  '世界有浮力，放松就会被托举',
  '灵魂的欲望是命运的先知',
  '命运多舛，我点头说好',
  '我的缺点向我进言，他说：有凹陷就会有高山相嵌'
]

const petQuote = ref({ golden: '', white: '' })

function pickQuote() {
  return QUOTE_POOL[Math.floor(Math.random() * QUOTE_POOL.length)]
}

function showQuizBubble(pet) {
  const status = quizAvailability.value[pet.key]
  return status === 'pending' || status === 'unknown' || status === 'cooldown'
}

function isQuizCooldown(pet) {
  return quizAvailability.value[pet.key] === 'cooldown'
}

function quizBubbleText(pet) {
  if (isQuizCooldown(pet)) {
    if (!petQuote.value[pet.key]) {
      petQuote.value[pet.key] = pickQuote()
    }
    return petQuote.value[pet.key]
  }
  return '你敢回答我的问题吗'
}

function onQuizBubbleClick(pet) {
  if (isQuizCooldown(pet)) {
    // 冷却中只显示固定的鼓励文案，不切换
    return
  }
  openQuizForPet(pet.key)
}

const quizPet = computed(() => {
  if (!quizPetKey.value) return null
  return pets.value.find((p) => p.key === quizPetKey.value) || null
})
let pollTimer = null

const baseY = computed(() => {
  const h = (typeof window !== 'undefined' && window.innerHeight) || 800
  return h - 220
})

onMounted(() => {
  pets.value.forEach((p) => { p.y = baseY.value })
  loadPetState()
  loadFeedLog()
  loadQuizStatus('golden')
  loadQuizStatus('white')
  pollTimer = setInterval(() => {
    loadPetState()
    loadFeedLog()
    loadQuizStatus('golden')
    loadQuizStatus('white')
  }, 15000)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  window.removeEventListener('resize', onResize)
})

async function loadQuizStatus(petKey) {
  try {
    const data = await fetchJSON(`/api/pets/quiz/status?petKey=${encodeURIComponent(petKey)}`)
    if (data?.status === 'cooldown') {
      quizAvailability.value[petKey] = 'cooldown'
      if (!petQuote.value[petKey]) petQuote.value[petKey] = pickQuote()
    } else {
      quizAvailability.value[petKey] = 'pending'
    }
  } catch {
    // ignore
  }
}

function onResize() {
  pets.value.forEach((p) => {
    p.y = Math.min(p.y, baseY.value)
  })
}

function actorStyle(pet) {
  return {
    transform: `translate3d(${pet.x}px, ${pet.y}px, 0)`,
    left: 0,
    top: 0
  }
}

function isEating(pet) {
  if (!pet.eating_state) return false
  if (!pet.eating_until) return true
  return new Date(pet.eating_until).getTime() > Date.now()
}

function petGifSrc(pet) {
  const base = PET_GIF_BASE[pet.key]
  if (pet.runaway) {
    // 离家出走 GIF 待补充，先用愉悦度1兜底
    const current = parseCurrentState(pet.current_state) || getDefaultCurrentState(pet)
    return `${base}/yyd_${current.level}_${current.sub}.gif`
  }
  if (isEating(pet) && pet.eating_state) {
    const fileName = eatingGifMap.value?.[pet.eating_state]
    if (fileName) return `${base}/${fileName}`
  }
  const current = parseCurrentState(pet.current_state) || getDefaultCurrentState(pet)
  return `${base}/yyd_${current.level}_${current.sub}.gif`
}

function parseCurrentState(value) {
  if (!value) return null
  const m = String(value).match(/^([1-5])\.(\d+)$/)
  if (!m) return null
  return { level: Number(m[1]), sub: Number(m[2]) }
}

function getDefaultCurrentState(pet) {
  const level = Math.min(5, Math.max(1, Math.floor(Number(pet.happiness || 0) / 20) + 1))
  return { level, sub: 1 }
}

function authHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  }
}

async function fetchJSON(path, opts = {}) {
  const res = await fetch(path, { headers: authHeaders(), ...opts })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || '请求失败')
  return data
}

async function loadPetState() {
  try {
    const data = await fetchJSON('/api/pets/state')
    userPoints.value = Number(data?.points || 0)
    foodConfig.value = data?.foodConfig || {}
    eatingGifMap.value = data?.eatingGifMap || {}
    currentStates.value = data?.currentStates || {}
    const stateMap = new Map((data?.pets || []).map((s) => [s.pet_key, s]))
    pets.value = pets.value.map((p) => {
      const s = stateMap.get(p.key)
      if (!s) return p
      return {
        ...p,
        happiness: clamp100(s.happiness),
        runaway: Number(s.runaway || 0),
        runaway_since: s.runaway_since || '',
        eating_state: s.eating_state || '',
        eating_until: s.eating_until || '',
        feed_cooldown_until: s.feed_cooldown_until || '',
        total_feeds: Number(s.total_feeds || 0),
        last_fed_by: s.last_fed_by || '',
        current_state: s.current_state || currentStates.value?.[p.key] || ''
      }
    })
  } catch {
    // ignore: 宠物接口失败不影响主页面
  }
}

async function loadFeedLog() {
  try {
    const data = await fetchJSON('/api/pets/feed-log')
    feedLog.value = data?.logs || []
  } catch {
    // ignore
  }
}

async function feedPet(petKey, foodKey) {
  try {
    const data = await fetchJSON('/api/pets/feed', {
      method: 'POST',
      body: JSON.stringify({ petKey, foodKey })
    })
    userPoints.value = Number(data?.points || 0)
    if (data?.feedLog) {
      feedLog.value = [...feedLog.value, data.feedLog]
    }
    const pet = pets.value.find((p) => p.key === petKey)
    if (pet && data?.pet) {
      Object.assign(pet, {
        happiness: clamp100(data.pet.happiness),
        runaway: Number(data.pet.runaway || 0),
        runaway_since: data.pet.runaway_since || '',
        eating_state: data.pet.eating_state || '',
        eating_until: data.pet.eating_until || '',
        feed_cooldown_until: data.pet.feed_cooldown_until || '',
        total_feeds: Number(data.pet.total_feeds || 0),
        last_fed_by: data.pet.last_fed_by || '',
        current_state: data.pet.current_state || ''
      })
    }
    // 同步另一只宠物的 current_state（如果同等级）
    await syncOtherPetState(petKey)
  } catch (e) {
    alert(e?.message || '投喂失败')
  }
}

async function syncOtherPetState(petKey) {
  try {
    const data = await fetchJSON('/api/pets/state')
    const currentStates = data?.currentStates || {}
    const stateMap = new Map((data?.pets || []).map((s) => [s.pet_key, s]))
    pets.value = pets.value.map((p) => {
      if (p.key === petKey) return p
      const s = stateMap.get(p.key)
      if (!s) return p
      // 只同步 current_state（同等级时子状态联动），避免覆盖 happiness 造成“瞬间清零”观感
      return {
        ...p,
        current_state: s.current_state || currentStates[p.key] || p.current_state
      }
    })
  } catch {
    // ignore
  }
}

function openTodoForPet(petKey) {
  activePetKey.value = ''
  const pet = pets.value.find((p) => p.key === petKey)
  if (!pet) return
  const myName = props.me?.username
  if (!myName) return
  const leftName = props.users.find((u) => u.username === '小鸡毛' || u.username === 'userA')?.username || '小鸡毛'
  const rightName = props.users.find((u) => u.username === '小白' || u.username === 'userB')?.username || '小白'
  const isMeLeft = myName === '小鸡毛' || myName === 'userA'
  const isMeRight = myName === '小白' || myName === 'userB'
  if (pet.side === 'left') {
    emit('open-todo', { username: leftName, editable: isMeLeft })
  } else if (pet.side === 'right') {
    emit('open-todo', { username: rightName, editable: isMeRight })
  }
}

function clamp100(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n || 0))))
}

function feedLogForPet(petKey) {
  return feedLog.value.filter((entry) => entry.petKey === petKey)
}

async function openQuizForPet(petKey) {
  activePetKey.value = ''
  quizPetKey.value = petKey
  showQuizModal.value = true
  quizStatus.value = 'loading'
  quizResult.value = null
  currentQuiz.value = {}
  await loadQuiz(petKey)
}

async function loadQuiz(petKey) {
  try {
    const data = await fetchJSON(`/api/pets/quiz?petKey=${encodeURIComponent(petKey)}`)
    if (data?.status === 'unavailable') {
      quizStatus.value = 'unavailable'
      currentQuiz.value = { reason: data.reason || '大模型服务暂不可用' }
      return
    }
    if (data?.status === 'cooldown') {
      quizStatus.value = 'cooldown'
      currentQuiz.value = { nextAt: data.nextAt || '' }
      return
    }
    if (data?.question && data?.options && data?.answer) {
      quizStatus.value = 'pending'
      currentQuiz.value = {
        question: data.question,
        options: data.options,
        answer: data.answer,
        explanation: data.explanation || ''
      }
      return
    }
    // 兜底：按不可用处理
    quizStatus.value = 'unavailable'
    currentQuiz.value = { reason: '题目加载失败' }
  } catch (e) {
    quizStatus.value = 'unavailable'
    currentQuiz.value = { reason: e?.message || '题目加载失败' }
  }
}

async function answerQuiz(petKey, selectedOption) {
  try {
    quizStatus.value = 'loading'
    const data = await fetchJSON('/api/pets/quiz/answer', {
      method: 'POST',
      body: JSON.stringify({ petKey, selectedOption })
    })
    quizResult.value = {
      correct: !!data?.correct,
      happiness: data?.happiness,
      answer: data?.answer,
      explanation: data?.explanation
    }
    quizStatus.value = 'result'
    quizAvailability.value[petKey] = 'cooldown'
    // 答完题后随机生成一句鼓励文案，冷却期间保持不变
    petQuote.value[petKey] = pickQuote()
    const pet = pets.value.find((p) => p.key === petKey)
    if (pet && typeof data?.happiness === 'number') {
      pet.happiness = clamp100(data.happiness)
    }
  } catch (e) {
    alert(e?.message || '提交答案失败')
    quizStatus.value = 'pending'
  }
}

// 拖拽 + 单击打开面板
const dragState = {
  active: false,
  pet: null,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  moved: false,
  tapStartMs: 0
}

function onPetPointerDown(pet, e) {
  if (!e.isPrimary) return
  e.preventDefault()
  e.stopPropagation()

  dragState.pet = pet
  dragState.startX = e.clientX
  dragState.startY = e.clientY
  dragState.offsetX = e.clientX - pet.x
  dragState.offsetY = e.clientY - pet.y
  dragState.moved = false
  dragState.tapStartMs = Date.now()
  dragState.active = false

  pet.dragging = false

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch (_) {}
}

function onPointerMove(e) {
  if (!dragState.pet) return
  const dx = Math.abs(e.clientX - dragState.startX)
  const dy = Math.abs(e.clientY - dragState.startY)
  if (!dragState.active && (dx > 4 || dy > 4)) {
    dragState.active = true
    dragState.moved = true
    dragState.pet.dragging = true
  }
  if (!dragState.active) return

  const w = window.innerWidth || 1200
  const h = window.innerHeight || 800
  const size = 200
  const nextX = e.clientX - dragState.offsetX
  const nextY = e.clientY - dragState.offsetY
  dragState.pet.x = Math.max(8, Math.min(w - size - 8, nextX))
  dragState.pet.y = Math.max(8, Math.min(h - size - 8, nextY))
}

function onPointerUp(e) {
  const pet = dragState.pet
  dragState.pet = null
  dragState.active = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  if (pet) {
    pet.dragging = false
    const elapsed = Date.now() - dragState.tapStartMs
    if (!dragState.moved && elapsed < 500) {
      activePetKey.value = pet.key
    }
  }
}
</script>

<style scoped>
.desktop-pets{
  position: fixed;
  inset: 0;
  z-index: 70;
  pointer-events: none;
}

.pet-actor{
  position: absolute;
  width: 200px;
  height: 200px;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: transform 120ms ease, filter 180ms ease;
  will-change: transform;
  filter: drop-shadow(0 14px 24px rgba(12, 6, 12, 0.22));
}

.pet-actor:hover{
  filter: drop-shadow(0 14px 24px rgba(12, 6, 12, 0.22));
}

.pet-actor:active:not(.is-dragging){
  transform: scale(0.94);
  filter: drop-shadow(0 10px 20px rgba(12, 6, 12, 0.24));
}

.pet-actor.is-dragging{
  cursor: grabbing;
  z-index: 80;
}

.pet-actor.is-runaway{
  opacity: 0.55;
  filter: grayscale(0.4);
}

.pet-actor.is-runaway:hover{
  filter: grayscale(0.4);
}

.pet-gif{
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.pet-fallback{
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 245, 220, 0.92);
  color: rgba(80, 50, 10, 0.9);
  font-weight: 950;
  font-size: 14px;
  box-shadow: 0 14px 24px rgba(12, 6, 12, 0.22);
}

.pet-quiz-bubble{
  position: absolute;
  top: -10px;
  right: -8px;
  min-width: 110px;
  max-width: 160px;
  padding: 8px 12px;
  border-radius: 16px;
  border: 2px solid rgba(255, 220, 80, 0.85);
  background: linear-gradient(135deg, #fff9c4 0%, #fff59d 100%);
  color: rgba(80, 50, 10, 0.98);
  font-weight: 900;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow:
    0 6px 18px rgba(255, 180, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  animation: bubblePop 6s ease-in-out infinite;
  z-index: 10;
  user-select: none;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.pet-quiz-bubble:hover{
  transform: scale(1.06) rotate(-2deg);
  box-shadow:
    0 10px 26px rgba(255, 180, 0, 0.45),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
}

.pet-quiz-bubble:active{
  transform: scale(0.98);
}

.pet-quiz-bubble-tail{
  position: absolute;
  bottom: -8px;
  left: 18px;
  width: 16px;
  height: 16px;
  background: #fff59d;
  border-right: 2px solid rgba(255, 220, 80, 0.85);
  border-bottom: 2px solid rgba(255, 220, 80, 0.85);
  transform: rotate(45deg);
  z-index: -1;
}

.pet-quiz-bubble.bubble-cooldown{
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(245, 245, 245, 0.95) 100%);
  border-color: rgba(180, 180, 180, 0.45);
  color: rgba(60, 50, 50, 0.92);
  animation: none;
  cursor: default;
}

.pet-quiz-bubble.bubble-cooldown:hover{
  transform: scale(1.03);
  box-shadow:
    0 6px 18px rgba(12, 6, 12, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
}

.pet-quiz-bubble.bubble-cooldown .pet-quiz-bubble-tail{
  background: rgba(245, 245, 245, 0.95);
  border-right-color: rgba(180, 180, 180, 0.45);
  border-bottom-color: rgba(180, 180, 180, 0.45);
}

.pet-quiz-bulb{
  position: absolute;
  top: -8px;
  right: -6px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #fff, #ffeb3b 60%, #fbc02d 100%);
  box-shadow: 0 0 10px 2px rgba(255, 220, 0, 0.8);
  animation: bulbGlow 1.6s ease-in-out infinite alternate;
}

@keyframes bubblePop{
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes bulbGlow{
  from { box-shadow: 0 0 6px 1px rgba(255, 220, 0, 0.6); }
  to { box-shadow: 0 0 14px 4px rgba(255, 220, 0, 0.95); }
}

@media (max-width: 1024px){
  .pet-actor{ width: 220px; height: 220px; }
}

@media (pointer: coarse){
  .pet-actor{ width: 220px; height: 220px; }
}
</style>
