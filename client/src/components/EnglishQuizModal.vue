<template>
  <div class="quiz-overlay english-quiz-overlay" @click.self="$emit('close')">
    <div class="quiz-panel english-quiz-panel">
      <div class="quiz-head">
        <div class="quiz-title">
          <span class="english-quiz-icon">🇬🇧</span>
          <span>英语单词 PK</span>
        </div>
        <button class="quiz-close" type="button" @click="$emit('close')">✕</button>
      </div>

      <!-- 每日统计面板 -->
      <div class="english-quiz-stats">
        <div class="english-quiz-stats-title">今日 PK 榜</div>
        <div class="english-quiz-stats-row">
          <div
            v-for="entry in sortedStats"
            :key="entry.username"
            class="english-quiz-stat-card"
            :class="{
              'stat-leader': entry.isLeader,
              'stat-me': entry.isMe
            }"
          >
            <div class="english-quiz-stat-avatar">
              <img
                :src="getAvatarSrc(entry.username)"
                :alt="displayName(entry.username)"
                draggable="false"
                @dragstart.prevent
              />
            </div>
            <div class="english-quiz-stat-info">
              <div class="english-quiz-stat-name">{{ displayName(entry.username) }}</div>
              <div class="english-quiz-stat-score">
                <span class="stat-correct">{{ entry.correct }}</span>
                <span class="stat-separator">/</span>
                <span class="stat-attempts">{{ entry.attempts }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="english-quiz-reward-hint">
          每天 22:00 答对次数更多的人，对应桌宠愉悦度 +20
        </div>
      </div>

      <div v-if="status === 'loading'" class="quiz-body">
        <div class="quiz-loading">题目准备中…</div>
      </div>

      <div v-else-if="status === 'unavailable'" class="quiz-body">
        <div class="quiz-unavailable">
          <div class="quiz-unavailable-emoji">🛌</div>
          <div class="quiz-unavailable-text">出题老师正在休息，稍后再来吧</div>
          <div v-if="quiz.reason" class="quiz-unavailable-detail">{{ quiz.reason }}</div>
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
        <button class="quiz-submit" type="button" @click="nextQuestion">下一题</button>
      </div>

      <div v-else class="quiz-body">
        <div class="quiz-mode-badge">{{ modeLabel }}</div>
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
import { computed, ref } from 'vue'

const props = defineProps({
  me: { type: Object, default: null },
  users: { type: Array, default: () => [] },
  quiz: { type: Object, default: () => ({}) },
  status: { type: String, default: 'loading' },
  result: { type: Object, default: null },
  stats: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'answer', 'next'])

const selectedOption = ref('')

const AVATAR_BASE = {
  小鸡毛: '/assets/user/avatar_userA.png',
  userA: '/assets/user/avatar_userA.png',
  小白: '/assets/user/avatar_userB.png',
  userB: '/assets/user/avatar_userB.png'
}

function getAvatarSrc(username) {
  return AVATAR_BASE[username] || '/assets/user/avatar_userA.png'
}

function displayName(username) {
  if (username === 'userA') return '小鸡毛'
  if (username === 'userB') return '小白'
  return username
}

const sortedStats = computed(() => {
  const entries = Object.values(props.stats || {}).map((s) => ({
    username: s.username,
    attempts: Number(s.attempts || 0),
    correct: Number(s.correct || 0),
    isMe: s.username === props.me?.username,
    isLeader: false
  }))
  entries.sort((a, b) => b.correct - a.correct || b.attempts - a.attempts)
  if (entries.length > 0 && entries[0].correct > 0) {
    // 只有一个人领先时才标记 leader；平局不标
    if (entries.length === 1 || entries[0].correct > entries[1].correct) {
      entries[0].isLeader = true
    }
  }
  return entries
})

const modeLabel = computed(() => {
  return props.quiz?.mode === 'cn_to_en' ? '看中文选英文' : '看英文选中文'
})

const resultClass = computed(() => (props.result?.correct ? 'result-correct' : 'result-wrong'))
const resultEmoji = computed(() => (props.result?.correct ? '🎉' : '😢'))
const resultTitle = computed(() => (props.result?.correct ? '回答正确' : '回答错误'))
const resultHappinessText = computed(() => {
  return props.result?.correct ? '英语 PK +1 分' : '再试一次吧'
})

function selectOption(key) {
  selectedOption.value = key
}

function submitAnswer() {
  if (!selectedOption.value) return
  emit('answer', { selectedOption: selectedOption.value })
}

function nextQuestion() {
  selectedOption.value = ''
  emit('next')
}
</script>

<style scoped>
.english-quiz-overlay{
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

.english-quiz-panel{
  width: 480px;
  max-width: 100%;
  max-height: calc(100vh - 32px);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 32px 80px rgba(12, 6, 12, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  pointer-events: auto;
  background: rgba(255, 250, 240, 0.98);
  border: 1px solid rgba(200, 150, 60, 0.18);
  color: rgba(60, 40, 10, 0.95);
}

.quiz-head{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.quiz-title{
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 950;
  font-size: 18px;
}

.english-quiz-icon{
  font-size: 22px;
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

.english-quiz-stats{
  margin-bottom: 14px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(60, 40, 10, 0.08);
}

.english-quiz-stats-title{
  font-weight: 950;
  font-size: 14px;
  margin-bottom: 10px;
  color: rgba(60, 40, 10, 0.9);
}

.english-quiz-stats-row{
  display: flex;
  gap: 10px;
}

.english-quiz-stat-card{
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  border: 2px solid transparent;
  transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.english-quiz-stat-card.stat-me{
  border-color: rgba(76, 140, 255, 0.45);
  box-shadow: 0 0 0 3px rgba(76, 140, 255, 0.08);
}

.english-quiz-stat-card.stat-leader{
  border-color: rgba(255, 180, 0, 0.65);
  box-shadow: 0 0 0 3px rgba(255, 180, 0, 0.12);
}

.english-quiz-stat-avatar{
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 4px 10px rgba(12, 6, 12, 0.12);
  background: rgba(255, 255, 255, 0.9);
}

.english-quiz-stat-avatar img{
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.english-quiz-stat-info{
  flex: 1;
  min-width: 0;
}

.english-quiz-stat-name{
  font-weight: 900;
  font-size: 13px;
  color: rgba(60, 40, 10, 0.85);
}

.english-quiz-stat-score{
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 950;
  font-size: 16px;
  color: rgba(60, 40, 10, 0.95);
}

.stat-correct{
  color: rgba(30, 140, 70, 0.95);
}

.stat-separator{
  opacity: 0.5;
  font-weight: 700;
}

.stat-attempts{
  opacity: 0.75;
  font-weight: 800;
}

.english-quiz-reward-hint{
  margin-top: 10px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(200, 120, 20, 0.85);
  text-align: center;
}

.quiz-body{
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quiz-mode-badge{
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 200, 80, 0.25);
  font-weight: 900;
  font-size: 12px;
  color: rgba(160, 100, 10, 0.95);
}

.quiz-question{
  font-weight: 950;
  font-size: 20px;
  line-height: 1.6;
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(60, 40, 10, 0.12);
  color: rgba(40, 20, 10, 0.98);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  text-align: center;
  box-shadow: 0 4px 12px rgba(12, 6, 12, 0.06);
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
  border: 1px solid rgba(60, 40, 10, 0.18);
  background: rgba(255, 255, 255, 0.96);
  cursor: pointer;
  text-align: left;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
  pointer-events: auto;
  color: rgba(30, 15, 5, 0.98);
  box-shadow: 0 2px 6px rgba(12, 6, 12, 0.04);
}

.quiz-option:hover{
  transform: translateY(-2px);
  background: #fff;
  border-color: rgba(76, 140, 255, 0.65);
  box-shadow: 0 10px 20px rgba(12, 6, 12, 0.10);
}

.quiz-option.selected{
  background: rgba(76, 140, 255, 0.18);
  border-color: rgba(76, 140, 255, 0.65);
  box-shadow: 0 0 0 4px rgba(76, 140, 255, 0.14);
}

.quiz-option-key{
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(76, 140, 255, 0.22);
  color: rgba(25, 50, 150, 0.98);
  font-weight: 950;
  font-size: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid rgba(76, 140, 255, 0.3);
}

.quiz-option.selected .quiz-option-key{
  background: rgba(76, 140, 255, 0.95);
  color: #fff;
}

.quiz-option-text{
  font-weight: 950;
  font-size: 16px;
  line-height: 1.5;
  color: rgba(25, 15, 5, 0.98);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}

.quiz-submit{
  margin-top: 4px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(60, 40, 10, 0.10);
  background: rgba(76, 140, 255, 0.18);
  font-weight: 950;
  font-size: 15px;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 120ms ease, background 120ms ease;
  color: rgba(40, 20, 10, 0.92);
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
  border: 1px solid rgba(60, 40, 10, 0.08);
  flex: 1;
}

.quiz-loading{
  font-weight: 900;
  font-size: 15px;
  opacity: 0.85;
}

.quiz-unavailable-emoji,
.quiz-result-emoji{
  font-size: 42px;
}

.quiz-unavailable-text,
.quiz-cooldown-text{
  font-weight: 950;
  font-size: 16px;
}

.quiz-unavailable-detail{
  font-weight: 800;
  font-size: 12px;
  opacity: 0.7;
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
  .english-quiz-panel{
    width: 100%;
    max-width: 520px;
  }

  .english-quiz-stats-row{
    flex-direction: column;
  }
}
</style>
