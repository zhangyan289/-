<template>
  <div v-if="visible" class="pet-status-panel" :class="themeClass" @click.stop>
    <div class="pet-status-head">
      <div class="pet-status-title">
        <img
          class="pet-status-avatar"
          :src="avatarSrc"
          :alt="pet.name"
          draggable="false"
          @dragstart.prevent
        />
        <div>
          <div class="pet-status-name">{{ pet.name }}</div>
          <div class="pet-status-desc">{{ statusDesc }}</div>
          <div v-if="runawayCountdown" class="pet-status-countdown">{{ runawayCountdown }}</div>
        </div>
      </div>
      <button class="pet-status-close" type="button" @click="$emit('close')">✕</button>
    </div>

    <div class="pet-status-bars">
      <div class="pet-bar-row">
        <span class="pet-bar-label">愉悦度</span>
        <div class="pet-bar-track">
          <div class="pet-bar-ticks">
            <span v-for="n in 5" :key="n" class="pet-bar-tick" :style="{ left: `${n * 20}%` }" />
          </div>
          <div class="pet-bar-fill pet-bar-happiness" :style="{ width: `${pet.happiness}%` }" />
        </div>
        <span class="pet-bar-value">{{ pet.happiness }}</span>
      </div>
      <div class="pet-bar-levels">
        <span class="pet-level-text">等级 {{ happinessLevel }} / 5</span>
        <span class="pet-level-range">{{ levelRangeText }}</span>
      </div>
    </div>

    <div class="pet-status-points">
      <span>我的积分</span>
      <div class="pet-points-wrap">
        <strong>{{ userPoints }}</strong>
        <Transition name="points-pop">
          <span v-if="pointsChange.show" class="pet-points-change" :class="pointsChange.class">{{ pointsChange.text }}</span>
        </Transition>
      </div>
    </div>

    <div class="pet-status-feed">
      <div class="pet-feed-dropdown">
        <button
          class="pet-feed-trigger"
          :class="{ disabled: !canFeed }"
          :disabled="!canFeed"
          @click="toggleFeedMenu"
        >
          <span>{{ canFeed ? '投喂 ▼' : '愉悦度已满' }}</span>
        </button>
        <div v-if="showFeedMenu && canFeed" class="pet-feed-menu">
          <button
            v-for="food in foodList"
            :key="food.key"
            class="pet-feed-option"
            :class="{ disabled: userPoints < food.cost }"
            :disabled="userPoints < food.cost"
            @click="onFeedClick(food)"
          >
            <span class="pet-feed-option-name">{{ food.name }}</span>
            <span class="pet-feed-option-cost">{{ food.cost }} 积分</span>
          </button>
        </div>
      </div>
    </div>

    <button class="pet-todo-btn" type="button" @click="$emit('todo')">
      去完成 Todo 赚积分
    </button>

    <div class="pet-feed-log">
      <div class="pet-feed-log-title">今日投喂记录</div>
      <div v-if="feedLog.length === 0" class="pet-feed-log-empty">今天还没有投喂</div>
      <div v-else class="pet-feed-log-list">
        <div v-for="(entry, idx) in feedLog" :key="idx" class="pet-feed-log-item">
          <span class="pet-feed-log-user">{{ entry.username }}</span>
          <span class="pet-feed-log-food">喂了 {{ entry.foodName }}</span>
          <span class="pet-feed-log-time">{{ formatFeedTime(entry.fedAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  pet: { type: Object, required: true },
  userPoints: { type: Number, default: 0 },
  foodConfig: { type: Object, default: () => ({}) },
  feedLog: { type: Array, default: () => [] },
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['feed', 'close', 'todo'])

const showFeedMenu = ref(false)
const pointsChange = ref({ show: false, text: '', class: '' })
let pointsChangeTimer = null

const RUNAWAY_THRESHOLD_MS = 3 * 60 * 60 * 1000
const countdownNow = ref(Date.now())
let countdownTimer = null

onMounted(() => {
  countdownTimer = setInterval(() => {
    countdownNow.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})

watch(() => props.visible, (open) => {
  if (!open) showFeedMenu.value = false
})

const themeClass = computed(() => (props.pet.key === 'golden' ? 'pet-theme-golden' : 'pet-theme-white'))

const avatarSrc = computed(() => {
  return props.pet.key === 'golden'
    ? '/assets/user/avatar_userA.png'
    : '/assets/user/avatar_userB.png'
})

const foodList = computed(() => {
  return Object.entries(props.foodConfig || {}).map(([key, value]) => ({ key, ...value }))
})

const happinessLevel = computed(() => Math.min(5, Math.max(1, Math.floor(Number(props.pet.happiness || 0) / 20) + 1)))

const levelRangeText = computed(() => {
  const lv = happinessLevel.value
  const min = (lv - 1) * 20
  const max = lv * 20
  return `${min}-${max}`
})

const isInCooldown = computed(() => false)

const cooldownMins = computed(() => 0)

const canFeed = computed(() => Number(props.pet.happiness || 0) < 100)

function toggleFeedMenu() {
  showFeedMenu.value = !showFeedMenu.value
}

function onFeedClick(food) {
  if (props.userPoints < food.cost) return
  showFeedMenu.value = false
  showPointsChange(-food.cost, 'minus')
  emit('feed', food.key)
}

function showPointsChange(value, type) {
  if (pointsChangeTimer) clearTimeout(pointsChangeTimer)
  const sign = value > 0 ? '+' : ''
  pointsChange.value = { show: true, text: `${sign}${value} 积分`, class: type === 'minus' ? 'points-minus' : 'points-plus' }
  pointsChangeTimer = setTimeout(() => {
    pointsChange.value = { show: false, text: '', class: '' }
  }, 1500)
}

const statusDesc = computed(() => {
  const { happiness, runaway, eating_state: eatingState } = props.pet
  if (runaway) return '离家出走中…点击把它唤回'
  if (eatingState) return `正在${foodNameOf(eatingState)}，请勿打扰`
  if (happiness >= 80) return '超级开心！'
  if (happiness >= 60) return '心情不错 ~'
  if (happiness >= 40) return '普普通通'
  if (happiness >= 20) return '有点闷闷不乐'
  return '心情很低落，快投喂！'
})

const runawayCountdown = computed(() => {
  const { happiness, runaway, runaway_since: runawaySince } = props.pet
  if (runaway) return '已离家出走'
  if (happiness > 0 || !runawaySince) return ''
  const deadline = new Date(runawaySince).getTime() + RUNAWAY_THRESHOLD_MS
  const remaining = deadline - countdownNow.value
  if (remaining <= 0) return '即将离家出走'
  const s = Math.floor(remaining / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} 后离家出走`
})

function foodNameOf(eatingState) {
  if (!eatingState) return '吃饭'
  const key = String(eatingState).replace(/^eating_/, '')
  return props.foodConfig?.[key]?.name || '吃饭'
}

function formatFeedTime(fedAt) {
  if (!fedAt) return ''
  try {
    const d = new Date(fedAt)
    if (!Number.isFinite(d.getTime())) return String(fedAt)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return String(fedAt)
  }
}
</script>

<style scoped>
.pet-status-panel{
  position: fixed;
  bottom: 200px;
  left: 24px;
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 18px;
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(12, 6, 12, 0.22);
  z-index: 150;
  pointer-events: auto;
  user-select: none;
}

.pet-theme-golden{
  background: rgba(255, 250, 235, 0.96);
  border: 1px solid rgba(180, 130, 40, 0.18);
  color: rgba(80, 50, 10, 0.95);
}

.pet-theme-white{
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(80, 100, 130, 0.18);
  color: rgba(20, 30, 50, 0.95);
}

.pet-status-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.pet-status-title{
  display: flex;
  align-items: center;
  gap: 12px;
}

.pet-status-avatar{
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow:
    0 8px 18px rgba(12, 6, 12, 0.16),
    0 0 0 5px rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.9);
}

.pet-status-name{
  font-weight: 950;
  font-size: 19px;
  color: rgba(20, 10, 18, 0.95);
}

.pet-status-desc{
  font-size: 13px;
  font-weight: 800;
  opacity: 0.85;
  margin-top: 2px;
  color: rgba(20, 10, 18, 0.78);
}

.pet-status-countdown{
  font-size: 12px;
  font-weight: 900;
  margin-top: 4px;
  color: rgba(220, 50, 50, 0.92);
}

.pet-status-close{
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(220, 50, 50, 0.25);
  background: rgba(255, 255, 255, 0.72);
  color: rgba(220, 50, 50, 0.92);
  font-weight: 900;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease, color 120ms ease;
}

.pet-status-close:hover{
  transform: scale(1.1);
  background: rgba(255, 90, 90, 0.12);
  color: rgba(200, 30, 30, 1);
  box-shadow: 0 8px 18px rgba(12, 6, 12, 0.14);
}

.pet-status-close:active{
  transform: scale(0.96);
  background: rgba(255, 90, 90, 0.22);
}

.pet-status-bars{
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(20, 10, 18, 0.08);
}

.pet-bar-row{
  display: flex;
  align-items: center;
  gap: 8px;
}

.pet-bar-label{
  width: 48px;
  font-weight: 900;
  font-size: 12px;
  opacity: 0.9;
  color: rgba(20, 10, 18, 0.85);
}

.pet-bar-track{
  flex: 1;
  height: 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
  position: relative;
}

.pet-bar-ticks{
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.pet-bar-tick{
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.65);
  transform: translateX(-1px);
}

.pet-bar-fill{
  height: 100%;
  border-radius: 999px;
  transition: width 300ms ease;
  position: relative;
  z-index: 2;
}

.pet-bar-happiness{ background: linear-gradient(90deg, #74b9ff, #4facfe); }

.pet-bar-value{
  width: 32px;
  text-align: right;
  font-weight: 950;
  font-size: 13px;
  color: rgba(20, 10, 18, 0.9);
}

.pet-bar-levels{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 56px;
  font-size: 11px;
  font-weight: 900;
  opacity: 0.9;
  color: rgba(20, 10, 18, 0.75);
}

.pet-status-points{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  font-weight: 900;
  margin-bottom: 14px;
  border: 1px solid rgba(20, 10, 18, 0.08);
  color: rgba(20, 10, 18, 0.9);
}

.pet-points-wrap{
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pet-status-points strong{
  font-size: 18px;
  font-weight: 950;
  color: rgba(20, 10, 18, 0.95);
}

.pet-points-change{
  position: absolute;
  right: 0;
  top: 50%;
  transform: translate(100%, -50%);
  font-size: 12px;
  font-weight: 950;
  white-space: nowrap;
  padding: 2px 6px;
  border-radius: 6px;
}

.points-minus{
  color: rgba(220, 50, 50, 0.92);
  background: rgba(255, 90, 90, 0.14);
}

.points-plus{
  color: rgba(30, 140, 70, 0.92);
  background: rgba(60, 200, 120, 0.14);
}

.points-pop-enter-active,
.points-pop-leave-active{
  transition: opacity 200ms ease, transform 200ms ease;
}

.points-pop-enter-from,
.points-pop-leave-to{
  opacity: 0;
  transform: translate(100%, -40%);
}

.pet-status-feed{
  margin-bottom: 14px;
}

.pet-feed-dropdown{
  position: relative;
}

.pet-feed-trigger{
  width: 100%;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(20, 10, 18, 0.10);
  background: rgba(255, 255, 255, 0.78);
  font-weight: 950;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(20, 10, 18, 0.92);
}

.pet-feed-trigger:not(.disabled):hover{
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(12, 6, 12, 0.10);
  background: rgba(255, 255, 255, 0.95);
}

.pet-feed-trigger.disabled{
  opacity: 0.65;
  cursor: not-allowed;
}

.pet-feed-menu{
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 160;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(20, 10, 18, 0.10);
  border-radius: 14px;
  box-shadow: 0 14px 34px rgba(12, 6, 12, 0.16);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
}

.pet-feed-option{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  transition: background 120ms ease, transform 120ms ease;
  color: rgba(20, 10, 18, 0.92);
}

.pet-feed-option:not(.disabled):hover{
  background: rgba(76, 140, 255, 0.10);
  transform: translateX(2px);
}

.pet-feed-option.disabled{
  opacity: 0.45;
  cursor: not-allowed;
}

.pet-feed-option-name{
  font-weight: 950;
  font-size: 13px;
}

.pet-feed-option-cost{
  font-weight: 800;
  font-size: 11px;
  opacity: 0.7;
}

.pet-todo-btn{
  width: 100%;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(20, 10, 18, 0.10);
  background: rgba(76, 140, 255, 0.14);
  font-weight: 950;
  cursor: pointer;
  pointer-events: auto;
  color: rgba(20, 10, 18, 0.92);
}

.pet-todo-btn:hover{
  background: rgba(76, 140, 255, 0.22);
}

.pet-feed-log{
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(20, 10, 18, 0.08);
  max-height: 180px;
  overflow: auto;
}

.pet-feed-log-title{
  font-weight: 950;
  font-size: 13px;
  margin-bottom: 8px;
  color: rgba(20, 10, 18, 0.9);
}

.pet-feed-log-empty{
  font-size: 12px;
  opacity: 0.6;
  text-align: center;
  padding: 8px 0;
}

.pet-feed-log-list{
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pet-feed-log-item{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 12px;
}

.pet-feed-log-user{
  font-weight: 900;
  flex-shrink: 0;
}

.pet-feed-log-food{
  flex: 1;
  opacity: 0.85;
}

.pet-feed-log-time{
  opacity: 0.7;
  font-weight: 800;
  flex-shrink: 0;
}

@media (max-width: 1024px){
  .pet-status-panel{
    width: 360px;
    bottom: 220px;
  }
}
</style>
