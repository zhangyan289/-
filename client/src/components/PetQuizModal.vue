<template>
  <div v-if="visible" class="quiz-overlay" @click.self="$emit('close')">
    <div class="quiz-panel" :class="themeClass">
      <div class="quiz-head">
        <div class="quiz-title">
          <img class="quiz-avatar" :src="avatarSrc" :alt="pet.name" />
          <span>{{ pet.name }} · 今日一题</span>
        </div>
        <button class="quiz-close" type="button" @click="$emit('close')">✕</button>
      </div>

      <div v-if="status === 'loading'" class="quiz-body">
        <div class="quiz-loading">题目准备中…</div>
      </div>

      <div v-else-if="status === 'unavailable'" class="quiz-body">
        <div class="quiz-unavailable">
          <div class="quiz-unavailable-emoji">🛌</div>
          <div class="quiz-unavailable-text">大模型老师正在休息，稍后再来吧</div>
        </div>
      </div>

      <div v-else-if="status === 'cooldown'" class="quiz-body">
        <div class="quiz-cooldown">
          <div class="quiz-cooldown-emoji">⏳</div>
          <div class="quiz-cooldown-text">{{ pet.name }} 刚考完，休息一下</div>
          <div class="quiz-cooldown-time">下次可答：{{ nextAtText }}</div>
        </div>
      </div>

      <div v-else-if="status === 'result'" class="quiz-body">
        <div class="quiz-result" :class="resultClass">
          <div class="quiz-result-emoji">{{ resultEmoji }}</div>
          <div class="quiz-result-title">{{ resultTitle }}</div>
          <div class="quiz-result-detail">
            正确答案：<strong>{{ quiz.answer }}</strong>
          </div>
          <div class="quiz-explanation">{{ quiz.explanation }}</div>
          <div class="quiz-happiness-change">{{ resultHappinessText }}</div>
        </div>
      </div>

      <div v-else class="quiz-body">
        <div class="quiz-question">{{ quiz.question }}</div>
        <div class="quiz-options">
          <button
            v-for="(text, key) in quiz.options"
            :key="key"
            class="quiz-option"
            :class="{ selected: selectedOption === key }"
            type="button"
            @click="selectOption(key)"
          >
            <span class="quiz-option-key">{{ key }}</span>
            <span class="quiz-option-text">{{ text }}</span>
          </button>
        </div>
        <button
          class="quiz-submit"
          type="button"
          :disabled="!selectedOption"
          @click="submitAnswer"
        >
          提交答案
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  pet: { type: Object, required: true },
  visible: { type: Boolean, default: false },
  quiz: { type: Object, default: () => ({}) },
  status: { type: String, default: 'loading' },
  result: { type: Object, default: null }
})

const emit = defineEmits(['close', 'answer'])

const selectedOption = ref('')

watch(() => props.visible, (open) => {
  if (!open) selectedOption.value = ''
})

const themeClass = computed(() => (props.pet.key === 'golden' ? 'quiz-theme-golden' : 'quiz-theme-white'))

const avatarSrc = computed(() => {
  return props.pet.key === 'golden'
    ? '/assets/user/avatar_userA.png'
    : '/assets/user/avatar_userB.png'
})

const nextAtText = computed(() => {
  const nextAt = props.quiz?.nextAt
  if (!nextAt) return '—'
  try {
    const d = new Date(nextAt)
    if (!Number.isFinite(d.getTime())) return '—'
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return '—'
  }
})

const resultClass = computed(() => (props.result?.correct ? 'result-correct' : 'result-wrong'))
const resultEmoji = computed(() => (props.result?.correct ? '🎉' : '😢'))
const resultTitle = computed(() => (props.result?.correct ? '回答正确' : '回答错误'))
const resultHappinessText = computed(() => {
  const change = props.result?.correct ? '+10' : '-10'
  return `愉悦度 ${change}`
})

function selectOption(key) {
  selectedOption.value = key
}

function submitAnswer() {
  if (!selectedOption.value) return
  emit('answer', { petKey: props.pet.key, selectedOption: selectedOption.value })
}
</script>

