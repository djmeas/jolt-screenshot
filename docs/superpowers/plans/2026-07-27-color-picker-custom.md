# Custom Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Photoshop-style custom color picker (rainbow first swatch opening a popover with SV area, hue/alpha sliders, hex + RGBA inputs, recent colors) to JoltShot's shared color picker.

**Architecture:** Pure color-conversion helpers in `app/utils/color.ts` (auto-imported by Nuxt). A self-contained `app/components/ColorPickerPopover.vue` owns all picker UI and recent-colors persistence. `app/app.vue` gains a rainbow "custom" swatch in both color strips (desktop toolbar + mobile overflow menu) that toggles the popover and live-applies colors to `strokeColor` (which may now be `#rrggbb` or `rgba(...)` — canvas accepts both).

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Tailwind CSS, Canvas 2D. Node 24 available for verification scripts (type stripping enabled by default).

**Spec:** `docs/superpowers/specs/2026-07-27-color-picker-custom-design.md`

## Global Constraints

- No test framework exists in this repo; verification = node one-off scripts for utils, `npm run build` for compile checks, and manual dev-server checklists for UI.
- `strokeColor` stays a `string`; new possible values: `#rrggbb` (alpha=1) or `rgba(r, g, b, a)` (alpha<1).
- Recent colors persist to `localStorage` key `joltshot-recent-colors` (max 5, deduped, most-recent-first).
- Do NOT add dependencies. No comments in code unless asked.
- Branch: `feature/ColorPickerCustom` (already checked out).

---

### Task 1: Color conversion helpers

**Files:**
- Create: `app/utils/color.ts`

**Interfaces:**
- Produces (used by Tasks 2–4):
  - `type Hsva = { h: number; s: number; v: number; a: number }` (h 0–360; s, v, a 0–1)
  - `type Rgba = { r: number; g: number; b: number; a: number }` (r/g/b 0–255; a 0–1)
  - `hsvaToRgba(h, s, v, a): Rgba`
  - `rgbaToHsva(r, g, b, a): Hsva`
  - `rgbaToHex(r, g, b, a): string` (`#rrggbb` or `#rrggbbaa` when a<1)
  - `parseHexColor(input: string): Rgba | null` (accepts `#rgb`, `#rrggbb`, `#rrggbbaa`, `#` optional)
  - `parseColorString(input: string): Hsva | null` (hex or `rgb(a)(...)`)
  - `hsvaToCss(hsva: Hsva): string` (`#rrggbb` when a=1, else `rgba(r, g, b, a)` with a rounded to 2 decimals)
  - `colorOverCheckerStyle(color: string): Record<string, string>` (CSS style object: color layer over checkerboard)

- [ ] **Step 1: Create `app/utils/color.ts`**

```ts
export type Hsva = { h: number, s: number, v: number, a: number }
export type Rgba = { r: number, g: number, b: number, a: number }

export function hsvaToRgba(h: number, s: number, v: number, a: number): Rgba {
  const hue = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (hue < 60) { r = c; g = x }
  else if (hue < 120) { r = x; g = c }
  else if (hue < 180) { g = c; b = x }
  else if (hue < 240) { g = x; b = c }
  else if (hue < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a }
}

export function rgbaToHsva(r: number, g: number, b: number, a: number): Hsva {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max, a }
}

export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  const base = `#${to2(r)}${to2(g)}${to2(b)}`
  return a >= 1 ? base : `${base}${to2(a * 255)}`
}

export function parseHexColor(input: string): Rgba | null {
  let hex = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(hex)) hex = hex.split('').map(c => c + c).join('')
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 }
  }
  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100 }
  }
  return null
}

export function parseColorString(input: string): Hsva | null {
  const str = input.trim()
  if (str.startsWith('#')) {
    const rgba = parseHexColor(str)
    return rgba ? rgbaToHsva(rgba.r, rgba.g, rgba.b, rgba.a) : null
  }
  const m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) {
    const a = m[4] === undefined ? 1 : Math.min(Math.max(parseFloat(m[4]), 0), 1)
    return rgbaToHsva(Number(m[1]), Number(m[2]), Number(m[3]), a)
  }
  return null
}

