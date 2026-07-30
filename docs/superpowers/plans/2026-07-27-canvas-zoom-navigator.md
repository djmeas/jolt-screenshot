# Canvas Zoom + Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Photoshop-style view-only zoom (wheel/buttons/shortcuts), Space-drag pan, and a navigator preview panel to the JoltShot canvas.

**Architecture:** The canvas backing store stays at the image's natural resolution. Zoom scales `canvas.style.width/height`; pan positions the canvas absolutely inside the `overflow-hidden` wrapper. All pointer math already flows through the rect-ratio-based `getCanvasCoords`, so drawing/hit-testing/export are untouched. The navigator is a new `ZoomNavigator.vue` component that reuses the page's `drawAnnotations` via a render prop.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS, HTML5 Canvas.

**Spec:** `docs/superpowers/specs/2026-07-27-canvas-zoom-navigator-design.md`

## Global Constraints

- **No test runner exists in this repo** (no `test` script in `package.json`). Automated verification for every task = `npm run build` exits 0. Manual verification via `npm run dev` happens in Task 7.
- Zoom/pan is **view-only**. Never change annotation coordinates, the canvas backing store (`canvas.width/height`), or export logic.
- `ref` / `computed` / `watch` / `onMounted` / `onBeforeUnmount` are Nuxt auto-imports — no import statements needed.
- Styling follows the existing pattern: Tailwind classes with `:class="[isDark ? '...' : '...']"` ternaries.
- All edits are in `app/pages/index.vue` except Task 6, which creates `app/components/ZoomNavigator.vue`.
- Frequent commits: one commit per task.

---

### Task 1: Zoom state, view math, and canvas positioning

Lays the foundation: zoom refs, `displayScale`/`isZoomed` computeds, `clampView()`, `applyZoomTransform()`, and switches the canvas from flex-centered to absolutely positioned. After this task the app behaves exactly as before (zoom factor 1 = fit), so it is a safe first commit.

**Files:**
- Modify: `app/pages/index.vue:28` (state refs)
- Modify: `app/pages/index.vue:253-265` (replace `updateCanvasDisplaySize`)
- Modify: `app/pages/index.vue:2375` (canvas element class)
- Modify: `app/pages/index.vue:527` (`replaceWithImage` — reset zoom)
- Modify: `app/pages/index.vue:598-610` (`clearAnnotations` — reset zoom + clear styles)
- Modify: `app/pages/index.vue:1282` (`loadSavedProjectIntoCanvas` — reset zoom)

**Interfaces:**
- Consumes: existing `getCanvas()`, `canvasWrapperRef`, `hasImage`.
- Produces (used by all later tasks):
  - `ZOOM_STEP` (const, `1.15`), `ZOOM_MAX_SCALE` (const, `8`)
  - `fitScale: Ref<number>`, `zoomFactor: Ref<number>`, `viewX: Ref<number>`, `viewY: Ref<number>`
  - `spacePanActive: Ref<boolean>`, `isPanning: Ref<boolean>`, `panStart: Ref<{ x: number, y: number, viewX: number, viewY: number } | null>`
  - `displayScale: ComputedRef<number>`, `isZoomed: ComputedRef<boolean>`, `zoomPercent: ComputedRef<number>`
  - `clampView(): void`, `applyZoomTransform(): void`, `resetZoom(): void`
  - `updateCanvasDisplaySize(): void` (now delegates to `applyZoomTransform`)

- [ ] **Step 1: Add zoom/pan state refs**

In `app/pages/index.vue`, immediately after line 28 (`const textFontSize = ref(24)`), insert:

```ts
// Zoom & pan state (view-only; never affects the exported image)
const ZOOM_STEP = 1.15
const ZOOM_MAX_SCALE = 8
const fitScale = ref(1)
const zoomFactor = ref(1)
const viewX = ref(0)
const viewY = ref(0)
const spacePanActive = ref(false)
const isPanning = ref(false)
const panStart = ref<{ x: number, y: number, viewX: number, viewY: number } | null>(null)
```

- [ ] **Step 2: Replace `updateCanvasDisplaySize` with the zoom-aware transform**

Replace the entire existing function (lines 253-265):

```ts
function updateCanvasDisplaySize() {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || canvas.width === 0 || canvas.height === 0) return

  const maxW = wrapper.clientWidth
  const maxH = wrapper.clientHeight
  if (maxW === 0 || maxH === 0) return

  const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1)
  canvas.style.width = `${Math.floor(canvas.width * scale)}px`
  canvas.style.height = `${Math.floor(canvas.height * scale)}px`
}
```

