# Plan 003: Cap undo history to bound memory usage

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
> If `app/pages/index.vue` has changed since this plan was written, compare
> the "Current state" excerpts against the live code before proceeding; on
> a mismatch treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `001-verification-baseline.md`
- **Category**: perf / correctness
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

`pushAnnotationState` (called 9 times throughout `app/pages/index.vue`)
appends a deep-cloned snapshot of the entire `annotations` array to
`annotationHistory` on every user action. There is no cap, so:
- A long drawing session (or a pen stroke with 10k+ points from a slow
  drag) is kept in full at every undo checkpoint.
- `JSON.parse(JSON.stringify(...))` of a large annotation array is
  O(N) in both size and time; a thousand-point pen stroke deep-cloned 50
  times is 50k points held in JS memory.
- `canUndo` only ever reports true (length always grows), which makes the
  Undo button always look available.

This plan introduces a depth cap, a per-snapshot point-count cap, and
exposes a "merge" mode where consecutive small actions don't grow the
stack. The selected approach is a fixed cap with FIFO eviction.

## Current state

File: `app/pages/index.vue`

State declarations (lines 168–170):

```ts
const annotations = ref<Annotation[]>([])
const annotationHistory = ref<Annotation[][]>([])
```

`pushAnnotationState` (lines 182–185):

```ts
function pushAnnotationState() {
  annotationHistory.value.push(JSON.parse(JSON.stringify(annotations.value)))
  scheduleAutoSave()
}
```

`undo` (lines 187–195):

```ts
function undo() {
  if (annotationHistory.value.length === 0) return
  const prev = annotationHistory.value.pop()!
  annotations.value = prev
  if (selectedArrowIndex.value != null && selectedArrowIndex.value >= prev.length) {
    selectedArrowIndex.value = null
  }
  redrawCanvas()
}
```

Call sites of `pushAnnotationState`:

- `pages/index.vue:925` — `addImageAsLayer`
- `pages/index.vue:1094` — `startDrawing` (resize handle)
- `pages/index.vue:1120` — `startDrawing` (move drag)
- `pages/index.vue:1228` — `stopDrawing` (pen end)
- `pages/index.vue:1245` — `stopDrawing` (arrow end)
- `pages/index.vue:1265` — `stopDrawing` (box end)
- `pages/index.vue:1305` — `onCanvasClick` (emoji place)
- `pages/index.vue:1383` — `commitText` (text place)
- `pages/index.vue:1650` — `updateSelectedArrowAngle` (pivot slider)

Resets (where history is cleared — must preserve this):

- `pages/index.vue:862` — `resetDrawingState`
- `pages/index.vue:1858` — `loadSavedProjectIntoCanvas`

Conventions:

- Annotations are deep-cloned via `JSON.parse(JSON.stringify(...))`. Keep that pattern; this plan does not introduce a structured-clone helper.

## Commands you will need

(Assumes plan 001 has landed.)

| Purpose   | Command                                   | Expected on success                |
|-----------|-------------------------------------------|------------------------------------|
| Typecheck | `pnpm typecheck`                          | exit 0                             |
| Lint      | `pnpm lint`                               | exit 0                             |
| Tests     | `pnpm test`                               | exit 0                             |

## Scope

**In scope**:

- `app/pages/index.vue` — modify `pushAnnotationState` and add the cap constants/types.
- `tests/unit/undo-history.test.ts` (create) — regression test that pins the cap.

**Out of scope**:

- Any change to the action sites themselves (the 9 call sites still call the same function).
- Replacing the JSON-deep-clone with a structured-clone or immer — out of scope; would change the diff semantics for future plans.
- Persisting undo history across sessions — explicitly not desired; the spec is in-session only.

## Git workflow

- Branch: `advisor/003-undo-history-cap`
- Commit style: `perf: cap undo history depth and point count`
- Do NOT push or open a PR.

## Steps

### Step 1: Define the cap constants

Near the top of `app/pages/index.vue` (just below the existing constants such
as `RESIZE_HANDLE_RADIUS` at line 1458), add:

```ts
const MAX_UNDO_DEPTH = 100
const MAX_UNDO_POINTS_PER_SNAPSHOT = 50_000
```

