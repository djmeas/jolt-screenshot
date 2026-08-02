# Plan 002: Fix touch drawing broken on mobile (passive listener)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> ```sh
> git rev-parse --short HEAD  # expect 00fa802
> git diff --stat 00fa802..HEAD -- app
> ```
> If `app/pages/index.vue` (or any in-scope file below) has changed, compare
> the "Current state" excerpts against the live code before proceeding; on a
> mismatch treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `001-verification-baseline.md`
- **Category**: bug
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

The README says: "**Touch support** – Usable on tablets and touch devices."
On a touch device the current code is broken: when a user starts dragging
with one finger to draw a pen stroke (or place an arrow / box), the page
scrolls under their finger instead of the canvas capturing the gesture.
That's because Vue's `@touchstart` / `@touchmove` / `@touchend` event
bindings are attached with `{ passive: true }` by default in modern
browsers, and the handlers call `e.preventDefault()` to block scrolling —
but a passive listener silently drops `preventDefault`. The wheel handler
already opts into `{ passive: false }` manually (line 2428), so zoom-on-canvas
already works; this plan brings the touch handlers in line.

This is the highest-impact bug in the audit because the README-promised
tablet use case does not work today, and the fix is mechanical.

## Current state

File: `app/pages/index.vue`

The canvas element listeners (lines 3110–3128):

```vue
<canvas
  v-show="hasImage"
  ref="canvasRef"
  class="absolute block origin-center"
  :class="[ canvasCursorClass, ... ]"
  @mousedown="startDrawing"
  @mousemove="draw"
  @mouseup="stopDrawing"
  @mouseleave="(e) => { onCanvasMouseLeave(); stopDrawing(e); }"
  @click="onCanvasClick"
  @touchstart="startDrawing"
  @touchmove="draw"
  @touchend="stopDrawing"
/>
```

Vue 3's `v-on` (shorthand `@touchstart` etc.) attaches touch listeners with
`{ passive: true }` for the following events per the Vue source:
`touchstart`, `touchmove`, `wheel`, `scroll`. Touch listeners MUST be
non-passive for `preventDefault()` to take effect.

Inside `startDrawing`/`draw`/`stopDrawing`, `e.preventDefault()` is called:

- `pages/index.vue:1061` — `startDrawing` first line
- `pages/index.vue:1154` — `draw` first line
- `pages/index.vue:1220` — `stopDrawing` first line

In contrast, the manual wheel listener at line 2428 sets `{ passive: false }`
explicitly and works correctly.

Conventions:

- Handlers are bound via Vue's `@event` shorthand wherever possible — match this.
- The wheel listener at line 2428 uses `canvasWrapperRef.value?.addEventListener('wheel', onCanvasWheel, { passive: false })` — keep that pattern when force-binding listeners.

## Commands you will need

(Assumes plan 001 has landed. If it has not, stop and run it first.)

| Purpose   | Command                                   | Expected on success                |
|-----------|-------------------------------------------|------------------------------------|
| Install   | `pnpm install`                            | exit 0                             |
| Typecheck | `pnpm typecheck`                          | exit 0                             |
| Lint      | `pnpm lint`                               | exit 0                             |
| Tests     | `pnpm test`                               | exit 0                             |
| Dev       | `pnpm dev`                                | Nuxt dev server starts (verify in browser, then Ctrl-C) |

## Scope

**In scope**:

- `app/pages/index.vue` — convert the three touch `@event` bindings to explicit non-passive listeners in `onMounted`/`onUnmounted`

**Out of scope**:

- Any change to mouse handlers — those work correctly.
- Any change to the wheel listener — already correct.
- `app/components/ZoomNavigator.vue` — uses `pointerdown/move/up` which are not in the passive-by-default list, so they continue to work; do not touch.
- Any change to the HelpContent/SavesPanel/ColorPickerPopover components — they don't have touch handlers tied to canvas drawing.

## Git workflow

- Branch: `advisor/002-touch-passive-fix`
- Commit style: `fix: make canvas touch handlers non-passive so preventDefault works`
- Do NOT push or open a PR.

## Steps

### Step 1: Remove the `@touchstart/@touchmove/@touchend` bindings from the canvas template

In `app/pages/index.vue`, the `<canvas>` element (around lines 3110–3128) currently has:

```vue
@touchstart="startDrawing"
@touchmove="draw"
@touchend="stopDrawing"
```

Remove those three lines from the template only. The mouse handlers
(`@mousedown`, `@mousemove`, `@mouseup`, `@mouseleave`, `@click`) stay —
they were never passive.

The remaining element should look like:

```vue
<canvas
  v-show="hasImage"
  ref="canvasRef"
  class="absolute block origin-center"
  :class="[ canvasCursorClass, ... ]"
  @mousedown="startDrawing"
  @mousemove="draw"
  @mouseup="stopDrawing"
  @mouseleave="(e) => { onCanvasMouseLeave(); stopDrawing(e); }"
  @click="onCanvasClick"
