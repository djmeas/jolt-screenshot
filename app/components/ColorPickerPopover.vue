<script setup lang="ts">
import {
  hsvaToRgba,
  rgbaToHsva,
  rgbaToHex,
  parseHexColor,
  parseColorString,
  hsvaToCss,
  colorOverCheckerStyle,
  type Hsva,
  type Rgba,
} from '~/utils/color'

const props = defineProps<{
  modelValue: string
  isDark: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'close': []
}>()

const RECENTS_KEY = 'joltshot-recent-colors'
const MAX_RECENTS = 5

const SV_W = 216
const SV_H = 140
const SLIDER_W = 216
const SLIDER_H = 14

const initialParsed = parseColorString(props.modelValue)
const hsva = ref<Hsva>(initialParsed ?? { h: 0, s: 1, v: 1, a: 1 })
const initialCss = props.modelValue

const svCanvasRef = ref<HTMLCanvasElement | null>(null)
const hueCanvasRef = ref<HTMLCanvasElement | null>(null)
const alphaCanvasRef = ref<HTMLCanvasElement | null>(null)

const recents = ref<string[]>([])

const rgbaCurrent = computed<Rgba>(() => hsvaToRgba(hsva.value.h, hsva.value.s, hsva.value.v, hsva.value.a))

function update(next: Partial<Hsva>) {
  hsva.value = { ...hsva.value, ...next }
  emit('update:modelValue', hsvaToCss(hsva.value))
}

function colorsEqual(a: Hsva, b: Hsva): boolean {
  const ra = hsvaToRgba(a.h, a.s, a.v, a.a)
  const rb = hsvaToRgba(b.h, b.s, b.v, b.a)
  return ra.r === rb.r && ra.g === rb.g && ra.b === rb.b && Math.abs(ra.a - rb.a) < 0.005
}

watch(() => props.modelValue, (val) => {
  const parsed = parseColorString(val)
  if (parsed && !colorsEqual(parsed, hsva.value)) hsva.value = parsed
})

function setupCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function drawChecker(ctx: CanvasRenderingContext2D, w: number, h: number, size = 5) {
  for (let row = 0; row * size < h; row++) {
    for (let col = 0; col * size < w; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#c4c4c4'
      ctx.fillRect(col * size, row * size, size, size)
    }
  }
}

function drawSliderHandle(ctx: CanvasRenderingContext2D, x: number, h: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - 2.5, 0, 5, h)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(x - 2.5, 0.5, 5, h - 1)
}

function renderSv() {
  const canvas = svCanvasRef.value
  if (!canvas) return
  const ctx = setupCanvas(canvas, SV_W, SV_H)
  const hueRgb = hsvaToRgba(hsva.value.h, 1, 1, 1)
  ctx.fillStyle = `rgb(${hueRgb.r}, ${hueRgb.g}, ${hueRgb.b})`
  ctx.fillRect(0, 0, SV_W, SV_H)
  const whiteGrad = ctx.createLinearGradient(0, 0, SV_W, 0)
  whiteGrad.addColorStop(0, 'rgba(255,255,255,1)')
  whiteGrad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = whiteGrad
  ctx.fillRect(0, 0, SV_W, SV_H)
  const blackGrad = ctx.createLinearGradient(0, 0, 0, SV_H)
  blackGrad.addColorStop(0, 'rgba(0,0,0,0)')
  blackGrad.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = blackGrad
  ctx.fillRect(0, 0, SV_W, SV_H)
  const x = hsva.value.s * SV_W
  const y = (1 - hsva.value.v) * SV_H
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function renderHue() {
  const canvas = hueCanvasRef.value
  if (!canvas) return
  const ctx = setupCanvas(canvas, SLIDER_W, SLIDER_H)
  const grad = ctx.createLinearGradient(0, 0, SLIDER_W, 0)
  for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SLIDER_W, SLIDER_H)
  drawSliderHandle(ctx, (hsva.value.h / 360) * SLIDER_W, SLIDER_H)
}