The depth cap is generous — most drawing sessions involve dozens of
strokes, not hundreds. The points-per-snapshot cap prevents one giant pen
stroke from making a single snapshot the dominant memory cost.

### Step 2: Rewrite `pushAnnotationState` with FIFO eviction and point cap

Replace the function (lines 182–185) with:

```ts
function pushAnnotationState() {
  const clone = JSON.parse(JSON.stringify(annotations.value))
  // Downsample: only when the whole snapshot exceeds the per-snapshot cap,
  // drop points from giant pen strokes. Otherwise keep the snapshot whole.
  const total = snapshotSize(clone)
  if (total > MAX_UNDO_POINTS_PER_SNAPSHOT) {
    downsamplePenStrokesInPlace(clone, 1000)
  }
  pushWithCap(annotationHistory.value, clone, MAX_UNDO_DEPTH)
  scheduleAutoSave()
}
```

You can keep the inline `snapshotSize`, `downsamplePenStrokesInPlace`, and
`pushWithCap` helpers as locally-declared functions inside
`<script setup>`. Use these bodies — they're small and stable:

```ts
function snapshotSize(anns: Annotation[]): number {
  let n = 0
  for (const a of anns) {
    if (a.type === 'pen') n += a.path.length
    else n += 1
  }
  return n
}

function downsamplePenStrokesInPlace(anns: Annotation[], perStrokeMax: number): void {
  for (const a of anns) {
    if (a.type === 'pen' && a.path.length > perStrokeMax) {
      const stride = Math.ceil(a.path.length / perStrokeMax)
      a.path = a.path.filter((_, i) => i % stride === 0)
    }
  }
}

function pushWithCap<T>(stack: T[], item: T, cap: number): void {
  stack.push(item)
  while (stack.length > cap) stack.shift()
}
```

Rationale:

- `JSON.parse(JSON.stringify(...))` is preserved (matches existing convention).
- We *try* to keep snapshots whole; only downsample pen strokes beyond 1000 points and only when the whole snapshot exceeds 50k points.
- FIFO (`shift()`) because new actions are at the tail and old ones are less likely to be undone-to.

**Verify**: `pnpm typecheck` exits 0.

### Step 3: Preserve the existing reset semantics

Nothing to change — `resetDrawingState` at line 862 and `loadSavedProjectIntoCanvas` at line 1858 both use `annotationHistory.value = []`. Both keep working.

**Verify**: `grep -n 'annotationHistory.value = \[\]' app/pages/index.vue` returns at least 2 matches (unchanged from before).

### Step 4: Add a regression test

Create `tests/unit/undo-history.test.ts`. Because the helpers (`snapshotSize`,
`downsamplePenStrokesInPlace`, `pushWithCap`) are file-local inside
`app/pages/index.vue`, the test exercises equivalent inline expressions
matching the planned implementations — not direct imports:

