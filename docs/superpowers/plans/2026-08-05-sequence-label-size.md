# Sequence Label Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sequence Number label size derived from a global per-project setting — Auto (ratio of the canvas height, `clamp(height × 0.03, 14, 28)`) by default, with an always-visible draggable pixel slider (8–64px) on Row 2 of the top nav that resizes all labels live.

**Architecture:** Remove `radius` from the `SequenceAnnotation` type (same "derived, never stored" pattern as the numbering). A pure util (`app/utils/sequence.ts`) resolves the global setting (`number | 'auto'`) against the canvas height; rendering, hit-testing, and the slider readout all call the same resolver. The setting persists via the existing `SavedSettings` and restores on load.

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>` SFC), Vitest + happy-dom, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind.

## Global Constraints

- `app/utils/` is auto-imported into the SFC (and its templates); new exports become available after `npx nuxt prepare` regenerates `.nuxt/imports.d.ts`.
- Tests import utils explicitly from `~/utils/...` (alias `~` → `app/`).
- `noUncheckedIndexedAccess: true` — use `!` after indexed reads.
- Exact constants: auto ratio `0.03`, auto floor `14`, auto cap `28`, slider range `8–64`.
- The sequence label style stays white circle + black number; `strokeColor`/`strokeWidth` never affect it.
- `radius` is NEVER stored on a sequence annotation after this plan; old saved annotations' `radius` field is ignored.
- VERIFICATION GATE: `npm run typecheck` is broken at baseline in this repo (~198 pre-existing vue-tsc errors: Nuxt globals unresolved). DO NOT run it. The compile gate is `npm run build` (must succeed) + `npm run lint` (clean) + `npm run test` (27/27 before this work; grows as tasks add tests).

---

### Task 1: Size-resolution utility + unit tests (TDD)

**Files:**
- Modify: `app/utils/sequence.ts` (append two functions)
- Test: `tests/unit/sequence.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing (append-only).
- Produces:
  - `autoSequenceRadius(canvasHeight: number): number` — `Math.min(28, Math.max(14, canvasHeight * 0.03))`
  - `resolveSequenceRadius(size: number | 'auto', canvasHeight: number): number` — delegates to `autoSequenceRadius` for `'auto'`, otherwise clamps to `[8, 64]`
  Later tasks use both (auto-imported in the SFC) and rely on these exact signatures.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/sequence.test.ts` (after the existing `describe` block, keeping the existing imports and `seq()` helper):

```ts
describe('sequence label size', () => {
  it('autoSequenceRadius scales at 3% of the canvas height', () => {
    expect(autoSequenceRadius(500)).toBe(15)
  })

  it('autoSequenceRadius clamps to the 14px floor on small images', () => {
    expect(autoSequenceRadius(100)).toBe(14)
  })

  it('autoSequenceRadius caps at 28px on large images', () => {
    expect(autoSequenceRadius(4000)).toBe(28)
  })

  it('resolveSequenceRadius with "auto" delegates to the auto formula', () => {
    expect(resolveSequenceRadius('auto', 500)).toBe(15)
  })

  it('resolveSequenceRadius clamps explicit numbers to [8, 64]', () => {
    expect(resolveSequenceRadius(5, 500)).toBe(8)
    expect(resolveSequenceRadius(99, 500)).toBe(64)
  })

  it('resolveSequenceRadius passes through in-range numbers unchanged', () => {
    expect(resolveSequenceRadius(20, 500)).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/sequence.test.ts`
Expected: FAIL — `autoSequenceRadius is not defined` / `resolveSequenceRadius is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `app/utils/sequence.ts` (constants live here, where they are consumed — declaring them in the SFC would trip the eslint no-unused-vars gate; behavior is identical to the spec's values):

```ts
const SEQ_AUTO_RATIO = 0.03
const SEQ_AUTO_MIN = 14
const SEQ_AUTO_MAX = 28
const SEQ_SIZE_MIN = 8
const SEQ_SIZE_MAX = 64

export function autoSequenceRadius(canvasHeight: number): number {
  return Math.min(SEQ_AUTO_MAX, Math.max(SEQ_AUTO_MIN, canvasHeight * SEQ_AUTO_RATIO))
}

export function resolveSequenceRadius(size: number | 'auto', canvasHeight: number): number {
  if (size === 'auto') return autoSequenceRadius(canvasHeight)
  return Math.min(SEQ_SIZE_MAX, Math.max(SEQ_SIZE_MIN, size))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/sequence.test.ts`
Expected: PASS (12 tests — 6 numbering + 6 size).

- [ ] **Step 5: Regenerate Nuxt auto-import types**

Run: `npx nuxt prepare`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/utils/sequence.ts tests/unit/sequence.test.ts
git commit -m "feat: add sequence label size resolution utilities"
```

---

### Task 2: Derived radius in the SFC (state, type, render, hit-test, placement)

**Files:**
- Modify: `app/pages/index.vue` —
  - `const SEQ_RADIUS = 28` at `index.vue:170` and `SequenceAnnotation` at `index.vue:171`
  - `drawAnnotations` sequence branch at `index.vue:630-643`
  - `onCanvasClick` placement at `index.vue:1400-1407`
  - `hitTestSequence` at `index.vue:1552-1554`

**Interfaces:**
- Consumes: `autoSequenceRadius`, `resolveSequenceRadius` (auto-imported from Task 1).
- Produces: `sequenceLabelSize` ref (`number | 'auto'`, initial `'auto'`) and `getEffectiveSequenceRadius(): number` — later tasks (Row-2 slider, mobile menu, save/load) consume both.

- [ ] **Step 1: Replace the radius constant with the size setting + resolver**

At `app/pages/index.vue:170`, replace:

```ts
const SEQ_RADIUS = 28
type SequenceAnnotation = { type: 'sequence', x: number, y: number, radius: number }
```

with:

```ts
const sequenceLabelSize = ref<number | 'auto'>('auto')
type SequenceAnnotation = { type: 'sequence', x: number, y: number }
```

(`getCanvas` is declared later in the file; function declarations are hoisted, so this is safe. `resolveSequenceRadius` is auto-imported — if the build reports it unresolved, re-run `npx nuxt prepare`.)

Immediately after that block, add:

```ts
function getEffectiveSequenceRadius(): number {
  return resolveSequenceRadius(sequenceLabelSize.value, getCanvas()?.height ?? 0)
}
```

- [ ] **Step 2: Render with the derived radius**

In `drawAnnotations` (`app/pages/index.vue:630`), replace the sequence branch:

```ts
    } else if (ann.type === 'sequence') {
      const number = sequenceNumbers.get(i) ?? 0
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(ann.x, ann.y, ann.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = `bold ${Math.round(ann.radius)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000000'
      ctx.fillText(String(number), ann.x, ann.y)
    }
```

with:

```ts
    } else if (ann.type === 'sequence') {
      const number = sequenceNumbers.get(i) ?? 0
      const radius = getEffectiveSequenceRadius()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(ann.x, ann.y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = `bold ${Math.round(radius)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000000'
      ctx.fillText(String(number), ann.x, ann.y)
    }
```

- [ ] **Step 3: Drop radius from placement**

In `onCanvasClick` (`app/pages/index.vue:1400`), replace:

```ts
  if (toolMode.value === 'sequence') {
    pushAnnotationState()
    annotations.value = [...annotations.value, {
      type: 'sequence',
      x, y,
      radius: SEQ_RADIUS,
    }]
    redrawCanvas()
    return
  }
```

with:

```ts
  if (toolMode.value === 'sequence') {
    pushAnnotationState()
    annotations.value = [...annotations.value, {
      type: 'sequence',
      x, y,
    }]
    redrawCanvas()
    return
  }
```

- [ ] **Step 4: Hit-test with the derived radius**

At `app/pages/index.vue:1552`, replace:

```ts
function hitTestSequence(seq: SequenceAnnotation, x: number, y: number): boolean {
  return Math.hypot(x - seq.x, y - seq.y) <= seq.radius
}
```

with:

```ts
function hitTestSequence(seq: SequenceAnnotation, x: number, y: number): boolean {
  return Math.hypot(x - seq.x, y - seq.y) <= getEffectiveSequenceRadius()
}
```

- [ ] **Step 5: Verify**

Run: `npm run build` — MUST succeed.
Run: `npm run lint` — MUST be clean.
Run: `npm run test` — MUST stay green (27/27).

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: derive sequence label radius from global setting"
```

---

### Task 3: Persist the setting (save, restore, autosave)

**Files:**
- Modify: `app/composables/useProjectStorage.ts` — `SavedSettings` at `useProjectStorage.ts:43-48`
- Modify: `app/pages/index.vue` —
  - `buildSavedSettings` at `index.vue:1840-1847`
  - restore block around `index.vue:1979-1982`
  - autosave watch at `index.vue:2609-2610`

**Interfaces:**
- Consumes: `sequenceLabelSize` ref from Task 2.
- Produces: `sequenceLabelSize?: number | 'auto'` on `SavedSettings`; save/restore wiring. No later task depends on this beyond the UI.

- [ ] **Step 1: Extend the settings type**

At `app/composables/useProjectStorage.ts:43-48`, change:

```ts
export type SavedSettings = {
  strokeColor: string
  strokeWidth: number
  textFontSize: number
  emojiSize: number
}
```

to:

```ts
export type SavedSettings = {
  strokeColor: string
  strokeWidth: number
  textFontSize: number
  emojiSize: number
  sequenceLabelSize?: number | 'auto'
}
```

- [ ] **Step 2: Save the setting**

At `app/pages/index.vue:1840-1847`, change:

```ts
function buildSavedSettings(): SavedSettings {
  return {
    strokeColor: strokeColor.value,
    strokeWidth: strokeWidth.value,
    textFontSize: textFontSize.value,
    emojiSize: emojiSize.value,
  }
}
```

to:

```ts
function buildSavedSettings(): SavedSettings {
  return {
    strokeColor: strokeColor.value,
    strokeWidth: strokeWidth.value,
    textFontSize: textFontSize.value,
    emojiSize: emojiSize.value,
    sequenceLabelSize: sequenceLabelSize.value,
  }
}
```

- [ ] **Step 3: Restore the setting**

At `app/pages/index.vue`, in the project-restore block, change:

```ts
    textFontSize.value = saved.settings.textFontSize
    emojiSize.value = saved.settings.emojiSize
```

to:

```ts
    textFontSize.value = saved.settings.textFontSize
    emojiSize.value = saved.settings.emojiSize
    sequenceLabelSize.value = saved.settings.sequenceLabelSize ?? 'auto'
```

- [ ] **Step 4: Autosave on slider change**

At `app/pages/index.vue:2609-2610`, change:

```ts
watch([textFontSize, emojiSize], () => {
  scheduleAutoSave()
})
```

to:

```ts
watch([textFontSize, emojiSize, sequenceLabelSize], () => {
  scheduleAutoSave()
})
```

- [ ] **Step 5: Verify**

Run: `npm run build` — MUST succeed.
Run: `npm run lint` — MUST be clean.
Run: `npm run test` — MUST stay green (27/27).

- [ ] **Step 6: Commit**

```bash
git add app/composables/useProjectStorage.ts app/pages/index.vue
git commit -m "feat: persist sequence label size setting with project"
```

---

### Task 4: Row-2 desktop control (Auto button + pixel slider)

**Files:**
- Modify: `app/pages/index.vue` — Row 2 template, insert between the Stroke section (ends `index.vue:2975`) and the Text-font-size template (starts `index.vue:2977`)

**Interfaces:**
- Consumes: `sequenceLabelSize`, `getEffectiveSequenceRadius()` (Task 2), `hasImage` (existing), `isDark` (existing).

- [ ] **Step 1: Add the control**

Insert the following block between the Stroke section's closing `</div>` (`index.vue:2975`) and the `<!-- Text font size (desktop, text tool only) -->` comment (`index.vue:2977`):

```html
        <!-- Sequence label size (desktop) -->
        <div class="hidden xl:block w-px h-5 mx-1.5 shrink-0" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />
        <div class="hidden xl:flex items-center gap-2 shrink-0">
          <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Seq size</span>
          <button
            type="button"
            class="px-2 py-1 rounded-md text-xs font-medium transition-colors"
            :class="sequenceLabelSize === 'auto'
              ? (isDark ? 'bg-zinc-700 text-zinc-100' : 'bg-slate-200 text-slate-800')
              : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100')"
            :disabled="!hasImage"
            @click="sequenceLabelSize = 'auto'"
          >Auto</button>
          <input
            type="range"
            min="8"
            max="64"
            :value="sequenceLabelSize === 'auto' ? getEffectiveSequenceRadius() : sequenceLabelSize"
            class="w-20 h-1.5 accent-indigo-500"
            :disabled="!hasImage"
            @input="sequenceLabelSize = Number(($event.target as HTMLInputElement).value)"
          />
          <span class="text-xs tabular-nums" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ Math.round(getEffectiveSequenceRadius()) }}px</span>
        </div>
```

Behavior notes: in Auto mode the slider sits at the computed auto value and the Auto button is highlighted; dragging the slider assigns a pixel value (switching out of Auto); clicking Auto returns to the ratio formula; `getEffectiveSequenceRadius()` is called directly in the template so it re-evaluates fresh on every re-render (fires when `hasImage`/`sequenceLabelSize` change).

- [ ] **Step 2: Verify**

Run: `npm run build` — MUST succeed (validates the template compiles).
Run: `npm run lint` — MUST be clean.
Run: `npm run test` — MUST stay green (27/27).

- [ ] **Step 3: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: add sequence label size control to row 2"
```

---

### Task 5: Mobile overflow-menu control

**Files:**
- Modify: `app/pages/index.vue` — overflow menu (`showToolbarMenu` panel), insert after the Stroke section's closing `</div>` (`index.vue:3167`) and before the `<div v-if="toolMode === 'text'">` text-size block (`index.vue:3169`)

**Interfaces:**
- Consumes: `sequenceLabelSize`, `getEffectiveSequenceRadius()` (Task 2), `hasImage`, `isDark` (existing).

- [ ] **Step 1: Add the control**

Insert the following block between the Stroke section's closing `</div>` (`index.vue:3167`) and the `Text size` block (`index.vue:3169`):

```html
          <div>
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Seq size</span>
            <div class="flex items-center gap-2 mt-2">
              <button
                type="button"
                class="px-2 py-1 rounded-md text-xs font-medium transition-colors"
                :class="sequenceLabelSize === 'auto'
                  ? (isDark ? 'bg-zinc-700 text-zinc-100' : 'bg-slate-200 text-slate-800')
                  : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100')"
                :disabled="!hasImage"
                @click="sequenceLabelSize = 'auto'"
              >Auto</button>
              <input
                type="range"
                min="8"
                max="64"
                :value="sequenceLabelSize === 'auto' ? getEffectiveSequenceRadius() : sequenceLabelSize"
                class="flex-1 h-1.5 accent-indigo-500"
                :disabled="!hasImage"
                @input="sequenceLabelSize = Number(($event.target as HTMLInputElement).value)"
              />
              <span class="text-xs tabular-nums w-10 text-right" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ Math.round(getEffectiveSequenceRadius()) }}px</span>
            </div>
          </div>
```

- [ ] **Step 2: Verify**

Run: `npm run build` — MUST succeed.
Run: `npm run lint` — MUST be clean.
Run: `npm run test` — MUST stay green (27/27).

- [ ] **Step 3: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: add sequence label size control to overflow menu"
```

---

## Self-Review Notes

- **Spec coverage:** derived radius + resolver (Task 2), Auto ratio formula + tests (Task 1), Row-2 always-visible slider + Auto button (Task 4), mobile menu mirror (Task 5), persistence/restore/autosave (Task 3), old-save compatibility (`?? 'auto'` in Task 3), old `radius` field ignored (Task 2 type change).
- **Type consistency:** `sequenceLabelSize: number | 'auto'`, `getEffectiveSequenceRadius()`, `autoSequenceRadius(canvasHeight: number)`, `resolveSequenceRadius(size: number | 'auto', canvasHeight: number)` named identically across all tasks.