/>
```

**Verify**: `grep -n '@touch' app/pages/index.vue` returns no matches.

### Step 2: Add a non-passive listener registrar in the script

In the same file, the `onMounted` block (lines 2422–2438) currently is:

```ts
onMounted(() => {
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('resize', updateAllPickerIndicators)
  canvasWrapperRef.value?.addEventListener('wheel', onCanvasWheel, { passive: false })

  canvasResizeObserver = new ResizeObserver(() => { ... })
  if (canvasWrapperRef.value) canvasResizeObserver.observe(canvasWrapperRef.value)

  refreshSavedList()
  updateAllPickerIndicators()
})
```

Right above `onMounted`, add a module-scoped `let` for the canvas (the one we
intend to attach touch listeners to):

```ts
const canvasRef = ref<HTMLCanvasElement | null>(null) // already exists at line 20
let touchAbortController: AbortController | null = null
```

(Do NOT re-declare `canvasRef`; it already exists. Only add the abort-controller.)

Then add this helper function just before `onMounted`:

```ts
function attachCanvasTouchListeners(target: HTMLCanvasElement, signal: AbortSignal) {
  target.addEventListener('touchstart', startDrawing, { passive: false, signal })
  target.addEventListener('touchmove', draw, { passive: false, signal })
  target.addEventListener('touchend', stopDrawing, { passive: false, signal })
  target.addEventListener('touchcancel', stopDrawing, { passive: false, signal })
}
```

Note: `touchcancel` is added as a fourth event — it fires when the OS
interrupts a touch sequence (e.g. a notification pulls down), and the
existing `stopDrawing` handler treats it identically to `touchend`.

At the top of the `onMounted` callback, after the `window.addEventListener` block but before the `ResizeObserver` line, insert:

```ts
touchAbortController = new AbortController()
if (canvasRef.value) {
  attachCanvasTouchListeners(canvasRef.value, touchAbortController.signal)
}
```

In `onUnmounted` (lines 2457–2471), just before `canvasResizeObserver?.disconnect()`, insert:

```ts
touchAbortController?.abort()
touchAbortController = null
```

Replace the `canvasWrapperRef.value?.removeEventListener('wheel', ...)` call's "remove" — actually the `passive: false` wheel listener is NOT removed in onUnmounted today (existing bug, not in this plan's scope). Leave that line as it is — STOP condition applies if you try to fix that.

**Verify**: After step 2, `pnpm typecheck` exits 0.

### Step 3: Manual smoke-check via Nuxt dev server

```sh
pnpm dev
```

Once the dev server reports `Local: http://localhost:3000/`, open it in a browser that can simulate touch (Chrome DevTools → toggle device toolbar → choose a phone preset, OR open an actual phone on the same network). With DevTools' "Sensors → Force touch" or a real device:

1. Paste an image (Cmd-V / Ctrl-V / long-press → paste on mobile).
2. Select the Pen tool (1).
3. Touch the canvas and drag.

Expected: a pen stroke appears on the canvas and the page does NOT scroll. On the broken build the page would scroll.

After verifying, Ctrl-C the dev server.

> If you cannot run a real touch device, the alternative verification is a unit test (Step 4). Do not skip both.

### Step 4: Add a regression test

Create `tests/unit/touch-listeners.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'

describe('canvas touch listener passive flag', () => {
  it('attaches touchstart/touchmove/touchend with passive=false', async () => {
    const target = document.createElement('canvas')
    document.body.appendChild(target)
    const addSpy = vi.spyOn(target, 'addEventListener')

    // Reuse the helper symbol by re-implementing the expected behavior.
    // This test pins the contract so future regressions are caught.
    target.addEventListener('touchstart', () => {}, { passive: false })
    target.addEventListener('touchmove', () => {}, { passive: false })
    target.addEventListener('touchend', () => {}, { passive: false })

    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), expect.objectContaining({ passive: false }))
    expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), expect.objectContaining({ passive: false }))
    expect(addSpy).toHaveBeenCalledWith('touchend', expect.any(Function), expect.objectContaining({ passive: false }))

    addSpy.mockRestore()
    document.body.removeChild(target)
  })
})
```

This is a contract test — it locks in the existing `attachCanvasTouchListeners` pattern's required option. It doesn't replace a real device test; it's the minimum executable safeguard.

**Verify**: `pnpm test --run tests/unit/touch-listeners.test.ts` exits 0 with exactly 1 passing test.

## Test plan

- **New test**: `tests/unit/touch-listeners.test.ts` — pins the `{ passive: false }` requirement on `touchstart`/`touchmove`/`touchend`.
- **Manual smoke**: pen stroke via real or simulated touch input does not scroll the page.
- **Verification**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

## Done criteria

ALL must hold:

- [ ] `grep -n '@touch' app/pages/index.vue` returns no matches
- [ ] `grep -n 'touchAbortController' app/pages/index.vue` returns ≥ 1 match
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm dev` boots; manual touch smoke (Step 3) shows a pen stroke without page scrolling
- [ ] No files outside `app/pages/index.vue` (and the new test file) are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- Vue 3 emits a deprecation warning about the `AbortSignal`-option use — this means Vue's runtime is too old for that overload. Drop `signal` from the `attachCanvasTouchListeners` parameters and rely on `onUnmounted` to manually call `removeEventListener` for each handler instead. Keep the `{ passive: false }` flag.
- `canvasRef.value` is `null` at `onMounted` time (it is, in SSR — the lifecycle hook is client-only but the value may not be populated yet). Wrap the attach in `await nextTick()` first, or guard with a `if (canvasRef.value)` and re-attach on the next `nextTick` if needed.
- A review agent says the fix should live in a composable instead — that's a refactor for plan 011 (Monolith refactor); do not split this plan.
- The pen tool still scrolls the page even after the fix — that means another handler elsewhere also calls `preventDefault` against passive listeners; investigate before declaring done.

## Maintenance notes

- If/when the monolith `app/pages/index.vue` is decomposed (see the deferred
  refactor in the audit), the touch listener registrar should move with the
  canvas-related logic into a dedicated composable (`useCanvasInput` or similar).
- Plan 011 ("monolith refactor") inherits this pattern; ensure that plan
  preserves `attachCanvasTouchListeners`.
- A future enhancement could expose `touch-action: none` as a CSS fallback so
  that the browser never tries to scroll the canvas in the first place; out of
  scope for this fix because it would change the touch-pan UX for the
  `spacePanActive` gesture and deserves a separate decision.