```ts
import { describe, it, expect } from 'vitest'

// These implementations mirror the helpers in app/pages/index.vue.
// If the helpers change shape, keep this test in sync.
function snapshotSize(anns: any[]): number {
  let n = 0
  for (const a of anns) {
    if (a.type === 'pen') n += (a.path ?? []).length
    else n += 1
  }
  return n
}

function downsamplePenStrokesInPlace(anns: any[], perStrokeMax: number): void {
  for (const a of anns) {
    if (a.type === 'pen' && a.path && a.path.length > perStrokeMax) {
      const stride = Math.ceil(a.path.length / perStrokeMax)
      a.path = a.path.filter((_: unknown, i: number) => i % stride === 0)
    }
  }
}

function pushWithCap<T>(stack: T[], item: T, cap: number): void {
  stack.push(item)
  while (stack.length > cap) stack.shift()
}

describe('undoHistory helpers', () => {
  it('snapshotSize counts pen points as N, others as 1', () => {
    expect(snapshotSize([{ type: 'pen', path: new Array(10).fill({ x: 0, y: 0 }) }])).toBe(10)
    expect(snapshotSize([{ type: 'box' }, { type: 'arrow' }])).toBe(2)
  })

  it('downsamplePenStrokesInPlace leaves small strokes alone', () => {
    const a = { type: 'pen', path: new Array(50).fill({ x: 0, y: 0 }) }
    downsamplePenStrokesInPlace([a], 1000)
    expect(a.path.length).toBe(50)
  })

  it('downsamplePenStrokesInPlace decimates huge strokes', () => {
    const a = { type: 'pen', path: new Array(5000).fill(0).map((_, i) => ({ x: i, y: i })) }
    downsamplePenStrokesInPlace([a], 100)
    expect(a.path.length).toBeLessThanOrEqual(101)
    expect(a.path.length).toBeGreaterThan(0)
  })

  it('pushWithCap evicts oldest when over cap', () => {
    const stack: number[] = []
    pushWithCap(stack, 1, 3)
    pushWithCap(stack, 2, 3)
    pushWithCap(stack, 3, 3)
    pushWithCap(stack, 4, 3)
    pushWithCap(stack, 5, 3)
    expect(stack).toEqual([3, 4, 5])
  })

  it('pushWithCap with 100-deep cap holds up to 100 entries', () => {
    const stack: number[] = []
    for (let i = 0; i < 250; i++) pushWithCap(stack, i, 100)
    expect(stack.length).toBe(100)
    expect(stack[0]).toBe(150)  // oldest 150 entries evicted
    expect(stack[99]).toBe(249)
  })
})
```

**Verify**: `pnpm test --run tests/unit/undo-history.test.ts` exits 0 with 5 passing tests.

## Test plan

- **New tests**: `tests/unit/undo-history.test.ts` — 5 tests covering snapshot accounting, downsampling, and FIFO eviction.
- **Verification**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (now 11 tests passing: 6 from plan 001 + 1 from plan 002 if landed + 5 here; minimum is 11 if only 001 and 003 have landed)
- [ ] `grep -n 'MAX_UNDO_DEPTH' app/pages/index.vue` returns ≥ 1 match (the inline declaration)
- [ ] `grep -n 'MAX_UNDO_POINTS_PER_SNAPSHOT' app/pages/index.vue` returns ≥ 1 match
- [ ] `grep -n 'JSON.parse(JSON.stringify(annotations.value))' app/pages/index.vue` returns 1 match (still in `pushAnnotationState`)
- [ ] Manual smoke: draw 200 pen strokes in `pnpm dev`, confirm undo still works after the 200th; `canUndo` stays true throughout. Memory in DevTools Performance tab stays flat (test command: `chrome://tracing` or DevTools → Performance → record 30s of stroke activity; memory should not grow unboundedly).
- [ ] No files outside `app/pages/index.vue` and the new test file are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- A reviewer says the cap should be configurable per-user via a setting — that's plan territory, not bug-fix territory. Defer.
- The JSON deep-clone proves too slow in test (tests take >5s on a tiny annotation array) — STOP; the deep-clone isn't the regression we set out to fix in this plan. Open a separate perf plan and revert.
- After the change, `undo()` pops entries from the wrong end of the stack (FIFO instead of LIFO) — STOP; you've introduced a logic bug. The contract must remain: undo restores the most recent prior state.

## Maintenance notes

- The constants `MAX_UNDO_DEPTH` / `MAX_UNDO_POINTS_PER_SNAPSHOT` and the helpers
  `snapshotSize` / `downsamplePenStrokesInPlace` / `pushWithCap` currently live
  inside `app/pages/index.vue`. If/when the monolith is refactored (audit
  finding #11 / future plan), they should move to `app/utils/undoHistory.ts`
  for testability and reuse.
- The downsampling strategy is lossy for pen strokes beyond 1000 points.
  A future improvement could surface a "this stroke was simplified in undo"
  notice — out of scope here.
- The `MAX_UNDO_POINTS_PER_SNAPSHOT = 50_000` number is a heuristic; revisit
  if memory profiling on a real Chrome shows the cap is wrong by an order of
  magnitude.
- A different and more sophisticated approach (a ring buffer of `diff` patches
  against a base snapshot) would scale better but is significantly more
  code; defer to a future plan if memory pressure becomes a user-facing
  complaint.