export function hsvaToCss(hsva: Hsva): string {
  const { r, g, b, a } = hsvaToRgba(hsva.h, hsva.s, hsva.v, hsva.a)
  if (a >= 1) return rgbaToHex(r, g, b, 1)
  const alpha = Math.round(a * 100) / 100
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const CHECKER_GRADIENTS = 'linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.15) 75%), linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.15) 75%)'

export function colorOverCheckerStyle(color: string): Record<string, string> {
  return {
    backgroundImage: `linear-gradient(${color}, ${color}), ${CHECKER_GRADIENTS}`,
    backgroundSize: 'auto, 8px 8px, 8px 8px',
    backgroundPosition: '0 0, 0 0, 4px 4px',
    backgroundColor: '#ffffff',
  }
}
```

- [ ] **Step 2: Verify conversions with Node (type stripping is on by default in Node 24)**

Run from repo root:

```bash
node --input-type=module -e "
import('./app/utils/color.ts').then(m => {
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1) } }
  assert(m.hsvaToCss(m.parseColorString('#ef4444')) === '#ef4444', 'hex round-trip')
  assert(m.hsvaToCss(m.parseColorString('rgba(0, 128, 255, 0.5)')) === 'rgba(0, 128, 255, 0.5)', 'rgba round-trip')
  assert(m.rgbaToHex(0, 255, 0, 0.5) === '#00ff0080', 'rgbaToHex with alpha')
  const p = m.parseHexColor('#00ff0080')
  assert(p && p.r === 0 && p.g === 255 && p.b === 0 && Math.abs(p.a - 0.5) < 0.01, 'parseHexColor 8-digit')
  const short = m.parseHexColor('#0f0')
  assert(short && short.r === 0 && short.g === 255 && short.b === 0 && short.a === 1, 'parseHexColor 3-digit')
  assert(m.hsvaToCss({ h: 120, s: 1, v: 1, a: 1 }) === '#00ff00', 'hsv green')
  assert(m.parseColorString('garbage') === null, 'invalid returns null')
  const style = m.colorOverCheckerStyle('#123456')
  assert(style.backgroundImage.includes('#123456') && style.backgroundColor === '#ffffff', 'checker style')
  console.log('All color util checks passed')
})"
```

Expected: `All color util checks passed`

- [ ] **Step 3: Commit**

```bash
git add app/utils/color.ts
git commit -m "Add color conversion helpers for custom color picker"
```

---

### Task 2: ColorPickerPopover component

**Files:**
- Create: `app/components/ColorPickerPopover.vue`

**Interfaces:**
- Consumes: everything from Task 1 (`Hsva`, `Rgba`, `hsvaToRgba`, `rgbaToHsva`, `rgbaToHex`, `parseHexColor`, `parseColorString`, `hsvaToCss`, `colorOverCheckerStyle`).
- Produces (used by Tasks 3–4): component `ColorPickerPopover` (auto-imported by Nuxt from `app/components/`) with:
  - Props: `modelValue: string`, `isDark: boolean`
  - Emits: `'update:modelValue': [value: string]` (live, on every change), `'close': []`
  - Owns recent-colors persistence (`localStorage` key `joltshot-recent-colors`); pushes the final color on unmount only if it changed since mount.

- [ ] **Step 1: Create `app/components/ColorPickerPopover.vue`**

```vue
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
```

- [ ] **Step 2: Verify compile**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/ColorPickerPopover.vue
git commit -m "Add ColorPickerPopover component with SV area, sliders, fields, recents"
```

---

### Task 3: Rainbow swatch + popover in desktop toolbar

**Files:**
- Modify: `app/app.vue` (script: near lines 122–131 `colors` array, line 1244 `updateColorIndicator`, lines 1315–1320 `selectStrokeColor`, lines 1494–1499 `onDocumentClick`, lines 1509–1534 `handleKeydown`, lines 1557–1559 `watch(showToolbarMenu)`; template: desktop color strip lines 1720–1743)

**Interfaces:**
- Consumes: `ColorPickerPopover` (Task 2), `colorOverCheckerStyle` (Task 1).
- Produces (used by Task 4): `CUSTOM_COLOR_KEY`, `customColor`, `showColorPicker`, `colorPickerAnchor`, `toggleColorPicker(anchor)`, `closeColorPicker()`, `onCustomColorUpdate(value)`, `customSwatchStyle`, `resolveColorButtonKey(color)`, `customSwatchRef`, `customMenuSwatchRef`, `colorPickerWrapRef`.

- [ ] **Step 1: Add custom-color state to the script (after the `colors` array, ~line 131)**

```ts
const CUSTOM_COLOR_KEY = '__custom__'
const RAINBOW_GRADIENT = 'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)'

const customColor = ref<string | null>(null)
const showColorPicker = ref(false)
const colorPickerAnchor = ref<'toolbar' | 'menu' | null>(null)
const customSwatchRef = ref<HTMLButtonElement | null>(null)
const customMenuSwatchRef = ref<HTMLButtonElement | null>(null)
const colorPickerWrapRef = ref<HTMLDivElement | null>(null)

const customSwatchStyle = computed<Record<string, string>>(() => {
  if (!customColor.value) return { backgroundImage: RAINBOW_GRADIENT, backgroundColor: '#ffffff' }
  return colorOverCheckerStyle(customColor.value)
})

function toggleColorPicker(anchor: 'toolbar' | 'menu') {
  if (!hasImage.value) return
  if (showColorPicker.value && colorPickerAnchor.value === anchor) {
    closeColorPicker()
    return
  }
  colorPickerAnchor.value = anchor
  showColorPicker.value = true
}

function closeColorPicker() {
  showColorPicker.value = false
}

function onCustomColorUpdate(value: string) {
  if (!hasImage.value) return
  customColor.value = value
  strokeColor.value = value
  playColorPickEffect()
  updateAllColorIndicators()
}

function resolveColorButtonKey(color: string): string {
  return colors.some(c => c.value === color) ? color : CUSTOM_COLOR_KEY
}
```

