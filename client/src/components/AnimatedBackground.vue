<template>
  <div class="bg-root" aria-hidden="true">
    <div class="bg-stage">
    <video
      v-if="kind === 'video'"
      class="bg-media"
      :src="src"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
      @error="fallbackToPlaceholder"
    />

    <img
      v-else
      class="bg-media"
      :src="src"
      alt=""
      decoding="async"
      loading="eager"
      @error="fallbackToPlaceholder"
    />

    <!-- Tier 1：尽量不做滤镜，叠层只做很轻的氛围（不糊） -->
    <div class="bg-overlay" />

    <!-- 动效叠层：优先使用用户提供的透明 overlay 视频，其次用轻量 CSS 模拟 -->
    <video
      v-if="showPetals && petalsOverlaySrc"
      class="bg-overlay-media bg-petals"
      :src="petalsOverlaySrc"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
    />
    <div v-else-if="showPetals" class="petals-layer" :class="{ 'petals-off': reduceMotion }">
      <span
        v-for="n in petalCount"
        :key="n"
        class="petal"
        :style="petalStyle(n)"
      />
    </div>

    <video
      v-if="showWaves && ripplesOverlaySrc"
      class="bg-overlay-media bg-ripples"
      :src="ripplesOverlaySrc"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
    />
    <div v-else-if="showWaves" class="ripples-layer" :class="{ 'ripples-off': reduceMotion }" />

    <!-- 场景特效：按 bg1~bg5 启用不同效果；支持用户自定义透明 overlay 视频（fx_sceneN.webm/mp4） -->
    <video
      v-if="sceneFxOverlaySrc && !reduceMotion"
      class="bg-overlay-media bg-scene-fx"
      :class="sceneFxClassList"
      :src="sceneFxOverlaySrc"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
    />
    <canvas
      v-else-if="sceneFxTypes.length && !reduceMotion"
      ref="fxCanvasEl"
      class="bg-fx-canvas"
      :class="sceneFxClassList"
    />

    <!-- 小狗轮廓热区（与背景同呼吸/同裁切） -->
    <svg
      v-if="hotspots.ready"
      ref="hotspotSvgEl"
      class="bg-hotspots"
      :class="{ 'is-hovering': !!hoveredDog }"
      :viewBox="`0 0 ${hotspots.viewBoxW} ${hotspots.viewBoxH}`"
      preserveAspectRatio="xMidYMid slice"
      @click="onHotspotsClick"
      @pointermove="onHotspotsMove"
      @pointerleave="onHotspotsLeave"
    >
      <defs>
        <filter id="hotOutline" x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="dil" />
          <feComposite in="dil" in2="SourceAlpha" operator="out" result="outline" />
          <feColorMatrix
            in="outline"
            type="matrix"
            values="0 0 0 0 1   0 0 0 0 0.95   0 0 0 0 0.55   0 0 0 1 0"
            result="outlineYellow"
          />
          <feGaussianBlur in="outlineYellow" stdDeviation="1.05" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="outlineYellow" />
          </feMerge>
        </filter>
      </defs>

      <rect :width="hotspots.viewBoxW" :height="hotspots.viewBoxH" fill="transparent" />

      <!-- Hover/click outline (default hidden) -->
      <image
        v-for="item in hotspots.items"
        :key="item.dog"
        :href="item.dataUrl"
        :x="item.x"
        :y="item.y"
        :width="item.w"
        :height="item.h"
        filter="url(#hotOutline)"
        class="hot-outline"
        :class="{
          'is-show': showHotspotDebug || hoveredDog === item.dog,
          'is-click': clickedDog === item.dog
        }"
        style="pointer-events:none"
      />

      <!-- Click ring animation -->
      <circle
        v-if="clickFx.show"
        :key="clickFx.key"
        :cx="clickFx.x"
        :cy="clickFx.y"
        r="18"
        class="click-ring"
      />
    </svg>

    <div v-if="showDebug" class="bg-debug">
      <div style="font-weight:900;">BG: {{ kind }}</div>
      <div style="opacity:0.9;">{{ src }}</div>
      <div style="opacity:0.9;">Hotspots: {{ hotspots.ready ? 'ready' : 'loading' }}</div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'

const kind = ref('img')
const src = ref('/assets/placeholders/bg_white.svg')
// 右下角调试信息默认关闭（避免影响正常使用）
// 如需临时开启：localStorage.setItem('bg_debug','1') 然后刷新
const showDebug = ref(false)

const sceneId = ref(1)
const SCENE_COUNT = 5
const SCENE_STORAGE_KEY = 'bg_scene_id'

const petalsOverlaySrc = ref('')
const ripplesOverlaySrc = ref('')
const reduceMotion = ref(false)

const fxCanvasEl = ref(null)
const sceneFxOverlaySrc = ref('')
const sceneFxTypes = ref([])
const sceneFxPalette = ref({ r: 255, g: 255, b: 255, l: 0.9 })

// 背景媒体的“原始尺寸”（用于和 object-fit: cover 对齐坐标系）
const sceneMediaNatural = ref({ w: 0, h: 0 })

// bg4：小船遮罩（用户提供的 boat.svg）
const boatMaskUrl = '/assets/user/boat.svg'
let boatMaskImg = null
let boatMaskReady = false
let boatMaskLoading = false
let boatMaskObjectUrl = ''
let boatMaskViewW = 0
let boatMaskViewH = 0

let fxRaf = 0
let fxLastTs = 0
let fxState = null

const fxEnabled = computed(() => !reduceMotion.value && sceneFxTypes.value.length > 0 && !sceneFxOverlaySrc.value)

const sceneFxClassList = computed(() => {
  const types = sceneFxTypes.value
  if (!types.length) return []
  const classes = types.map((t) => `fx-${t}`)
  if (types.length > 1) classes.push('fx-combo')
  return classes
})

const showPetals = computed(() => !reduceMotion.value && clampSceneId(sceneId.value) === 1)
const showWaves = computed(() => false)

const hotspotSvgEl = ref(null)

const hotspots = ref({
  ready: false,
  viewBoxW: 3840,
  viewBoxH: 2160,
  items: []
})

const showHotspotDebug = false

const hoveredDog = ref('')
const clickedDog = ref('')
const clickFx = ref({ show: false, x: 0, y: 0, key: 0 })

const petalCount = 28

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

function clamp255(x) {
  return Math.max(0, Math.min(255, Math.round(x)))
}