with:

```ts
const displayScale = computed(() => fitScale.value * zoomFactor.value)
const isZoomed = computed(() => zoomFactor.value > 1.001)
const zoomPercent = computed(() => Math.round(displayScale.value * 100))

function clampView() {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || canvas.width === 0 || canvas.height === 0) {
    viewX.value = 0
    viewY.value = 0
    return
  }
  const scale = displayScale.value
  if (scale <= 0) return
  const maxX = canvas.width - wrapper.clientWidth / scale
  const maxY = canvas.height - wrapper.clientHeight / scale
  viewX.value = maxX <= 0 ? 0 : Math.min(Math.max(viewX.value, 0), maxX)
  viewY.value = maxY <= 0 ? 0 : Math.min(Math.max(viewY.value, 0), maxY)
}

function applyZoomTransform() {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || canvas.width === 0 || canvas.height === 0) return

  const maxW = wrapper.clientWidth
  const maxH = wrapper.clientHeight
  if (maxW === 0 || maxH === 0) return

  fitScale.value = Math.min(maxW / canvas.width, maxH / canvas.height, 1)
  clampView()

  const scale = displayScale.value
  const displayW = Math.floor(canvas.width * scale)
  const displayH = Math.floor(canvas.height * scale)
  const baseLeft = displayW < maxW ? (maxW - displayW) / 2 : 0
  const baseTop = displayH < maxH ? (maxH - displayH) / 2 : 0

  canvas.style.width = `${displayW}px`
  canvas.style.height = `${displayH}px`
  canvas.style.left = `${baseLeft - viewX.value * scale}px`
  canvas.style.top = `${baseTop - viewY.value * scale}px`
}

function updateCanvasDisplaySize() {
  applyZoomTransform()
}

function resetZoom() {
  zoomFactor.value = 1
  viewX.value = 0
  viewY.value = 0
  spacePanActive.value = false
  isPanning.value = false
  panStart.value = null
}
```

Note: `fitScale` is a `ref` (not a `computed`) because `wrapper.clientWidth` is not reactive. It is recomputed imperatively on every `applyZoomTransform()` call, which already runs on image load, project load, and wrapper resize via the existing `ResizeObserver`.

- [ ] **Step 3: Make the canvas absolutely positioned**

At `app/pages/index.vue:2375`, change:

```html
          class="block origin-center"
```

to:

```html
          class="absolute block origin-center"
```

The wrapper (`canvasWrapperRef`) is already `relative overflow-hidden`. The flex centering on the wrapper no longer affects the absolutely-positioned canvas; `applyZoomTransform` centers it via `left/top` when it fits.

- [ ] **Step 4: Reset zoom on image load, project load, and clear**

In `replaceWithImage` (line 527), change:

```ts
    resetDrawingState()
    redrawCanvas()
```

to:

```ts
    resetDrawingState()
    resetZoom()
    redrawCanvas()
```

In `loadSavedProjectIntoCanvas` (line 1282), change:

```ts
    baseImage.value = { objectUrl, image: img }
    hasImage.value = true
```

to:

```ts
    baseImage.value = { objectUrl, image: img }
    hasImage.value = true
    resetZoom()
```

In `clearAnnotations` (lines 604-610), change:

```ts
  const canvas = getCanvas()
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
    canvas.style.width = ''
    canvas.style.height = ''
  }
```

to:

```ts
  const canvas = getCanvas()
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
    canvas.style.width = ''
    canvas.style.height = ''
    canvas.style.left = ''
    canvas.style.top = ''
  }
  resetZoom()
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exits 0 with "Build complete!". The app should behave identically to before (image fits to viewport).

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add zoom/pan state and canvas view transform"
```

---

### Task 2: Zoom actions and on-canvas zoom pill

Adds the three zoom primitives and the bottom-left control pill. After this task you can zoom with the buttons.

**Files:**
- Modify: `app/pages/index.vue` (after `resetZoom` from Task 1 — the zoom functions)
- Modify: `app/pages/index.vue` template, inside `canvasWrapperRef` before its closing `</div>` (currently line ~2428, after the contextual hints)

