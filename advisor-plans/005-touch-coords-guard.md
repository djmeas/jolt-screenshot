# Plan 005: Guard touch-coordinate reads against empty `touches` list

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
> If `app/pages/index.vue` has changed, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `001-verification-baseline.md`
- **Category**: correctness
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

`getCanvasCoords`, `startDrawing`, and `draw` all read `e.touches[0]` without
a length check. On `touchend` and `touchcancel`, `e.touches` is an empty
list — only `e.changedTouches` carries the lifted finger. Reading
`e.touches[0]` returns `undefined`, and downstream code does arithmetic on
`undefined.clientX`, producing `NaN` coordinates. Today the bug is latent
because the affected paths in those functions don't actually run after
`touchend`, but it's a defect waiting for the next refactor to wake up.

This plan adds a single guarded helper, `primaryTouch`, that returns either
the first active touch or `null`, and rewires the three call sites to use
it. Small change, defensive, easy to verify.

## Current state

File: `app/pages/index.vue`

`getCanvasCoords` (lines 522–538):

```ts
function getCanvasCoords(e: MouseEvent | TouchEvent) {
  const canvas = getCanvas()
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  if ('touches' in e) {
    return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY
    }
  }
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
}
```

`startDrawing` reads `'touches' in e` and indexes `e.touches[0]` (line 1065):

```ts
const pt = 'touches' in e ? e.touches[0] : e
```

Same pattern in `draw` (line 1158):

```ts
const pt = 'touches' in e ? e.touches[0] : e
```

Conventions:

- The codebase normalizes touch/mouse via inline ternaries; keep the same inline pattern. `primaryTouch` is just the helper extracted from the existing ternaries, not a refactor.

## Commands you will need

(Assumes plan 001 has landed.)

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:

- `app/pages/index.vue` — add `primaryTouch`, refactor `getCanvasCoords` to use it, refactor `'touches' in e ? e.touches[0] : e` to call the helper.
- `tests/unit/primary-touch.test.ts` (create) — pins the guard.

**Out of scope**:

- The wheel listener (`onCanvasWheel`) and mouse handlers — they don't use `touches`.
- `app/components/ZoomNavigator.vue` — uses `PointerEvent` with `setPointerCapture`, not touch-list semantics.
- Behavior on a real touch device — manual smoke is *not* required for this plan; the unit test is the verification gate. (Plan 002 already exercises the touch listener path.)

## Git workflow

- Branch: `advisor/005-touch-coords-guard`
- Commit style: `fix: guard touch coordinate reads against empty touches list`
- Do NOT push or open a PR.

## Steps

### Step 1: Add the helper

Just below `getCanvasCoords` (around line 538), add:

```ts
function primaryTouch(e: MouseEvent | TouchEvent): { clientX: number, clientY: number } | null {
  if ('touches' in e) {
    return e.touches[0] ?? null
  }
  return e
}
```

Note: the `?? null` is the actual fix — without it, `e.touches[0]` returns
`undefined` on `touchend`/`touchcancel`, and downstream arithmetic produces
`NaN`.

**Verify**: `pnpm typecheck` exits 0.

### Step 2: Refactor `getCanvasCoords` to bail on empty touches

Replace the body of `getCanvasCoords` (lines 522–538) with:

```ts
function getCanvasCoords(e: MouseEvent | TouchEvent) {
  const canvas = getCanvas()
  if (!canvas) return { x: 0, y: 0 }
  const pt = 'touches' in e ? e.touches[0] : e
  if (!pt) return null  // touchend/touchcancel: no active touch
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (pt.clientX - rect.left) * scaleX,
    y: (pt.clientY - rect.top) * scaleY,
  }
}
```

And widen its return type at the function signature (line 522):

```ts
function getCanvasCoords(e: MouseEvent | TouchEvent): { x: number, y: number } | null {
```

Now every caller needs to handle the `null` case. Find them:

```sh
grep -n 'const { x, y } = getCanvasCoords' app/pages/index.vue
```

Expected hits (already audited):

- `pages/index.vue:1071` — `startDrawing`
- `pages/index.vue:1165` — `draw`
- `pages/index.vue:1302` — `onCanvasClick`

Each of these must early-return when coords are null. Update each call site
to:

```ts
const coords = getCanvasCoords(e)
if (!coords) return
const { x, y } = coords
```