function renderAlpha() {
  const canvas = alphaCanvasRef.value
  if (!canvas) return
  const ctx = setupCanvas(canvas, SLIDER_W, SLIDER_H)
  drawChecker(ctx, SLIDER_W, SLIDER_H)
  const c = rgbaCurrent.value
  const grad = ctx.createLinearGradient(0, 0, SLIDER_W, 0)
  grad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`)
  grad.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 1)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, SLIDER_W, SLIDER_H)
  drawSliderHandle(ctx, hsva.value.a * SLIDER_W, SLIDER_H)
}

function renderAll() {
  renderSv()
  renderHue()
  renderAlpha()
}

watch(hsva, () => nextTick(renderAll), { deep: true })

function dragOn(canvas: HTMLCanvasElement, e: PointerEvent, onMove: (fx: number, fy: number) => void) {
  canvas.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const fx = Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1)
    const fy = Math.min(Math.max((ev.clientY - rect.top) / rect.height, 0), 1)
    onMove(fx, fy)
  }
  const up = () => {
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('pointerup', up)
  }
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  move(e)
}

function onSvPointerDown(e: PointerEvent) {
  if (!svCanvasRef.value) return
  dragOn(svCanvasRef.value, e, (fx, fy) => update({ s: fx, v: 1 - fy }))
}

function onHuePointerDown(e: PointerEvent) {
  if (!hueCanvasRef.value) return
  dragOn(hueCanvasRef.value, e, (fx) => update({ h: fx * 360 }))
}

function onAlphaPointerDown(e: PointerEvent) {
  if (!alphaCanvasRef.value) return
  dragOn(alphaCanvasRef.value, e, (fx) => update({ a: Math.round(fx * 100) / 100 }))
}

function clampChannel(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v || 0)))
}

function clampPercent(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v || 0)))
}

function applyRgba(c: Rgba) {
  update(rgbaToHsva(c.r, c.g, c.b, c.a))
}

const rChannel = computed({
  get: () => rgbaCurrent.value.r,
  set: (v: number) => applyRgba({ ...rgbaCurrent.value, r: clampChannel(v) }),
})
const gChannel = computed({
  get: () => rgbaCurrent.value.g,
  set: (v: number) => applyRgba({ ...rgbaCurrent.value, g: clampChannel(v) }),
})
const bChannel = computed({
  get: () => rgbaCurrent.value.b,
  set: (v: number) => applyRgba({ ...rgbaCurrent.value, b: clampChannel(v) }),
})
const aChannel = computed({
  get: () => Math.round(rgbaCurrent.value.a * 100),
  set: (v: number) => applyRgba({ ...rgbaCurrent.value, a: clampPercent(v) / 100 }),
})

const hexField = ref('')
let editingHex = false

watch(rgbaCurrent, (c) => {
  if (!editingHex) hexField.value = rgbaToHex(c.r, c.g, c.b, c.a)
}, { immediate: true })

function onHexInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  editingHex = true
  hexField.value = raw
  const parsed = parseHexColor(raw)
  if (parsed) applyRgba(parsed)
  editingHex = false
}

function onHexBlur() {
  const c = rgbaCurrent.value
  hexField.value = rgbaToHex(c.r, c.g, c.b, c.a)
}

function applyRecent(color: string) {
  const parsed = parseColorString(color)
  if (parsed) update(parsed)
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        recents.value = parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENTS)
      }
    }
  } catch {
    recents.value = []
  }
  renderAll()
})

onBeforeUnmount(() => {
  const css = hsvaToCss(hsva.value)
  if (css === initialCss) return
  recents.value = [css, ...recents.value.filter(c => c !== css)].slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.value))
  } catch {
    // storage unavailable; ignore
  }
})
</script>

<template>
  <div
    class="w-[240px] max-w-[calc(100vw-16px)] rounded-xl border shadow-2xl p-3 flex flex-col gap-3 select-none"
    :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
    @click.stop
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Custom color</span>
      <button
        type="button"
        class="w-6 h-6 rounded-md text-sm leading-none transition-colors"
        :class="[isDark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700']"
        title="Close"
        @click="emit('close')"
      >×</button>
    </div>

    <canvas
      ref="svCanvasRef"
      class="rounded-lg cursor-crosshair touch-none"
      @pointerdown="onSvPointerDown"
    />
    <canvas
      ref="hueCanvasRef"
      class="rounded-full cursor-pointer touch-none"
      @pointerdown="onHuePointerDown"
    />
    <canvas
      ref="alphaCanvasRef"
      class="rounded-full cursor-pointer touch-none"
      @pointerdown="onAlphaPointerDown"
    />

    <div class="grid grid-cols-5 gap-1">
      <input
        :value="hexField"
        type="text"
        spellcheck="false"
        class="col-span-1 min-w-0 px-1 py-1 rounded-md border text-[11px] font-mono text-center"
        :class="[isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-700']"
        title="Hex (#rrggbb or #rrggbbaa)"
        @input="onHexInput"
        @blur="onHexBlur"
      />
      <input
        v-model.number="rChannel"
        type="number"
        min="0"
        max="255"
        class="min-w-0 px-1 py-1 rounded-md border text-[11px] text-center"
        :class="[isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-700']"
        title="Red (0–255)"
      />
      <input
        v-model.number="gChannel"
        type="number"
        min="0"
        max="255"
        class="min-w-0 px-1 py-1 rounded-md border text-[11px] text-center"
        :class="[isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-700']"
        title="Green (0–255)"
      />
      <input
        v-model.number="bChannel"
        type="number"
        min="0"
        max="255"
        class="min-w-0 px-1 py-1 rounded-md border text-[11px] text-center"
        :class="[isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-700']"
        title="Blue (0–255)"
      />
      <input
        v-model.number="aChannel"
        type="number"
        min="0"
        max="100"
        class="min-w-0 px-1 py-1 rounded-md border text-[11px] text-center"
        :class="[isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-slate-300 text-slate-700']"
        title="Alpha (0–100%)"
      />
    </div>

    <div v-if="recents.length" class="flex flex-col gap-1.5">
      <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Recent</span>
      <div class="flex gap-1.5">
        <button
          v-for="c in recents"
          :key="c"
          type="button"
          class="w-6 h-6 rounded-full ring-1 transition-transform hover:scale-110"
          :class="[isDark ? 'ring-white/10' : 'ring-slate-300']"
          :style="colorOverCheckerStyle(c)"
          :title="c"
          @click="applyRecent(c)"
        />
      </div>
    </div>
  </div>
</template>