**Interfaces:**
- Consumes: `ZOOM_STEP`, `ZOOM_MAX_SCALE`, `fitScale`, `zoomFactor`, `viewX`, `viewY`, `displayScale`, `zoomPercent`, `clampView`, `applyZoomTransform` (Task 1).
- Produces:
  - `zoomBy(factor: number, anchorClient?: { x: number, y: number }): void`
  - `zoomToFit(): void`
  - `zoomToActual(): void`

- [ ] **Step 1: Add the zoom action functions**

Immediately after the `resetZoom()` function added in Task 1, insert:

```ts
function zoomBy(factor: number, anchorClient?: { x: number, y: number }) {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value) return

  const oldScale = displayScale.value
  const newScale = Math.min(Math.max(oldScale * factor, fitScale.value), ZOOM_MAX_SCALE)
  if (newScale === oldScale) return

  let ax = wrapper.clientWidth / 2
  let ay = wrapper.clientHeight / 2
  if (anchorClient) {
    const rect = wrapper.getBoundingClientRect()
    ax = anchorClient.x - rect.left
    ay = anchorClient.y - rect.top
  }

  const oldDisplayW = canvas.width * oldScale
  const oldDisplayH = canvas.height * oldScale
  const oldBaseLeft = oldDisplayW < wrapper.clientWidth ? (wrapper.clientWidth - oldDisplayW) / 2 : 0
  const oldBaseTop = oldDisplayH < wrapper.clientHeight ? (wrapper.clientHeight - oldDisplayH) / 2 : 0

  const imagePtX = viewX.value + (ax - oldBaseLeft) / oldScale
  const imagePtY = viewY.value + (ay - oldBaseTop) / oldScale

  zoomFactor.value = newScale / fitScale.value

  const newDisplayW = canvas.width * newScale
  const newDisplayH = canvas.height * newScale
  const newBaseLeft = newDisplayW < wrapper.clientWidth ? (wrapper.clientWidth - newDisplayW) / 2 : 0
  const newBaseTop = newDisplayH < wrapper.clientHeight ? (wrapper.clientHeight - newDisplayH) / 2 : 0

  viewX.value = imagePtX - (ax - newBaseLeft) / newScale
  viewY.value = imagePtY - (ay - newBaseTop) / newScale

  applyZoomTransform()
}

function zoomToFit() {
  if (!hasImage.value) return
  zoomFactor.value = 1
  viewX.value = 0
  viewY.value = 0
  applyZoomTransform()
}

function zoomToActual() {
  if (!hasImage.value || displayScale.value <= 0) return
  zoomBy(1 / displayScale.value)
}
```

`zoomToActual` works because `zoomBy` clamps the result to `[fitScale, ZOOM_MAX_SCALE]`, and `1` (actual pixels) always lies in that range since `fitScale ≤ 1 < 8`.

- [ ] **Step 2: Add the zoom pill to the template**

In `app/pages/index.vue`, inside the `canvasWrapperRef` div, immediately after the last contextual hint block (the `toolMode === 'move'` hint `</div>` at line ~2427) and before the wrapper's closing `</div>`, insert:

```html
        <!-- Zoom controls -->
        <div
          v-if="hasImage"
          class="absolute bottom-4 left-4 z-10 flex items-center gap-1 backdrop-blur-sm px-2 py-1 rounded-full shadow-lg border"
          :class="[isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-slate-200']"
        >
          <button
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md text-sm font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Zoom out (⌘-)"
            @click="zoomBy(1 / ZOOM_STEP)"
          >−</button>
          <span
            class="text-xs tabular-nums text-center min-w-[3.5rem] select-none"
            :class="[isDark ? 'text-zinc-400' : 'text-slate-500']"
          >{{ zoomPercent }}%</span>
          <button
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md text-sm font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Zoom in (⌘+)"
            @click="zoomBy(ZOOM_STEP)"
          >+</button>
          <div class="w-px h-4 mx-0.5" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />
          <button
            type="button"
            class="flex items-center justify-center px-2 h-7 rounded-md text-xs font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Fit to window (⌘0)"
            @click="zoomToFit"
          >Fit</button>
          <button
            type="button"
            class="flex items-center justify-center px-2 h-7 rounded-md text-xs font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Actual size (⌘1)"
            @click="zoomToActual"
          >1:1</button>
        </div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0 with "Build complete!".

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add zoom actions and on-canvas zoom pill"
```

---

### Task 3: Ctrl/Cmd + wheel zoom toward cursor

Trackpad pinch fires wheel events with `ctrlKey` set, so this also enables pinch for free.