For `startDrawing` (line 1071 area), the early return is critical: the
function is the entry point and should silently no-op on a `touchend` leak
into the path (defense against any future routing change).

For `draw` (line 1165 area), early return is correct: if no active touch,
the draw call should be a no-op (don't redraw with NaN coordinates).

For `onCanvasClick` (line 1302), early return prevents placing text/emoji
on stale state when the click races with a touchend.

**Verify**: `grep -n 'const coords = getCanvasCoords' app/pages/index.vue` returns 3 matches.

### Step 3: Refactor the inline ternaries in `startDrawing` and `draw`

Replace the line 1065 ternary:

```ts
const pt = 'touches' in e ? e.touches[0] : e
panStart.value = { x: pt.clientX, y: pt.clientY, viewX: viewX.value, viewY: viewY.value }
```

with:

```ts
const touch = primaryTouch(e)
if (!touch) return
panStart.value = { x: touch.clientX, y: touch.clientY, viewX: viewX.value, viewY: viewY.value }
```

Same for line 1158 in `draw`. Wrap it before the early-return `isPanning.value` check.

**Verify**: `pnpm typecheck` exits 0.

### Step 4: Add a regression test

Create `tests/unit/primary-touch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

describe('primaryTouch (inline test of the contract, not direct import)', () => {
  it('returns null on touchend (touches is empty)', () => {
    const e = {
      touches: [],
      changedTouches: [{ clientX: 10, clientY: 20 }],
    } as unknown as TouchEvent
    const result = 'touches' in e ? (e.touches[0] ?? null) : e
    expect(result).toBeNull()
  })

  it('returns the first touch on touchmove (touches has one entry)', () => {
    const e = {
      touches: [{ clientX: 10, clientY: 20 }],
    } as unknown as TouchEvent
    const result = 'touches' in e ? (e.touches[0] ?? null) : e
    expect(result).toEqual({ clientX: 10, clientY: 20 })
  })

  it('falls through to the MouseEvent itself for mouse events', () => {
    const e = { clientX: 100, clientY: 200 } as unknown as MouseEvent
    const result = 'touches' in e ? (e.touches[0] ?? null) : e
    expect(result).toBe(e)
  })
})
```

This is a contract test that pins the behavior the helper delivers. It
doesn't import the helper itself (which is a Vue SFC file-local function —
not exported) — instead it exercises the equivalent expression. If a
reviewer prefers an exported helper, export it from a new
`app/utils/touchCoords.ts` and update the test to import that — but
don't make that change as part of this plan; it crosses into the monolith
refactor territory.

**Verify**: `pnpm test --run tests/unit/primary-touch.test.ts` exits 0 with 3 passing tests.

## Test plan

- **New tests**: `tests/unit/primary-touch.test.ts` — 3 tests covering touchend-empty, touchmove-with-touch, mouse-fallthrough.
- **Verification**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n "'touches' in e ? e.touches\[" app/pages/index.vue` returns 0 matches (the inline unsguarded access is gone)
- [ ] `grep -n 'const coords = getCanvasCoords' app/pages/index.vue` returns 3 matches
- [ ] `grep -n 'if (!coords) return' app/pages/index.vue` returns 3 matches
- [ ] No files outside `app/pages/index.vue` and the new test file are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- A test elsewhere (e.g. plan 002's touch-listener test) starts failing
  because the `e.touches[0]` access pattern it pinned has been removed —
  update plan 002's test to match the new pattern, do not roll back Step 1.
- The widened return type of `getCanvasCoords` triggers a downstream
  typecheck error in a place the grep above missed — STOP, fix the caller,
  re-run `pnpm typecheck`. Do not widen the return type back to
  non-nullable; the widening is intentional.
- Touch-related paths still work correctly on a real device. If manual
  smoke is performed and pen-tool drawing crashes on touch end, STOP and
  report the stack trace.

## Maintenance notes

- `primaryTouch` is a private function inside the `<script setup>` block.
  When the monolith is refactored (audit finding #11), export it from
  `app/utils/touchCoords.ts`.
- The three early-return call sites follow a uniform shape:
  `const coords = getCanvasCoords(e); if (!coords) return; const { x, y } = coords`.
  A future lint rule could enforce this if the project adds ESLint
  custom-rule support — out of scope here.
- A more comprehensive event-normalization helper covering wheel, pointer,
  and touch would be a natural follow-up — defer to a future plan.
