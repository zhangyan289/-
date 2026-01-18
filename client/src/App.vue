<template>
  <AnimatedBackground v-if="showBg" />
  <router-view />
</template>

<script setup>
import AnimatedBackground from './components/AnimatedBackground.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const showBg = computed(() => route.path !== '/login')
</script>