**Files:**
- Modify: `app/pages/index.vue` (wheel handler function + `onMounted`/`onUnmounted`)

**Interfaces:**
- Consumes: `zoomBy` (Task 2), `hasImage`, `canvasWrapperRef`.
- Produces: `onCanvasWheel(e: WheelEvent): void`.

- [ ] **Step 1: Add the wheel handler**

Immediately after the `zoomToActual()` function from Task 2, insert:

```ts
function onCanvasWheel(e: WheelEvent) {
  if (!hasImage.value) return
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  zoomBy(ZOOM_STEP ** -Math.sign(e.deltaY), { x: e.clientX, y: e.clientY })
}
```

- [ ] **Step 2: Register the listener (non-passive so `preventDefault` works)**

In `onMounted` (`app/pages/index.vue:1803-1817`), after the line `window.addEventListener('resize', updateAllPickerIndicators)`, insert:

```ts
  canvasWrapperRef.value?.addEventListener('wheel', onCanvasWheel, { passive: false })
```

In `onUnmounted` (`app/pages/index.vue:1835-1847`), after the line `window.removeEventListener('resize', updateAllPickerIndicators)`, insert:

```ts
  canvasWrapperRef.value?.removeEventListener('wheel', onCanvasWheel)
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0 with "Build complete!".

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add ctrl/cmd+wheel zoom toward cursor"
```

---

### Task 4: Keyboard zoom shortcuts

Cmd/Ctrl `+`/`−`/`0`/`1`, with browser zoom suppressed. The existing `isEditableTarget` guard at the top of `handleKeydown` already makes these inert while typing in the text textarea.

**Files:**
- Modify: `app/pages/index.vue:1770-1799` (`handleKeydown`)

**Interfaces:**
- Consumes: `zoomBy`, `zoomToFit`, `zoomToActual` (Task 2), `ZOOM_STEP` (Task 1), `hasImage`.
- Produces: nothing new (modifies `handleKeydown` only).

- [ ] **Step 1: Extend `handleKeydown`**

In `handleKeydown`, immediately after the Cmd/Ctrl+Z undo block:

```ts
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault()
    undo()
    return
  }
```

insert:

```ts
  if ((e.metaKey || e.ctrlKey) && hasImage.value) {
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      zoomBy(ZOOM_STEP)
      return
    }
    if (e.key === '-') {
      e.preventDefault()
      zoomBy(1 / ZOOM_STEP)
      return
    }
    if (e.key === '0') {
      e.preventDefault()
      zoomToFit()
      return
    }
    if (e.key === '1') {
      e.preventDefault()
      zoomToActual()
      return
    }
  }
```

This must appear before the existing `if (e.metaKey || e.ctrlKey || e.altKey) return` line.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0 with "Build complete!".

- [ ] **Step 3: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add cmd/ctrl zoom keyboard shortcuts"
```

---

### Task 5: Space-drag pan

Hold Space (only when zoomed) → grab cursor → drag pans. Drawing handlers bail out while Space is held so no annotation is created. Click placement (emoji/text) is also suppressed.

**Files:**
- Modify: `app/pages/index.vue:1770-1799` (`handleKeydown` — Space branch)
- Modify: `app/pages/index.vue` (new `handleKeyup` function + listener registration)
- Modify: `app/pages/index.vue:627` (`startDrawing` — pan branch)
- Modify: `app/pages/index.vue:698` (`draw` — pan branch)
- Modify: `app/pages/index.vue:742` (`stopDrawing` — pan branch)
- Modify: `app/pages/index.vue:816` (`onCanvasClick` — suppress while panning)
- Modify: `app/pages/index.vue:1720-1730` (`canvasCursorClass`)

**Interfaces:**
- Consumes: `spacePanActive`, `isPanning`, `panStart`, `viewX`, `viewY`, `displayScale`, `isZoomed`, `applyZoomTransform` (Task 1), `hasImage`.
- Produces: `handleKeyup(e: KeyboardEvent): void`.

- [ ] **Step 1: Add Space keydown handling**

In `handleKeydown`, immediately after the existing `if (e.metaKey || e.ctrlKey || e.altKey) return` line, insert:

```ts
  if (e.key === ' ' && hasImage.value && isZoomed.value && !spacePanActive.value) {
    e.preventDefault()
    spacePanActive.value = true
    return
  }