(`colorOverCheckerStyle` is auto-imported by Nuxt from `app/utils/`.)

- [ ] **Step 2: Update `updateColorIndicator` to resolve the custom key**

Change line 1244 from:

```ts
    const btn = buttonMap.get(strokeColor.value)
```

to:

```ts
    const btn = buttonMap.get(resolveColorButtonKey(strokeColor.value))
```

- [ ] **Step 3: Close popover on Escape and click-outside**

In `handleKeydown`, change the Escape block (lines 1518–1525) to:

```ts
  if (e.key === 'Escape') {
    if (showPasteDialog.value) {
      cancelPasteDialog()
      return
    }
    if (showColorPicker.value) {
      closeColorPicker()
      return
    }
    closeToolbarMenu()
    return
  }
```

Replace `onDocumentClick` (lines 1494–1499) with:

```ts
function onDocumentClick(e: MouseEvent) {
  const target = e.target as Node
  if (showColorPicker.value) {
    const inside = colorPickerWrapRef.value?.contains(target)
      || customSwatchRef.value?.contains(target)
      || customMenuSwatchRef.value?.contains(target)
    if (!inside) closeColorPicker()
  }
  if (!showToolbarMenu.value) return
  if (toolbarMenuRef.value?.contains(target) || toolbarMenuButtonRef.value?.contains(target)) return
  closeToolbarMenu()
}
```

Change `watch(showToolbarMenu, ...)` (lines 1557–1559) to:

```ts
watch(showToolbarMenu, (open) => {
  if (open) nextTick(updateAllPickerIndicators)
  if (!open && colorPickerAnchor.value === 'menu') closeColorPicker()
})
```

- [ ] **Step 4: Add the rainbow swatch + popover to the desktop color strip**

In the template, inside `<div ref="colorStripRef" class="relative flex gap-2">` (~line 1721), insert this button as the FIRST child after the `.color-indicator` div (before the `v-for` color buttons):

```html
            <button
              :ref="(el) => { registerColorButton(CUSTOM_COLOR_KEY, el); customSwatchRef = (el instanceof HTMLButtonElement) ? el : null }"
              type="button"
              class="relative z-10 w-6 h-6 rounded-full transition-transform hover:scale-110 ring-1 disabled:opacity-30"
              :class="[
                resolveColorButtonKey(strokeColor) !== CUSTOM_COLOR_KEY ? (isDark ? 'ring-white/10 ring-offset-zinc-900' : 'ring-slate-300 ring-offset-white') : 'ring-transparent',
                colorPickAnim && resolveColorButtonKey(strokeColor) === CUSTOM_COLOR_KEY ? 'color-swatch-pop' : '',
              ]"
              :style="customSwatchStyle"
              title="Custom color"
              :disabled="!hasImage"
              @click="toggleColorPicker('toolbar')"
            />
```

Then, still inside the same `colorStripRef` div, after the `v-for` button block, add the popover wrapper:

```html
            <div
              v-if="showColorPicker && colorPickerAnchor === 'toolbar'"
              ref="colorPickerWrapRef"
              class="absolute top-full left-0 mt-2 z-50"
            >
              <ColorPickerPopover
                :model-value="strokeColor"
                :is-dark="isDark"
                @update:model-value="onCustomColorUpdate"
                @close="closeColorPicker"
              />
            </div>
```

- [ ] **Step 5: Verify compile**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Manual check (desktop)**

```bash
npm run dev
```

Paste an image, then verify:
1. Rainbow swatch appears first in the toolbar color strip.
2. Click it → popover opens below; drag in SV area → pen draws in that color; rainbow swatch becomes the picked color; indicator ring tracks the rainbow swatch.
3. Drag alpha slider to ~50% → pen stroke is semi-transparent.
4. Type `#00ff00` in hex field → green; type `#00ff0080` → semi-transparent green.
5. Click a fixed swatch → indicator moves to it; reopen popover → popover shows that color.
6. Escape and click-outside both close the popover; color stays applied.

- [ ] **Step 7: Commit**

```bash
git add app/app.vue
git commit -m "Add rainbow custom-color swatch and picker popover to desktop toolbar"
```

---

### Task 4: Rainbow swatch + popover in mobile overflow menu