<style scoped>
.quiz-overlay{
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(12, 6, 12, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: auto;
}

.quiz-panel{
  width: 460px;
  max-width: 100%;
  max-height: calc(100vh - 32px);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 32px 80px rgba(12, 6, 12, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
}

.quiz-theme-golden{
  background: rgba(255, 250, 235, 0.98);
  border: 1px solid rgba(180, 130, 40, 0.18);
  color: rgba(80, 50, 10, 0.95);
}

.quiz-theme-white{
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(80, 100, 130, 0.18);
  color: rgba(20, 30, 50, 0.95);
}

.quiz-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.quiz-title{
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 950;
  font-size: 18px;
}

.quiz-avatar{
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 6px 14px rgba(12, 6, 12, 0.14);
}

.quiz-close{
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
  transition: transform 120ms ease, background 120ms ease, color 120ms ease;
}

.quiz-close:hover{
  transform: scale(1.1);
  background: rgba(255, 90, 90, 0.12);
  color: rgba(200, 30, 30, 1);
}

.quiz-body{
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.quiz-question{
  font-weight: 950;
  font-size: 16px;
  line-height: 1.7;
  padding: 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(20, 10, 18, 0.12);
  color: rgba(20, 10, 18, 0.98);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 12px rgba(12, 6, 12, 0.08);
}

.quiz-options{
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quiz-option{
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(20, 10, 18, 0.14);
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  text-align: left;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
  pointer-events: auto;
  color: rgba(20, 10, 18, 0.98);
  box-shadow: 0 2px 6px rgba(12, 6, 12, 0.04);
}

.quiz-option:hover{
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(76, 140, 255, 0.55);
  box-shadow: 0 10px 20px rgba(12, 6, 12, 0.10);
}

.quiz-option.selected{
  background: rgba(76, 140, 255, 0.14);
  border-color: rgba(76, 140, 255, 0.55);
  box-shadow: 0 0 0 4px rgba(76, 140, 255, 0.12);
}

.quiz-option-key{
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(76, 140, 255, 0.18);
  color: rgba(30, 60, 160, 0.98);
  font-weight: 950;
  font-size: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid rgba(76, 140, 255, 0.25);
}

.quiz-option.selected .quiz-option-key{
  background: rgba(76, 140, 255, 0.9);
  color: #fff;
}

.quiz-option-text{
  font-weight: 900;
  font-size: 15px;
  line-height: 1.5;
  color: rgba(20, 10, 18, 0.98);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}

.quiz-submit{
  margin-top: 4px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(20, 10, 18, 0.10);
  background: rgba(76, 140, 255, 0.18);
  font-weight: 950;
  font-size: 15px;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 120ms ease, background 120ms ease;
  color: rgba(20, 10, 18, 0.92);
}

.quiz-submit:not(:disabled):hover{
  transform: translateY(-2px);
  background: rgba(76, 140, 255, 0.28);
}

.quiz-submit:disabled{
  opacity: 0.55;
  cursor: not-allowed;
}

.quiz-loading,
.quiz-unavailable,
.quiz-cooldown,
.quiz-result{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 30px 16px;
  text-align: center;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(20, 10, 18, 0.08);
  flex: 1;
}

.quiz-loading{
  font-weight: 900;
  font-size: 15px;
  opacity: 0.85;
}

.quiz-unavailable-emoji,
.quiz-cooldown-emoji,
.quiz-result-emoji{
  font-size: 42px;
}

.quiz-unavailable-text,
.quiz-cooldown-text{
  font-weight: 950;
  font-size: 16px;
}

.quiz-cooldown-time{
  font-weight: 800;
  font-size: 13px;
  opacity: 0.75;
}

.quiz-result-title{
  font-weight: 950;
  font-size: 18px;
}

.quiz-result-detail{
  font-weight: 800;
  font-size: 14px;
}

.quiz-explanation{
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.85;
  max-width: 100%;
}

.quiz-happiness-change{
  font-weight: 950;
  font-size: 15px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
}

.result-correct .quiz-happiness-change{
  color: rgba(30, 140, 70, 0.95);
}

.result-wrong .quiz-happiness-change{
  color: rgba(200, 50, 50, 0.95);
}

@media (max-width: 1024px){
  .quiz-panel{
    width: 100%;
    max-width: 520px;
  }
}
</style>