```

Placing it after the modifier pass-through means Cmd/Ctrl+Space (e.g. Spotlight) never triggers panning. The `!spacePanActive.value` guard absorbs key-repeat while Space is held. The existing `isEditableTarget` guard at the top of the function keeps Space typing normally inside the textarea.

- [ ] **Step 2: Add `handleKeyup` and register it**

Immediately after the `handleKeydown` function's closing brace, insert:

```ts
function handleKeyup(e: KeyboardEvent) {
  if (e.key === ' ') {
    spacePanActive.value = false
    isPanning.value = false
    panStart.value = null
  }
}
```

In `onMounted`, after `window.addEventListener('keydown', handleKeydown)`, insert:

```ts
  window.addEventListener('keyup', handleKeyup)
```

In `onUnmounted`, after `window.removeEventListener('keydown', handleKeydown)`, insert:

```ts
  window.removeEventListener('keyup', handleKeyup)
```

- [ ] **Step 3: Add the pan branch to `startDrawing`**

At the top of `startDrawing` (line 627), change:

```ts
function startDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return
  const { x, y } = getCanvasCoords(e)
```

to:

```ts
function startDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return

  if (spacePanActive.value) {
    const pt = 'touches' in e ? e.touches[0] : e
    panStart.value = { x: pt.clientX, y: pt.clientY, viewX: viewX.value, viewY: viewY.value }
    isPanning.value = true
    return
  }

  const { x, y } = getCanvasCoords(e)
```

- [ ] **Step 4: Add the pan branch to `draw`**

At the top of `draw` (line 698), change:

```ts
function draw(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return
  const { x, y } = getCanvasCoords(e)
```

to:

```ts
function draw(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return

  if (isPanning.value && panStart.value) {
    const pt = 'touches' in e ? e.touches[0] : e
    viewX.value = panStart.value.viewX - (pt.clientX - panStart.value.x) / displayScale.value
    viewY.value = panStart.value.viewY - (pt.clientY - panStart.value.y) / displayScale.value
    applyZoomTransform()
    return
  }

  const { x, y } = getCanvasCoords(e)
```

(`applyZoomTransform` already calls `clampView` internally.)

- [ ] **Step 5: Add the pan branch to `stopDrawing`**

At the top of `stopDrawing` (line 742), change:

```ts
function stopDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
```

to:

```ts
function stopDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (isPanning.value) {
    isPanning.value = false
    panStart.value = null
    return
  }
```

- [ ] **Step 6: Suppress click-placement while Space is held**

At the top of `onCanvasClick` (line 816), change:

```ts
function onCanvasClick(e: MouseEvent) {
  if (!hasImage.value) return
  if (toolMode.value === 'move') return
```

to:

```ts
function onCanvasClick(e: MouseEvent) {
  if (!hasImage.value) return
  if (spacePanActive.value) return
  if (toolMode.value === 'move') return
```

- [ ] **Step 7: Grab/grabbing cursor**

Replace `canvasCursorClass` (lines 1720-1730):

```ts
const canvasCursorClass = computed(() => {
  const cursors: Record<typeof toolMode.value, string> = {
    pen: 'cursor-crosshair',
    arrow: 'cursor-crosshair',
    box: 'cursor-crosshair',
    emoji: 'cursor-cell',
    text: 'cursor-text',
    move: 'cursor-grab active:cursor-grabbing',
  }
  return cursors[toolMode.value]
})
```

with:

```ts
const canvasCursorClass = computed(() => {
  if (isPanning.value) return 'cursor-grabbing'
  if (spacePanActive.value) return 'cursor-grab'
  const cursors: Record<typeof toolMode.value, string> = {
    pen: 'cursor-crosshair',
    arrow: 'cursor-crosshair',
    box: 'cursor-crosshair',
    emoji: 'cursor-cell',
    text: 'cursor-text',
    move: 'cursor-grab active:cursor-grabbing',
  }
  return cursors[toolMode.value]
})
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: exits 0 with "Build complete!".

- [ ] **Step 9: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add space-drag panning when zoomed"
```

---

### Task 6: Navigator panel (`ZoomNavigator.vue`)

A ~180px thumbnail in the bottom-right corner, visible only when zoomed, showing the whole image plus annotations and a viewport rectangle. Dragging or clicking pans the main view.

**Files:**
- Create: `app/components/ZoomNavigator.vue`
- Modify: `app/pages/index.vue` (`navigatorViewport` computed, `drawNavigatorThumbnail`, `onNavigatorPan`, template usage)

**Interfaces:**
- Consumes (from `index.vue`, Tasks 1-2): `baseImage`, `annotations`, `isDark`, `isZoomed`, `viewX`, `viewY`, `displayScale`, `applyZoomTransform`, `drawAnnotations(ctx)`, `getCanvas`, `canvasWrapperRef`.
- Produces:
  - Component `<ZoomNavigator>` (Nuxt auto-imported) with props:
    - `image: HTMLImageElement`
    - `annotations: Annotation[]` (used only as a redraw signal via deep watch)
    - `isDark: boolean`
    - `viewport: { x: number, y: number, w: number, h: number }` (image-pixel coords)
    - `drawThumbnail: (ctx: CanvasRenderingContext2D, scale: number) => void`
  - Emits: `pan(imageX: number, imageY: number)`
  - In `index.vue`: `navigatorViewport` computed, `drawNavigatorThumbnail(ctx, scale)`, `onNavigatorPan(imageX, imageY)`.

- [ ] **Step 1: Create the component**

Create `app/components/ZoomNavigator.vue` with this exact content:

```vue
<script setup lang="ts">
const props = defineProps<{
  image: HTMLImageElement
  annotations: unknown[]
  isDark: boolean
  viewport: { x: number, y: number, w: number, h: number }
  drawThumbnail: (ctx: CanvasRenderingContext2D, scale: number) => void
}>()

const emit = defineEmits<{
  pan: [imageX: number, imageY: number]
}>()

const NAV_MAX = 180
const navRef = ref<HTMLCanvasElement | null>(null)

const navScale = computed(() =>
  Math.min(NAV_MAX / props.image.naturalWidth, NAV_MAX / props.image.naturalHeight)
)
const navW = computed(() => Math.max(1, Math.round(props.image.naturalWidth * navScale.value)))
const navH = computed(() => Math.max(1, Math.round(props.image.naturalHeight * navScale.value)))

let raf = 0

function render() {
  const canvas = navRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, navW.value, navH.value)
  ctx.save()
  ctx.scale(navScale.value, navScale.value)
  props.drawThumbnail(ctx, navScale.value)
  ctx.restore()

  const rx = props.viewport.x * navScale.value
  const ry = props.viewport.y * navScale.value
  const rw = props.viewport.w * navScale.value
  const rh = props.viewport.h * navScale.value
  ctx.fillStyle = 'rgba(99, 102, 241, 0.15)'
  ctx.fillRect(rx, ry, rw, rh)
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 1.5
  ctx.strokeRect(rx, ry, rw, rh)
}

function scheduleRender() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    render()
  })
}