function rgba({ r, g, b }, a) {
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${clamp01(a)})`
}

function mixColor(c, target, t) {
  return {
    r: c.r + (target.r - c.r) * t,
    g: c.g + (target.g - c.g) * t,
    b: c.b + (target.b - c.b) * t
  }
}

async function computePaletteFromUrl(url) {
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()

    const w = 64
    const h = 64
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no canvas ctx')
    ctx.drawImage(img, 0, 0, w, h)

    const data = ctx.getImageData(0, 0, w, h).data
    let r = 0
    let g = 0
    let b = 0
    let count = 0

    // 简单均值：忽略透明像素
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]
      if (a < 16) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }

    if (!count) return { r: 255, g: 255, b: 255, l: 0.9 }
    r /= count
    g /= count
    b /= count
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return { r, g, b, l }
  } catch {
    return { r: 255, g: 255, b: 255, l: 0.9 }
  }
}

function pickSceneFxTypes(id) {
  // 5 个场景各不同；bg2 需要“流星 + 萤火虫”组合
  switch (clampSceneId(id)) {
    case 1: return ['motes']
    case 2: return ['meteors', 'fireflies']
    case 3: return ['butterflies']
    case 4: return ['glints']
    case 5: return ['dandelion']
    default: return ['motes']
  }
}

function fxRand(seed) {
  return seeded01(seed)
}

function stopSceneFx() {
  if (fxRaf) cancelAnimationFrame(fxRaf)
  fxRaf = 0
  fxLastTs = 0
  fxState = null
  const canvas = fxCanvasEl.value
  const ctx = canvas?.getContext?.('2d')
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function ensureFxCanvasSize() {
  const canvas = fxCanvasEl.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const w = Math.max(1, Math.floor(rect.width * dpr))
  const h = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return null
  return { ctx, w, h, dpr }
}

function initFxState(type, w, h) {
  const palette = sceneFxPalette.value
  const base = { r: palette.r, g: palette.g, b: palette.b }

  // 亮背景：特效颜色更偏深；暗背景：更偏亮
  const tint = palette.l > 0.62
    ? mixColor(base, { r: 20, g: 30, b: 40 }, 0.55)
    : mixColor(base, { r: 255, g: 255, b: 255 }, 0.65)

  const seedBase = clampSceneId(sceneId.value) * 1000

  if (type === 'motes') {
    const count = 72
    const parts = Array.from({ length: count }, (_, i) => {
      const s = seedBase + i * 9.7
      return {
        x: fxRand(s + 1) * w,
        y: fxRand(s + 2) * h,
        r: 0.8 + fxRand(s + 3) * 2.2,
        vx: (-0.012 + fxRand(s + 4) * 0.024) * w,
        vy: (-0.018 + fxRand(s + 5) * 0.010) * h,
        a: 0.05 + fxRand(s + 6) * 0.10,
        p: fxRand(s + 7) * Math.PI * 2,
        s: 0.6 + fxRand(s + 8) * 1.8
      }
    })
    return { type, tint, parts }
  }

  if (type === 'bokeh') {
    const count = 14
    const blobs = Array.from({ length: count }, (_, i) => {
      const s = seedBase + i * 31.3
      const rr = 70 + fxRand(s + 1) * 170
      return {
        x: fxRand(s + 2) * w,
        y: fxRand(s + 3) * h,
        r: rr,
        vx: (-0.010 + fxRand(s + 4) * 0.020) * w,
        vy: (-0.006 + fxRand(s + 5) * 0.012) * h,
        a: 0.04 + fxRand(s + 6) * 0.08
      }
    })
    return { type, tint, blobs }
  }

  if (type === 'wheat') {
    const stalkCount = 11
    const stalks = Array.from({ length: stalkCount }, (_, i) => {
      const s = seedBase + i * 23.7
      const baseX = (0.08 + (i / (stalkCount - 1)) * 0.84) * w
      const height = (0.42 + fxRand(s + 1) * 0.28) * h
      const amp = (0.012 + fxRand(s + 2) * 0.020) * w
      return {
        x: baseX + (-0.04 + fxRand(s + 3) * 0.08) * w,
        y0: h * (0.98 + fxRand(s + 4) * 0.02),
        h: height,
        amp,
        phase: fxRand(s + 5) * Math.PI * 2,
        speed: 0.55 + fxRand(s + 6) * 0.85,
        tilt: (-0.12 + fxRand(s + 7) * 0.24)
      }
    })
    // 麦穗偏金色，明显一点
    const wheat = mixColor(tint, { r: 245, g: 214, b: 120 }, 0.78)
    return { type, tint: wheat, stalks }
  }

  if (type === 'waves') {
    const bandCount = 4
    const bands = Array.from({ length: bandCount }, (_, i) => {
      const s = seedBase + i * 37.1
      return {
        y: (0.52 + i * 0.12 + fxRand(s + 1) * 0.03) * h,
        amp: (0.018 + fxRand(s + 2) * 0.026) * h,
        wl: (0.22 + fxRand(s + 3) * 0.22) * w,
        speed: (0.16 + fxRand(s + 4) * 0.24) * w,
        a: 0.22 + fxRand(s + 5) * 0.18,
        phase: fxRand(s + 6) * Math.PI * 2
      }
    })
    const water = mixColor(tint, { r: 200, g: 240, b: 255 }, 0.70)
    return { type, tint: water, bands }
  }

  if (type === 'dandelion') {
    const seedCount = 34
    const seeds = Array.from({ length: seedCount }, (_, i) => {
      const s = seedBase + i * 19.3
      const scale = 0.8 + fxRand(s + 1) * 1.4
      return {
        x: fxRand(s + 2) * w,
        y: (0.15 + fxRand(s + 3) * 0.85) * h,
        vx: (-0.020 + fxRand(s + 4) * 0.040) * w,
        vy: (-0.020 + fxRand(s + 5) * 0.030) * h,
        r: 5.5 * scale,
        a: 0.34 + fxRand(s + 6) * 0.30,
        phase: fxRand(s + 7) * Math.PI * 2,
        spin: (-0.9 + fxRand(s + 8) * 1.8)
      }
    })
    const milk = mixColor(tint, { r: 255, g: 250, b: 235 }, 0.82)
    return { type, tint: milk, seeds }
  }

  if (type === 'fireflies') {
    const count = 42
    const flies = Array.from({ length: count }, (_, i) => {
      const s = seedBase + i * 17.9
      return {
        x: fxRand(s + 1) * w,
        y: fxRand(s + 2) * h,
        r: 2.6 + fxRand(s + 3) * 4.2,
        vx: (-0.014 + fxRand(s + 4) * 0.028) * w,
        vy: (-0.020 + fxRand(s + 5) * 0.040) * h,
        a: 0.14 + fxRand(s + 6) * 0.22,
        p: fxRand(s + 7) * Math.PI * 2,
        s: 0.7 + fxRand(s + 8) * 1.8
      }
    })
    // 萤火虫偏暖色一点
    const warm = mixColor(tint, { r: 255, g: 228, b: 140 }, 0.65)
    return { type, tint: warm, flies }
  }

  if (type === 'rays') {
    const beamCount = 6
    const beams = Array.from({ length: beamCount }, (_, i) => {
      const s = seedBase + i * 41.1
      return {
        x: fxRand(s + 1) * w,
        w: (0.18 + fxRand(s + 2) * 0.26) * w,
        a: 0.03 + fxRand(s + 3) * 0.05,
        speed: (0.02 + fxRand(s + 4) * 0.04) * w,
        phase: fxRand(s + 5) * Math.PI * 2
      }
    })
    const cool = mixColor(tint, { r: 210, g: 235, b: 255 }, 0.55)
    return { type, tint: cool, beams }
  }

  if (type === 'meteors') {
    const starCount = 110
    const stars = Array.from({ length: starCount }, (_, i) => {
      const s = seedBase + i * 13.7
      return {
        x: fxRand(s + 1) * w,
        y: fxRand(s + 2) * h,
        r: 0.7 + fxRand(s + 3) * 1.6,
        a: 0.05 + fxRand(s + 4) * 0.14,
        p: fxRand(s + 5) * Math.PI * 2,
        s: 0.8 + fxRand(s + 6) * 1.6
      }
    })
    return { type, tint: { r: 255, g: 255, b: 255 }, stars, meteors: [], nextSpawn: 0 }
  }

  if (type === 'butterflies') {
    const count = 18
    const butterflies = Array.from({ length: count }, (_, i) => {
      const s = seedBase + i * 29.7
      const speed = (0.06 + fxRand(s + 1) * 0.12) * Math.min(w, h)
      const angle = (-0.10 + fxRand(s + 2) * 0.45) * Math.PI
      const vx = Math.cos(angle) * speed
      const vy = Math.sin(angle) * speed
      return {
        x: fxRand(s + 3) * w,
        y: (0.18 + fxRand(s + 4) * 0.70) * h,
        vx,
        vy,
        s: 0.75 + fxRand(s + 5) * 1.45,
        a: 0.32 + fxRand(s + 6) * 0.30,
        p: fxRand(s + 7) * Math.PI * 2,
        flap: 4.6 + fxRand(s + 8) * 4.2,
        drift: 0.7 + fxRand(s + 9) * 1.5,
        bias: fxRand(s + 10) * Math.PI * 2
      }
    })
    // 蝴蝶偏亮粉紫，颜色更“明显”
    const butterfly = mixColor(tint, { r: 255, g: 118, b: 238 }, 0.82)
    const glow = mixColor(tint, { r: 255, g: 235, b: 205 }, 0.60)
    return { type, tint: butterfly, glow, butterflies }
  }

  if (type === 'glints') {
    const count = 112
    const glints = Array.from({ length: count }, (_, i) => {
      const s = seedBase + i * 21.1
      const r = 14 + fxRand(s + 1) * 62
      const y = (0.54 + fxRand(s + 2) * 0.42) * h
      const vx = (-0.02 + fxRand(s + 3) * 0.04) * w
      return {
        x: fxRand(s + 4) * w,
        y,
        r,
        stretch: 1.6 + fxRand(s + 5) * 3.4,
        a: 0.08 + fxRand(s + 6) * 0.22,
        p: fxRand(s + 7) * Math.PI * 2,
        tw: 1.1 + fxRand(s + 8) * 2.2,
        vx
      }
    })
    // 海面闪光偏暖白金
    const sun = mixColor(tint, { r: 255, g: 250, b: 222 }, 0.92)
    return { type, tint: sun, glints }
  }

  return { type: 'motes', tint, parts: [] }
}

function spawnMeteor(state, w, h) {
  const palette = sceneFxPalette.value
  // 按反馈：流星速度慢一点（更“沉浸”）
  const speed = (0.85 + Math.random() * 0.70) * Math.min(w, h) * 1.05
  const len = (0.48 + Math.random() * 0.60) * Math.min(w, h)
  const angle = (-Math.PI / 4) - (Math.random() * 0.20) // 斜向左下
  const vx = Math.cos(angle) * speed
  const vy = Math.sin(angle) * speed

  // 从右上方生成更像“流星雨”
  const x = (0.55 + Math.random() * 0.60) * w
  const y = (-0.15 + Math.random() * 0.35) * h

  const a = palette.l > 0.6 ? 0.55 : 0.98
  state.meteors.push({ x, y, vx, vy, len, t: 0, life: 0.95 + Math.random() * 0.65, a })
}

function drawSoftDot(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, a))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawDreamHaze(ctx, w, h, ts) {
  // 仅用于 bg2：很淡的蓝紫“雾气/极光感”，让画面更梦幻
  const t = ts / 1000
  const x1 = w * (0.25 + 0.08 * Math.sin(t * 0.18))
  const y1 = h * (0.35 + 0.06 * Math.cos(t * 0.14))
  const x2 = w * (0.75 + 0.08 * Math.cos(t * 0.16))
  const y2 = h * (0.60 + 0.06 * Math.sin(t * 0.12))

  const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, Math.min(w, h) * 0.55)
  g1.addColorStop(0, 'rgba(160, 200, 255, 0.10)')
  g1.addColorStop(1, 'rgba(160, 200, 255, 0)')

  const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, Math.min(w, h) * 0.60)
  g2.addColorStop(0, 'rgba(210, 170, 255, 0.08)')
  g2.addColorStop(1, 'rgba(210, 170, 255, 0)')

  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, w, h)
}

function renderFxFrame({ ctx, w, h }, ts) {
  if (!fxEnabled.value) return

  const types = sceneFxTypes.value
  const key = types.join('|')
  if (!fxState || fxState.key !== key) {
    const subs = {}
    for (const t of types) subs[t] = initFxState(t, w, h)
    fxState = { key, subs }
  }

  const dt = fxLastTs ? Math.min(0.05, (ts - fxLastTs) / 1000) : 0.016
  fxLastTs = ts

  ctx.clearRect(0, 0, w, h)

  // bg2：先铺一层梦幻雾气
  if (clampSceneId(sceneId.value) === 2) {
    drawDreamHaze(ctx, w, h, ts)
  }

  ctx.globalCompositeOperation = 'screen'

  for (const type of types) {
    const sub = fxState.subs[type]
    if (!sub) continue

    if (type === 'motes') {
      const tint = sub.tint
      for (const p of sub.parts) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20

        p.p += dt * p.s
        const tw = 0.65 + 0.35 * Math.sin(p.p)
        drawSoftDot(ctx, p.x, p.y, p.r * 5.2, tint, p.a * 0.55 * tw)
        drawSoftDot(ctx, p.x, p.y, p.r * 1.2, tint, p.a * tw)
      }
      continue
    }

    if (type === 'bokeh') {
      const tint = sub.tint
      for (const b of sub.blobs) {
        b.x += b.vx * dt
        b.y += b.vy * dt
        if (b.x < -b.r) b.x = w + b.r
        if (b.x > w + b.r) b.x = -b.r
        if (b.y < -b.r) b.y = h + b.r
        if (b.y > h + b.r) b.y = -b.r
        drawSoftDot(ctx, b.x, b.y, b.r, tint, b.a)
      }
      continue
    }

    if (type === 'fireflies') {
      const tint = sub.tint
      for (const f of sub.flies) {
        f.x += f.vx * dt
        f.y += f.vy * dt
        if (f.x < -40) f.x = w + 40
        if (f.x > w + 40) f.x = -40
        if (f.y < -40) f.y = h + 40
        if (f.y > h + 40) f.y = -40

        f.p += dt * f.s
        const tw = 0.55 + 0.45 * Math.sin(f.p)
        // 更明显的“呼吸发光”
        drawSoftDot(ctx, f.x, f.y, f.r * 16.0, tint, f.a * 0.55 * tw)
        drawSoftDot(ctx, f.x, f.y, f.r * 3.2, tint, f.a * tw)
      }
      continue
    }

    if (type === 'meteors') {
      const tint = sub.tint
      const meteorColor = mixColor({ r: 255, g: 255, b: 255 }, { r: 180, g: 220, b: 255 }, 0.55)

      // stars
      for (const s of sub.stars) {
        s.p += dt * s.s
        const tw = 0.55 + 0.45 * Math.sin(s.p)
        drawSoftDot(ctx, s.x, s.y, s.r * 7.2, tint, s.a * 1.10 * tw)
      }

      // spawn
      sub.nextSpawn -= dt
      if (sub.nextSpawn <= 0) {
        spawnMeteor(sub, w, h)
        // 更梦幻：不那么密集，但更慢更亮
        sub.nextSpawn = 0.55 + Math.random() * 1.05
      }

      // meteors
      const next = []
      for (const m of sub.meteors) {
        m.t += dt
        m.x += m.vx * dt
        m.y += m.vy * dt
        const k = clamp01(1 - m.t / m.life)
        if (k <= 0) continue
        next.push(m)

        const norm = Math.hypot(m.vx, m.vy) || 1
        const x2 = m.x - (m.vx / norm) * m.len
        const y2 = m.y - (m.vy / norm) * m.len
        const g = ctx.createLinearGradient(m.x, m.y, x2, y2)
        g.addColorStop(0, rgba(meteorColor, m.a * 0.90 * k))
        g.addColorStop(1, rgba(meteorColor, 0))
        ctx.strokeStyle = g
        ctx.lineWidth = 4.2
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(x2, y2)
        ctx.stroke()

        // 头部亮点
        drawSoftDot(ctx, m.x, m.y, 32, meteorColor, m.a * 0.26 * k)
      }
      sub.meteors = next
      continue
    }

    if (type === 'dandelion') {
      const tint = sub.tint
      for (const s of sub.seeds) {
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.phase += dt * s.spin

        if (s.x < -60) s.x = w + 60
        if (s.x > w + 60) s.x = -60
        if (s.y < -80) s.y = h + 80
        if (s.y > h + 80) s.y = -80

        const wobble = Math.sin(ts / 900 + s.phase) * 0.8
        const x = s.x + wobble * 8
        const y = s.y

        drawSoftDot(ctx, x, y, s.r * 10.0, tint, s.a * 0.62)
        ctx.strokeStyle = rgba(tint, s.a * 0.75)
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.arc(x, y, s.r * 2.2, Math.PI * 1.05, Math.PI * 1.95)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(x, y + s.r * 1.2)
        ctx.lineTo(x + wobble * 1.6, y + s.r * 6.2)
        ctx.stroke()

        drawSoftDot(ctx, x + wobble * 1.6, y + s.r * 6.2, s.r * 1.9, tint, s.a * 1.0)
      }
      continue
    }

    if (type === 'butterflies') {
      const tint = sub.tint
      const glow = sub.glow

      for (const b of sub.butterflies) {
        b.p += dt * b.flap
        const t = ts / 1000
        const wave = Math.sin(t * (0.9 * b.drift) + b.bias)

        b.x += b.vx * dt
        b.y += b.vy * dt + wave * (0.045 * h) * dt

        // wrap
        if (b.x < -120) b.x = w + 120
        if (b.x > w + 120) b.x = -120
        if (b.y < -120) b.y = h + 120
        if (b.y > h + 120) b.y = -120

        const flap = 0.30 + 0.70 * Math.abs(Math.sin(b.p))
        const angle = Math.atan2(b.vy, b.vx)

        const size = 18 * b.s
        const wingW = size * (1.25 + 0.55 * flap)
        const wingH = size * (0.95 + 0.25 * flap)

        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(angle)

        // 外围柔光（更“沉浸”）
        drawSoftDot(ctx, 0, 0, size * 3.8, glow, b.a * 0.46)

        // 翅膀渐变
        const gL = ctx.createRadialGradient(-wingW * 0.45, -wingH * 0.12, 0, -wingW * 0.45, -wingH * 0.12, wingW * 1.1)
        gL.addColorStop(0, rgba(tint, b.a * 1.00))
        gL.addColorStop(1, rgba(tint, 0))

        const gR = ctx.createRadialGradient(wingW * 0.45, -wingH * 0.12, 0, wingW * 0.45, -wingH * 0.12, wingW * 1.1)
        gR.addColorStop(0, rgba(tint, b.a * 1.00))
        gR.addColorStop(1, rgba(tint, 0))

        // 左翼
        ctx.fillStyle = gL
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(-wingW * 0.75, -wingH * 0.55, -wingW * 0.95, 0)
        ctx.quadraticCurveTo(-wingW * 0.65, wingH * 0.65, -wingW * 0.20, wingH * 0.20)
        ctx.closePath()
        ctx.fill()

        // 右翼
        ctx.fillStyle = gR
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(wingW * 0.75, -wingH * 0.55, wingW * 0.95, 0)
        ctx.quadraticCurveTo(wingW * 0.65, wingH * 0.65, wingW * 0.20, wingH * 0.20)
        ctx.closePath()
        ctx.fill()

        // 身体
        ctx.strokeStyle = rgba(glow, b.a * 0.55)
        ctx.lineWidth = 2.2
        ctx.beginPath()
        ctx.moveTo(-2, -size * 0.35)
        ctx.lineTo(2, size * 0.35)
        ctx.stroke()

        // 轮廓提色（让蝴蝶更明显）
        ctx.strokeStyle = rgba(glow, b.a * 0.22)
        ctx.lineWidth = 2.0
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(-wingW * 0.75, -wingH * 0.55, -wingW * 0.95, 0)
        ctx.quadraticCurveTo(-wingW * 0.65, wingH * 0.65, -wingW * 0.20, wingH * 0.20)
        ctx.closePath()
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(wingW * 0.75, -wingH * 0.55, wingW * 0.95, 0)
        ctx.quadraticCurveTo(wingW * 0.65, wingH * 0.65, wingW * 0.20, wingH * 0.20)
        ctx.closePath()
        ctx.stroke()

        // 翅尖高光
        drawSoftDot(ctx, wingW * 0.82, -wingH * 0.10, size * 0.8, glow, b.a * 0.22)
        drawSoftDot(ctx, -wingW * 0.82, -wingH * 0.10, size * 0.8, glow, b.a * 0.22)

        // 额外一层轻微“泛光”提饱和度
        drawSoftDot(ctx, 0, -size * 0.10, size * 2.4, tint, b.a * 0.16)

        ctx.restore()
      }
      continue
    }

    if (type === 'glints') {
      const tint = sub.tint

      const coverRect = (cw, ch, mw, mh) => {
        const iw = Math.max(1, mw)
        const ih = Math.max(1, mh)
        const s = Math.max(cw / iw, ch / ih)
        const ww = iw * s
        const hh = ih * s
        return { x: (cw - ww) / 2, y: (ch - hh) / 2, w: ww, h: hh }
      }

      // 小船遮罩：优先使用用户的 boat.svg（更精准），失败则用近似椭圆兜底
      const eraseBoat = () => {
        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'

        if (boatMaskReady && boatMaskImg) {
          const mw = sceneMediaNatural.value.w || boatMaskViewW || 1
          const mh = sceneMediaNatural.value.h || boatMaskViewH || 1
          const r = coverRect(w, h, mw, mh)
          ctx.drawImage(boatMaskImg, r.x, r.y, r.w, r.h)
        } else {
          // fallback：近似船区域（避免没有 boat.svg 时完全失效）
          const boatCx = w * 0.56
          const boatCy = h * 0.70
          const boatRx = w * 0.12
          const boatRy = h * 0.070
          const boatRot = -0.18
          ctx.translate(boatCx, boatCy)
          ctx.rotate(boatRot)
          ctx.fillStyle = 'rgba(0,0,0,1)'
          ctx.beginPath()
          ctx.ellipse(0, 0, boatRx, boatRy, 0, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
        ctx.globalCompositeOperation = 'screen'
      }

      // 一条非常淡的“光路”，把海面氛围提起来（不画波浪线）
      const t = ts / 1000
      const cx = w * (0.52 + 0.06 * Math.sin(t * 0.12))
      const gy = ctx.createLinearGradient(cx, h * 0.55, cx, h)
      gy.addColorStop(0, rgba(tint, 0.00))
      gy.addColorStop(0.18, rgba(tint, 0.085))
      gy.addColorStop(1, rgba(tint, 0.00))
      ctx.fillStyle = gy
      ctx.fillRect(0, h * 0.52, w, h * 0.48)
      eraseBoat()

      for (const g of sub.glints) {
        g.x += g.vx * dt
        if (g.x < -120) g.x = w + 120
        if (g.x > w + 120) g.x = -120

        g.p += dt * g.tw
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(g.p))

        // 靠近光路更亮
        const dx = Math.abs(g.x - cx)
        const boost = 0.45 + 0.75 * (1 - clamp01(dx / (w * 0.42)))
        const a = g.a * tw * boost

        // bloom
        drawSoftDot(ctx, g.x, g.y, g.r * 1.20, tint, a * 0.90)

        // 主体闪光：水平拉伸的小椭圆
        ctx.save()
        ctx.translate(g.x, g.y)
        ctx.scale(g.stretch, 1)
        ctx.fillStyle = rgba(tint, a)
        ctx.beginPath()
        ctx.ellipse(0, 0, g.r * 0.55, g.r * 0.18, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // 细十字高光（更明显，但仍是“反光”而非波浪）
        ctx.strokeStyle = rgba(tint, a * 0.65)
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(g.x - g.r * 0.55, g.y)
        ctx.lineTo(g.x + g.r * 0.55, g.y)
        ctx.moveTo(g.x, g.y - g.r * 0.18)
        ctx.lineTo(g.x, g.y + g.r * 0.18)
        ctx.stroke()
      }

      // 最后再擦一次，防止线段/柔光覆盖到船
      eraseBoat()
      continue
    }
  }
}

function parseSvgViewBox(svgText) {
  const m = svgText.match(/viewBox\s*=\s*"\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*"/i)
  if (!m) return { w: 0, h: 0 }
  return { w: Number(m[1]) || 0, h: Number(m[2]) || 0 }
}

async function ensureBoatMaskLoaded() {
  if (boatMaskReady || boatMaskLoading) return
  boatMaskLoading = true
  try {
    const svgText = await tryFetchText(boatMaskUrl)
    const vb = parseSvgViewBox(svgText)
    boatMaskViewW = vb.w
    boatMaskViewH = vb.h

    const blob = new Blob([svgText], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    boatMaskObjectUrl = url

    const img = new Image()
    img.decoding = 'async'
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(true)
      img.onerror = () => reject(new Error('boat mask load failed'))
      img.src = url
    })

    boatMaskImg = img
    boatMaskReady = true
  } catch (e) {
    console.warn('[bg] boat mask not usable', e)
    boatMaskImg = null
    boatMaskReady = false
  } finally {
    boatMaskLoading = false
  }
}

async function updateSceneMediaNatural(url) {
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(true)
      img.onerror = () => reject(new Error('scene media load failed'))
    })
    sceneMediaNatural.value = { w: img.naturalWidth || 0, h: img.naturalHeight || 0 }
  } catch {
    sceneMediaNatural.value = { w: 0, h: 0 }
  }
}

function startSceneFxLoop() {
  stopSceneFx()
  if (!fxEnabled.value) return
  const tick = (ts) => {
    const info = ensureFxCanvasSize()
    if (info) renderFxFrame(info, ts)
    fxRaf = requestAnimationFrame(tick)
  }
  fxRaf = requestAnimationFrame(tick)
}

function onFxResize() {
  if (!fxEnabled.value) return
  const canvas = fxCanvasEl.value
  const ctx = canvas?.getContext?.('2d')
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  fxState = null
}

function seeded01(seed) {
  // deterministic pseudo-random in [0,1)
  const x = Math.sin(seed * 999.123) * 43758.5453123
  return x - Math.floor(x)
}

function petalStyle(n) {
  const r1 = seeded01(n * 3.1)
  const r2 = seeded01(n * 7.7)
  const r3 = seeded01(n * 11.3)
  const x = Math.floor(r1 * 100)
  const size = Math.floor(18 + r2 * 26)
  const duration = (10 + r3 * 10).toFixed(2)
  const delay = (-r2 * 10).toFixed(2)
  const drift = (12 + r1 * 30).toFixed(2)
  const opacity = (0.35 + clamp01(r3) * 0.45).toFixed(2)
  const rot = Math.floor(r2 * 360)
  return {
    '--x': `${x}`,
    '--s': `${size}`,
    '--d': `${duration}`,
    '--delay': `${delay}`,
    '--drift': `${drift}`,
    '--o': `${opacity}`,
    '--r': `${rot}`
  }
}

function tryLoadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.src = url

    const ok = () => {
      cleanup()
      resolve(true)
    }
    const bad = () => {
      cleanup()
      reject(new Error('video load failed'))
    }
    const cleanup = () => {
      v.removeEventListener('loadedmetadata', ok)
      v.removeEventListener('error', bad)
    }

    v.addEventListener('loadedmetadata', ok)
    v.addEventListener('error', bad)
  })
}

function tryLoadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => reject(new Error('img load failed'))
    img.src = url
  })
}

async function tryFetchText(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`fetch failed: ${url}`)
  return await res.text()
}

function parseHotspotSvg(svgText) {
  // Supports two cases:
  // 1) true vector: contains <path ...>
  // 2) raster-in-svg (Figma sometimes exports <image href="data:image/png;base64,..."> + <use x/y>): we pixel-hit-test the embedded PNG.
  const viewBoxMatch = svgText.match(/viewBox\s*=\s*"\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*"/i)
  const viewBoxW = viewBoxMatch ? Number(viewBoxMatch[1]) : 3840
  const viewBoxH = viewBoxMatch ? Number(viewBoxMatch[2]) : 2160

  const imageMatch = svgText.match(/<image[^>]*\bwidth\s*=\s*"\s*([0-9.]+)\s*"[^>]*\bheight\s*=\s*"\s*([0-9.]+)\s*"[^>]*\bid\s*=\s*"\s*([^"]+)\s*"[^>]*\bhref\s*=\s*"\s*(data:image\/png;base64,[^"]+)\s*"/i)
  const useMatch = svgText.match(/<use[^>]*\bhref\s*=\s*"\s*#([^\"]+)\s*"[^>]*\bx\s*=\s*"\s*([0-9.]+)\s*"[^>]*\by\s*=\s*"\s*([0-9.]+)\s*"/i)

  // Vector: take the first path as the clickable area. (We can expand later.)
  const hasPath = /<path\b/i.test(svgText)

  if (hasPath && !imageMatch) {
    return { kind: 'vector', viewBoxW, viewBoxH, svgText }
  }

  if (imageMatch && useMatch) {
    const imgW = Number(imageMatch[1])
    const imgH = Number(imageMatch[2])
    const imgId = imageMatch[3]
    const dataUrl = imageMatch[4]
    const useHref = useMatch[1]
    const x = Number(useMatch[2])
    const y = Number(useMatch[3])
    if (useHref !== imgId) {
      // still usable; treat as-is
    }
    return {
      kind: 'raster',
      viewBoxW,
      viewBoxH,
      x,
      y,
      w: imgW,
      h: imgH,
      dataUrl
    }
  }

  throw new Error('Unsupported hotspot svg format')
}

async function buildRasterMask(dataUrl) {
  const img = new Image()
  img.decoding = 'async'
  img.src = dataUrl
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(true)
    img.onerror = () => reject(new Error('mask image load failed'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { imageData, width: canvas.width, height: canvas.height }
}

function clientToViewBox(evt) {
  // IMPORTANT: Must respect SVG preserveAspectRatio="xMidYMid slice".
  // Use screen CTM inverse to get correct viewBox coordinates.
  const el = hotspotSvgEl.value
  if (!el?.getScreenCTM || !el?.createSVGPoint) return null
  const ctm = el.getScreenCTM()
  if (!ctm) return null
  const pt = el.createSVGPoint()
  pt.x = evt.clientX
  pt.y = evt.clientY
  const p = pt.matrixTransform(ctm.inverse())
  return { vx: p.x, vy: p.y }
}

function hitTestRaster(item, vx, vy) {
  // Quick bounds
  if (vx < item.x || vy < item.y || vx > item.x + item.w || vy > item.y + item.h) return false
  const rx = (vx - item.x) / item.w
  const ry = (vy - item.y) / item.h
  const px = Math.floor(rx * item.mask.width)
  const py = Math.floor(ry * item.mask.height)
  if (px < 0 || py < 0 || px >= item.mask.width || py >= item.mask.height) return false
  const idx = (py * item.mask.width + px) * 4
  const a = item.mask.imageData.data[idx + 3]
  // silhouette should have alpha > 0
  return a > 16
}

function hitDogAt(vx, vy) {
  for (const item of hotspots.value.items) {
    if (item.kind === 'raster' && hitTestRaster(item, vx, vy)) return item.dog
  }
  return ''
}

function dispatchDogClick(dog) {
  window.dispatchEvent(new CustomEvent('bg-dog-click', { detail: { dog } }))
}

function onHotspotsClick(evt) {
  const p = clientToViewBox(evt)
  if (!p) return
  const { vx, vy } = p
  const dog = hitDogAt(vx, vy)
  if (!dog) return
  dispatchDogClick(dog)

  clickedDog.value = dog
  clickFx.value = { show: true, x: vx, y: vy, key: clickFx.value.key + 1 }
  window.setTimeout(() => {
    if (clickedDog.value === dog) clickedDog.value = ''
  }, 380)
  window.setTimeout(() => {
    clickFx.value = { ...clickFx.value, show: false }
  }, 520)
}

function onHotspotsMove(evt) {
  const p = clientToViewBox(evt)
  if (!p) return
  const dog = hitDogAt(p.vx, p.vy)
  hoveredDog.value = dog
}

function onHotspotsLeave() {
  hoveredDog.value = ''
}

async function tryPickFirstUsableVideo(urls) {
  for (const url of urls) {
    try {
      await tryLoadVideo(url)
      return url
    } catch {
      // ignore
    }
  }
  return ''
}

function fallbackToPlaceholder() {
  kind.value = 'img'
  // 不加载用户图片/视频时，保持“最开始的白色”底色
  src.value = '/assets/placeholders/bg_white.svg'
}

function clampSceneId(x) {
  const n = Number(x)
  if (!Number.isFinite(n)) return 1
  return Math.min(SCENE_COUNT, Math.max(1, Math.floor(n)))
}

function getSceneBgUrl(id) {
  return `/assets/user/bg${id}.png`
}

function getSceneBgCandidates(id) {
  const n = clampSceneId(id)
  return [
    `/assets/user/bg${n}.png`,
    `/assets/user/bg${n}.jpg`,
    `/assets/user/bg${n}.jpeg`
  ]
}

function getHotspotUrlsForScene(id) {
  // 约定：所有场景都带编号（1~N）
  // - bg1 -> dogsLeft_hotspots1.svg
  // - bg2 -> dogsLeft_hotspots2.svg
  const suffix = String(clampSceneId(id))
  const left = `/assets/user/dogsLeft_hotspots${suffix}.svg`
  const right = `/assets/user/dogsRight_hotspots${suffix}.svg`
  return { left, right, fallbackLeft: '/assets/user/dogsLeft_hotspots1.svg', fallbackRight: '/assets/user/dogsRight_hotspots1.svg' }
}

async function applySceneBackground(id) {
  const candidates = getSceneBgCandidates(id)
  for (const url of candidates) {
    try {
      await tryLoadImg(url)
      kind.value = 'img'
      src.value = url
      return true
    } catch (e) {
      console.warn('[bg] scene bg not usable, fallback...', { id, url }, e)
    }
  }
  return false
}

async function applySceneFx(id) {
  if (reduceMotion.value) {
    sceneFxOverlaySrc.value = ''
    sceneFxTypes.value = []
    stopSceneFx()
    return
  }

  const n = clampSceneId(id)
  sceneFxTypes.value = pickSceneFxTypes(n)

  if (!sceneFxTypes.value.length) {
    sceneFxOverlaySrc.value = ''
    stopSceneFx()
    return
  }

  // 允许用户提供每个场景单独的透明 overlay 视频（比 Canvas 更“像真特效”）
  sceneFxOverlaySrc.value = await tryPickFirstUsableVideo([
    `/assets/user/fx_scene${n}.webm`,
    `/assets/user/fx_scene${n}.mp4`,
    `/assets/user/overlay_scene${n}.webm`,
    `/assets/user/overlay_scene${n}.mp4`
  ])

  // palette: 用当前背景图取平均色，做更“贴图”的特效色调
  sceneFxPalette.value = await computePaletteFromUrl(src.value)

  // bg4：使用用户提供的 boat.svg 做遮罩，避免光斑落到船上
  if (n === 4 && sceneFxTypes.value.includes('glints') && !sceneFxOverlaySrc.value) {
    await ensureBoatMaskLoaded()
  }

  // 仅当没有 overlay 视频时，才启用 canvas 动效
  startSceneFxLoop()
}

watch(src, async (v) => {
  // 采集背景媒体原始尺寸，用于遮罩对齐
  if (typeof v === 'string' && v) {
    await updateSceneMediaNatural(v)
  }
})

async function loadHotspotsForScene(id) {
  hotspots.value = { ...hotspots.value, ready: false, items: [] }
  hoveredDog.value = ''
  clickedDog.value = ''

  const urls = getHotspotUrlsForScene(id)

  let leftText = ''
  let rightText = ''

  // 每侧独立加载：某个缺失不影响另一侧
  try {
    leftText = await tryFetchText(urls.left)
  } catch (e) {
    try {
      leftText = await tryFetchText(urls.fallbackLeft)
    } catch (e2) {
      console.warn('[bg] left hotspot not usable', { id, url: urls.left }, e2)
    }
  }

  try {
    rightText = await tryFetchText(urls.right)
  } catch (e) {
    try {
      rightText = await tryFetchText(urls.fallbackRight)
    } catch (e2) {
      console.warn('[bg] right hotspot not usable', { id, url: urls.right }, e2)
    }
  }

  if (!leftText && !rightText) return

  const items = []
  let viewBoxW = 3840
  let viewBoxH = 2160

  if (leftText) {
    const leftParsed = parseHotspotSvg(leftText)
    viewBoxW = leftParsed.viewBoxW || viewBoxW
    viewBoxH = leftParsed.viewBoxH || viewBoxH
    if (leftParsed.kind === 'raster') {
      const mask = await buildRasterMask(leftParsed.dataUrl)
      items.push({ dog: 'left', kind: 'raster', ...leftParsed, mask })
    }
  }

  if (rightText) {
    const rightParsed = parseHotspotSvg(rightText)
    viewBoxW = rightParsed.viewBoxW || viewBoxW
    viewBoxH = rightParsed.viewBoxH || viewBoxH
    if (rightParsed.kind === 'raster') {
      const mask = await buildRasterMask(rightParsed.dataUrl)
      items.push({ dog: 'right', kind: 'raster', ...rightParsed, mask })
    }
  }

  if (items.length) {
    hotspots.value = { ready: true, viewBoxW, viewBoxH, items }
  }
}

async function applyScene(id, { persist } = { persist: false }) {
  const next = clampSceneId(id)
  sceneId.value = next
  if (persist) localStorage.setItem(SCENE_STORAGE_KEY, String(next))

  // 1) base background: 优先 bg{n}.png；失败则回退旧逻辑
  const ok = await applySceneBackground(next)
  if (!ok) {
    // 兼容旧命名（仍可用 bg.jpg / bg.png / bg.webm / bg.mp4 / bg.gif）
    let picked = false
    try {
      await tryLoadImg('/assets/user/bg.jpg')
      kind.value = 'img'
      src.value = '/assets/user/bg.jpg'
      picked = true
    } catch {
      // ignore
    }

    if (!picked) {
      try {
        await tryLoadImg('/assets/user/bg.png')
        kind.value = 'img'
        src.value = '/assets/user/bg.png'
        picked = true
      } catch {
        // ignore
      }
    }

    if (!picked) {
      try {
        await tryLoadVideo('/assets/user/bg.webm')
        kind.value = 'video'
        src.value = '/assets/user/bg.webm'
        picked = true
      } catch {
        // ignore
      }
    }

    if (!picked) {
      try {
        await tryLoadVideo('/assets/user/bg.mp4')
        kind.value = 'video'
        src.value = '/assets/user/bg.mp4'
        picked = true
      } catch {
        // ignore
      }
    }

    if (!picked) {
      try {
        await tryLoadImg('/assets/user/bg.gif')
        kind.value = 'img'
        src.value = '/assets/user/bg.gif'
        picked = true
      } catch {
        // ignore
      }
    }

    if (!picked) fallbackToPlaceholder()
  }

  // 2) hotspots: 跟随场景
  try {
    await loadHotspotsForScene(next)
  } catch (e) {
    console.warn('[bg] load hotspots failed', e)
  }

  // 3) scene fx: 跟随场景
  try {
    await applySceneFx(next)
  } catch (e) {
    console.warn('[bg] apply scene fx failed', e)
  }
}

function onSceneSetEvent(evt) {
  const id = evt?.detail?.sceneId
  applyScene(id, { persist: true })
}

onMounted(async () => {
  reduceMotion.value = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  // debug panel: opt-in only
  showDebug.value = import.meta.env.DEV && localStorage.getItem('bg_debug') === '1'

  // restore scene
  sceneId.value = clampSceneId(localStorage.getItem(SCENE_STORAGE_KEY) || 1)

  window.addEventListener('bg-scene-set', onSceneSetEvent)

  // 1) Pick base background for scene (no early return; we still need overlays)
  await applyScene(sceneId.value, { persist: false })

  // 2) overlays（尽量不影响清晰度）：透明 petals / ripples
  try {
    petalsOverlaySrc.value = await tryPickFirstUsableVideo([
      '/assets/user/overlay_petals.webm',
      '/assets/user/overlay_petals.mp4'
    ])
    ripplesOverlaySrc.value = await tryPickFirstUsableVideo([
      '/assets/user/overlay_ripples.webm',
      '/assets/user/overlay_ripples.mp4'
    ])
  } catch (e) {
    console.warn('[bg] overlay load failed', e)
  }

  // 3) hotspots handled by applyScene()

  window.addEventListener('resize', onFxResize)
})

onBeforeUnmount(() => {
  if (boatMaskObjectUrl) {
    try { URL.revokeObjectURL(boatMaskObjectUrl) } catch { /* ignore */ }
    boatMaskObjectUrl = ''
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('bg-scene-set', onSceneSetEvent)
  window.removeEventListener('resize', onFxResize)
  stopSceneFx()
})

watch(
  () => [reduceMotion.value, sceneFxTypes.value.join('|'), sceneFxOverlaySrc.value],
  () => {
    if (reduceMotion.value) {
      stopSceneFx()
      return
    }
    startSceneFxLoop()
  }
)
</script>

<style scoped>
.bg-root{
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: auto;
  background: #fff;
}

.bg-stage{
  position: absolute;
  inset: 0;
  transform-origin: center;
  will-change: transform;
}

@keyframes bgStageBreath{
  0%{ transform: scale(1.03); }
  50%{ transform: scale(1.08); }
  100%{ transform: scale(1.03); }
}

.bg-stage{
  animation: bgStageBreath 9s ease-in-out infinite;
}

.bg-media{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  transform-origin: center;
  will-change: transform;
}

.bg-overlay{
  position: absolute;
  inset: 0;
  /* 不要“粉粉的”整体染色：只保留非常轻的中性暗角与可读性 */
  background:
    radial-gradient(1200px 800px at 50% 35%, rgba(255,255,255,0.03), rgba(0,0,0,0) 62%),
    radial-gradient(1100px 900px at 50% 65%, rgba(0,0,0,0.10), rgba(0,0,0,0) 62%),
    linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.12));
  opacity: 0.75;
  will-change: opacity;
}

@keyframes bgGlow{
  0%{ opacity: 0.68; }
  50%{ opacity: 0.82; }
  100%{ opacity: 0.68; }
}

.bg-debug{
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(233,241,255,0.92);
  font-size: 12px;
  line-height: 1.2;
  max-width: min(520px, calc(100vw - 20px));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes bgBreathImg{
  /* Tier 1：非常轻的“呼吸”，尽量不放大插值带来的软化 */
  0%{ transform: scale(1.02); }
  50%{ transform: scale(1.07); }
  100%{ transform: scale(1.02); }
}

@keyframes bgBreathVideo{
  /* 视频仍做更大一点的 overscan，避免黑边 */
  0%{ transform: scale(1.06); }
  50%{ transform: scale(1.09); }
  100%{ transform: scale(1.06); }
}

.bg-breath-img{
  animation: bgBreathImg 9s ease-in-out infinite;
}

.bg-breath-video{
  animation: bgBreathVideo 8s ease-in-out infinite;
}

.bg-overlay{
  animation: bgGlow 9s ease-in-out infinite;
}

.bg-overlay-media{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  pointer-events: none;
}

.bg-fx-canvas{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  will-change: contents;
}

.bg-scene-fx{
  opacity: 0.55;
  mix-blend-mode: screen;
}

.bg-fx-canvas.fx-meteors{ opacity: 0.96; mix-blend-mode: screen; }
.bg-fx-canvas.fx-motes{ opacity: 0.72; mix-blend-mode: screen; }
.bg-fx-canvas.fx-wheat{ opacity: 0.86; mix-blend-mode: overlay; }
.bg-fx-canvas.fx-waves{ opacity: 0.94; mix-blend-mode: overlay; }
.bg-fx-canvas.fx-dandelion{ opacity: 1; mix-blend-mode: screen; }
.bg-fx-canvas.fx-fireflies{ opacity: 0.96; mix-blend-mode: screen; }
.bg-fx-canvas.fx-butterflies{ opacity: 0.98; mix-blend-mode: screen; }
.bg-fx-canvas.fx-glints{ opacity: 1; mix-blend-mode: screen; }
.bg-fx-canvas.fx-combo{ opacity: 1; }
.bg-fx-canvas.fx-rays{ opacity: 0.62; mix-blend-mode: overlay; }

.bg-scene-fx.fx-rays{ opacity: 0.42; mix-blend-mode: overlay; }

.bg-hotspots{
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  cursor: default;
}

.bg-hotspots.is-hovering{
  cursor: pointer;
}

.hot-outline{
  opacity: 0;
  transition: opacity 140ms ease;
  transform-box: fill-box;
  transform-origin: center;
}

.hot-outline.is-show{
  opacity: 1;
}

@keyframes hotClickPulse{
  0%{ opacity: 1; transform: scale(1.00); }
  35%{ opacity: 1; transform: scale(1.04); }
  100%{ opacity: 0.0; transform: scale(1.08); }
}

.hot-outline.is-click{
  animation: hotClickPulse 420ms ease-out;
}

@keyframes clickRing{
  0%{ opacity: 0.0; r: 10; stroke-width: 5; }
  20%{ opacity: 0.95; }
  100%{ opacity: 0.0; r: 56; stroke-width: 1; }
}

.click-ring{
  fill: none;
  stroke: rgba(255, 244, 170, 0.95);
  filter: drop-shadow(0 0 10px rgba(255, 232, 140, 0.55));
  animation: clickRing 520ms ease-out;
}

.bg-petals{
  opacity: 0.98;
  mix-blend-mode: screen;
}

.bg-ripples{
  opacity: 0.86;
  mix-blend-mode: overlay;
}

.petals-layer{
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.petal{
  position: absolute;
  left: calc(var(--x) * 1%);
  top: -12vh;
  width: calc(var(--s) * 1px);
  height: calc(var(--s) * 1px);
  opacity: calc(var(--o) * 1.08);
  background-image: url('/assets/placeholders/petal.svg');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  transform: translate3d(0,0,0) rotate(calc(var(--r) * 1deg));
  filter: drop-shadow(0 10px 16px rgba(30, 0, 18, 0.28));
  animation: petalFall calc(var(--d) * 1s) linear infinite;
  animation-delay: calc(var(--delay) * 1s);
}

@keyframes petalFall{
  0%{ transform: translate3d(0, -6vh, 0) rotate(calc(var(--r) * 1deg)); }
  50%{ transform: translate3d(calc(var(--drift) * 1px), 55vh, 0) rotate(calc((var(--r) + 120) * 1deg)); }
  100%{ transform: translate3d(calc(var(--drift) * -1px), 120vh, 0) rotate(calc((var(--r) + 260) * 1deg)); }
}

.ripples-layer{
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.46;
  mix-blend-mode: overlay;
  background:
    radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10) 0 2px, rgba(255,255,255,0) 3px 26px);
  background-size: 200px 200px;
  animation: ripplesMove 10s linear infinite;
}

@keyframes ripplesMove{
  0%{ background-position: 0 0; transform: scale(1.00); }
  50%{ background-position: 120px 80px; transform: scale(1.03); }
  100%{ background-position: 240px 160px; transform: scale(1.00); }
}

.petals-off .petal{
  animation: none;
}

.ripples-off{
  animation: none;
}

@media (prefers-reduced-motion: reduce){
  .bg-stage{ animation: none; }
  .bg-overlay{ animation: none; }
  .petal{ animation: none; }
  .ripples-layer{ animation: none; }
  .bg-fx-canvas{ display: none; }
  .bg-scene-fx{ display: none; }
  .hot-outline{ transition: none; animation: none; }
  .click-ring{ animation: none; opacity: 0; }
}
</style>