**Files:**
- Modify: `app/app.vue` (template: mobile menu color strip, lines 1884–1906)

**Interfaces:**
- Consumes: everything produced by Task 3 (`CUSTOM_COLOR_KEY`, `customSwatchStyle`, `toggleColorPicker`, `resolveColorButtonKey`, `showColorPicker`, `colorPickerAnchor`, `colorPickerWrapRef`, `onCustomColorUpdate`, `closeColorPicker`, `customMenuSwatchRef`).

- [ ] **Step 1: Add the rainbow swatch + popover to the mobile menu color strip**

Inside `<div ref="colorMenuStripRef" class="relative flex flex-wrap gap-2 mt-2">` (~line 1884), insert this button as the FIRST child after the `.color-indicator` div:

```html
              <button
                :ref="(el) => { registerColorButton(CUSTOM_COLOR_KEY, el, true); customMenuSwatchRef = (el instanceof HTMLButtonElement) ? el : null }"
                type="button"
                class="relative z-10 w-7 h-7 rounded-full transition-transform hover:scale-110 ring-1 disabled:opacity-30"
                :class="[
                  resolveColorButtonKey(strokeColor) !== CUSTOM_COLOR_KEY ? (isDark ? 'ring-white/10 ring-offset-zinc-900' : 'ring-slate-300 ring-offset-white') : 'ring-transparent',
                  colorPickAnim && resolveColorButtonKey(strokeColor) === CUSTOM_COLOR_KEY ? 'color-swatch-pop' : '',
                ]"
                :style="customSwatchStyle"
                title="Custom color"
                :disabled="!hasImage"
                @click="toggleColorPicker('menu')"
              />
```

After the `v-for` button block in that same div, add:

```html
              <div
                v-if="showColorPicker && colorPickerAnchor === 'menu'"
                ref="colorPickerWrapRef"
                class="absolute top-full left-0 mt-2 z-50"
              >
                <ColorPickerPopover
                  :model-value="strokeColor"
                  :is-dark="isDark"
                  @update:model-value="onCustomColorUpdate"
                  @close="closeColorPicker"
                />
              </div>
```

- [ ] **Step 2: Verify compile**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual check (mobile menu)**

```bash
npm run dev
```

With a narrow viewport (< 1280px) and an image loaded:
1. Open the overflow menu → rainbow swatch appears first in the Color section.
2. Tap it → popover opens inside the menu; pick a color → it applies; menu stays open.
3. Close the overflow menu → popover closes too.
4. Recent colors row shows previous picks after closing/reopening the popover; survives page reload.

- [ ] **Step 4: Commit**

```bash
git add app/app.vue
git commit -m "Add rainbow custom-color swatch and picker popover to mobile menu"
```

---

### Task 5: Full manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Run the full spec checklist against `npm run dev`**

1. Pick a color via SV area drag → pen stroke draws in that color.
2. Pick via hue/alpha sliders → box with 50% alpha is semi-transparent over the image.
3. Type `#00ff00` in hex field → stroke becomes green; type `#00ff0080` → semi-transparent green.
4. Type R/G/B/A numbers → color updates live; out-of-range values clamp (e.g. 300 → 255, −5 → 0).
5. Pick a custom color → rainbow swatch becomes that color; indicator ring tracks the rainbow swatch.
6. Arrow, box, and text tools all respect the custom color including alpha.
7. Close and reopen popover → recent colors row shows previous picks (up to 5, deduped); survives reload.
8. Popover works from both the desktop toolbar strip and the mobile overflow menu; only one open at a time (open from toolbar, then open from menu — toolbar instance closes).
9. Escape and click-outside close the popover; color stays applied.
10. Copy-to-clipboard PNG export renders transparent strokes correctly.
11. Light and dark mode styling both legible.

- [ ] **Step 2: Fix any issues found, then final commit (if changes were needed)**

```bash
git add -A
git commit -m "Fix issues found in color picker manual verification"
```

---

## Self-Review Notes

- **Spec coverage:** popover component ✓ (Task 2), rainbow swatch + live apply + indicator sentinel + close behaviors ✓ (Tasks 3–4), recents persistence ✓ (Task 2, verified in Tasks 4–5), alpha transparency ✓ (verified Task 5), both toolbar locations ✓ (Tasks 3–4), error handling (invalid hex, clamping, corrupt localStorage) ✓ (Tasks 1–2 code).
- **Deviation from spec:** viewport clamping is simplified to `max-w-[calc(100vw-16px)]` on the popover root instead of computed fixed positioning — both anchor containers are positioned near an edge-safe area and the popover is only 240px wide.
- **Type consistency:** `Hsva`/`Rgba` and all function names match across Tasks 1–4. `CUSTOM_COLOR_KEY` value `'__custom__'` used consistently in registration and resolution.