watch(
  () => [props.viewport.x, props.viewport.y, props.viewport.w, props.viewport.h],
  scheduleRender
)
watch(() => props.annotations, scheduleRender, { deep: true })
watch(() => props.isDark, scheduleRender)

onMounted(render)
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

let dragging = false

function toImageCoords(e: PointerEvent) {
  const canvas = navRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * props.image.naturalWidth,
    y: ((e.clientY - rect.top) / rect.height) * props.image.naturalHeight,
  }
}

function onPointerDown(e: PointerEvent) {
  dragging = true
  navRef.value?.setPointerCapture(e.pointerId)
  const p = toImageCoords(e)
  emit('pan', p.x, p.y)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const p = toImageCoords(e)
  emit('pan', p.x, p.y)
}

function onPointerUp(e: PointerEvent) {
  dragging = false
  navRef.value?.releasePointerCapture(e.pointerId)
}
</script>

<template>
  <div
    class="absolute bottom-4 right-4 z-10 rounded-lg shadow-lg border overflow-hidden backdrop-blur-sm"
    :class="[isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-slate-200']"
  >
    <canvas
      ref="navRef"
      :width="navW"
      :height="navH"
      class="block cursor-crosshair"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>
```

- [ ] **Step 2: Add the parent-side wiring in `index.vue`**

Immediately after the `zoomToActual()` function (Task 2), insert:

```ts
const navigatorViewport = computed(() => {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || displayScale.value <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  return {
    x: viewX.value,
    y: viewY.value,
    w: wrapper.clientWidth / displayScale.value,
    h: wrapper.clientHeight / displayScale.value,
  }
})

function drawNavigatorThumbnail(ctx: CanvasRenderingContext2D, _scale: number) {
  const base = baseImage.value
  const canvas = getCanvas()
  if (!base || !canvas) return
  ctx.drawImage(base.image, 0, 0, canvas.width, canvas.height)
  drawAnnotations(ctx)
}

function onNavigatorPan(imageX: number, imageY: number) {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || displayScale.value <= 0) return
  viewX.value = imageX - wrapper.clientWidth / displayScale.value / 2
  viewY.value = imageY - wrapper.clientHeight / displayScale.value / 2
  applyZoomTransform()
}
```

Note: the child scales the ctx by `navScale` before calling `drawThumbnail`, so the parent draws in natural image coordinates (same as `redrawCanvas`). The `_scale` parameter is part of the spec'd prop signature; it is intentionally unused.

- [ ] **Step 3: Render the navigator in the template**

In `app/pages/index.vue`, immediately after the zoom controls pill added in Task 2 (before the `canvasWrapperRef` closing `</div>`), insert:

```html
        <!-- Navigator (zoomed-in overview) -->
        <ZoomNavigator
          v-if="isZoomed && baseImage"
          :image="baseImage.image"
          :annotations="annotations"
          :is-dark="isDark"
          :viewport="navigatorViewport"
          :draw-thumbnail="drawNavigatorThumbnail"
          @pan="onNavigatorPan"
        />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exits 0 with "Build complete!".

- [ ] **Step 5: Commit**

```bash
git add app/components/ZoomNavigator.vue app/pages/index.vue
git commit -m "Add zoom navigator panel with drag-to-pan"
```

---

### Task 7: Full manual verification

Runs the spec's verification checklist against the dev server. The executor starts the server; the user performs the interactive checks (or the executor drives them if a browser automation tool is available).

**Files:**
- None (verification only).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts at `http://localhost:3000`.

- [ ] **Step 2: Run the spec verification checklist**

Verify each item from `docs/superpowers/specs/2026-07-27-canvas-zoom-navigator-design.md`:

1. Load an image wider than the viewport. Ctrl+wheel up → canvas zooms in centered on the cursor; the point under the cursor stays under the cursor.
2. Zoom to the 800% cap → further zoom-in is a no-op. Zoom out past fit → stops at fit; navigator disappears.
3. While zoomed, hold Space → grab cursor; drag pans; release Space → cursor returns to tool cursor. Drawing tools do not draw while Space is held.
4. `−`/`+`/`Fit`/`1:1` pill buttons and Cmd/Ctrl `+`/`−`/`0`/`1` all change zoom as labeled; browser zoom is suppressed.
5. Navigator appears only when zoomed; rectangle matches the visible region; dragging the rectangle (or clicking elsewhere in the thumbnail) pans the main view.
6. Draw a pen stroke and place text while zoomed — annotations land where the pointer is. Text textarea appears at the clicked point.
7. Resize the window while zoomed — view stays clamped and sane.
8. Copy-to-Clipboard at 400% zoom → pasted result is the full image at natural resolution, not the zoomed crop.
9. Load a new image / Clear → zoom resets to fit.
10. Type in the text textarea — Space inserts a space, shortcuts don't fire.
11. No regression to: tool/color/stroke indicator animations, slam animation on paste, emoji popover, Saves drawer, theme toggle, compact menu below `xl`.

- [ ] **Step 3: Fix any failures found**

Any failure goes back through the relevant task's code. Do not commit fixes without re-running `npm run build`.

- [ ] **Step 4: Stop the dev server**

Ctrl+C the `npm run dev` process.

---

## Self-Review Notes

- **Spec coverage:** state model (Task 1), wheel (Task 3), pill (Task 2), shortcuts (Task 4), Space-pan (Task 5), navigator (Task 6), lifecycle resets (Task 1 Step 4), resize clamping (Task 1 `applyZoomTransform` via existing `ResizeObserver`), export-unaffected (no export code touched; verified in Task 7 item 8). All spec sections map to a task.
- **Type consistency:** `zoomBy(factor, anchorClient?)` is used identically in Tasks 2, 3, 4. `applyZoomTransform`, `clampView`, `resetZoom`, `displayScale`, `viewX/viewY` names are consistent across all tasks. Navigator prop/emit names (`image`, `annotations`, `isDark`, `viewport`, `drawThumbnail`, `pan`) match between the component definition (Task 6 Step 1) and the parent usage (Task 6 Steps 2-3).
- **No placeholders:** every code step contains complete code; every command includes expected output.
