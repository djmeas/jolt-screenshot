# Plan 007: Fix autoSave race condition across image/project swaps

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
- **Risk**: MED
- **Depends on**: `001-verification-baseline.md`
- **Category**: correctness
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

`scheduleAutoSave` (line 1801) sets a 1-second timer that calls
`performSave`. `performSave` reads current state from refs:
`projectId`, `projectName`, `baseImage`, `annotations`, etc. The
problem: those refs are *reset* AFTER image loads complete:

```ts
// pages/index.vue:884-914, replaceWithImage
async function replaceWithImage(fileOrUrl: File | string) {
  clearImageResources()   // wipes baseImage.value to null
  resetStripState()
  const objectUrl = typeof fileOrUrl !== 'string' ? URL.createObjectURL(fileOrUrl) : null
  const url = objectUrl ?? fileOrUrl
  try {
    const img = await loadImageElement(url)   // <-- async pause
    /* ... */
    projectId.value = newProjectId()          // <-- happens AFTER the await
    projectName.value = 'Untitled'
    scheduleAutoSave()
  } catch (err) { /* ... */ }
}
```

Sequence:

1. User pastes a screenshot of project A.
2. The 1-second autoSave timer set in some *prior* interaction (e.g. they
   tapped the color picker) fires while `replaceWithImage` is mid-await.
3. `performSave` runs with the *new* image loaded but the *old* `projectId`
   still in the ref, writing the new image into the wrong saved project.

Same race exists for `loadSavedProjectIntoCanvas` and
`appendImageToRight`. The fix is straightforward: a generation counter, so
each "in-flight save" is bound to the project ID it was scheduled for, and
a stale one bails out cleanly.

## Current state

File: `app/pages/index.vue`

`autoSaveTimer` declaration (line 1799):

```ts
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
```

`scheduleAutoSave` (lines 1801–1808):

```ts
function scheduleAutoSave() {
  if (!hasImage.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  saveStatus.value = 'saving'
  autoSaveTimer = setTimeout(() => {
    performSave({ silent: true })
  }, 1000)
}
```

`performSave` (lines 1746–1797) — key reads at the top:

```ts
async function performSave(opts: { silent?: boolean } = {}): Promise<boolean> {
  const canvas = getCanvas()
  if (!canvas || !hasImage.value) return false
  saveStatus.value = 'saving'
  try {
    const baseImageData = await buildSavedBaseImage()
    if (!baseImageData) { /* ... */ }
    const layers = await buildSavedLayers()
    const result = saveProject({
      id: projectId.value,        // <-- could be stale
      name: projectName.value || 'Untitled',
      /* ... */
    })
    /* ... */
```

Call sites of `scheduleAutoSave`:

- `pages/index.vue:134` — `commitLabelEdit`
- `pages/index.vue:184` — `pushAnnotationState`
- `pages/index.vue:204` — `toggleStripLabels`
- `pages/index.vue:909` — `replaceWithImage`
- `pages/index.vue:985` — `appendImageToRight`
- `pages/index.vue:2147` — `selectStrokeColor`
- `pages/index.vue:2155` — `selectStrokeWidth`
- `pages/index.vue:2454` — `watch([textFontSize, emojiSize], ...)`

The reset paths (where a *new* project ID begins before the image loads):

- `pages/index.vue:884-914` — `replaceWithImage`
- `pages/index.vue:1816-1881` — `loadSavedProjectIntoCanvas`

Conventions:

- Use module-scoped `let` for the timer (matches the existing pattern at line 1799). Generation counter goes next to it.
- Errors and saved-state signaling are via `quotaError` / `saveStatus` refs (lines 178/179).

## Commands you will need

(Assumes plan 001 has landed.)

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:

- `app/pages/index.vue` — add a save-generation counter; cancel pending saves on project-ID swap; debounce `scheduleAutoSave`.
- `tests/unit/autosave-race.test.ts` (create) — pin the generation contract.

**Out of scope**:

- Replacing `localStorage` writes with `IndexedDB` for unbounded size — different problem.
- Adding a manual "save now" debounce — the existing toolbar button at line 2908 is fine.
- Changing `appendImageToRight` semantics; this plan only changes how its autoSave is gated.

## Git workflow

- Branch: `advisor/007-autosave-race`
- Commit style: `fix: bind autoSave to project-generation to prevent stale writes`
- Do NOT push or open a PR.

## Steps

### Step 1: Add a generation counter

Right next to `autoSaveTimer` (around line 1799), add:

```ts
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let autoSaveGeneration = 0
```

### Step 2: Increment on every project-ID swap

Wrap the `projectId` resets in `replaceWithImage` and `loadSavedProjectIntoCanvas` (and the equivalent in `clearAnnotations`, `handleDeleteSaved`, `startNewProject`) with a generation bump.

Add a small helper near `scheduleAutoSave`:

```ts
function invalidateAutoSave() {
  autoSaveGeneration++
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  saveStatus.value = 'idle'
}
```

Then, at the start of each function that switches `projectId`, call
`invalidateAutoSave()`:

- `replaceWithImage` (line 884): add `invalidateAutoSave()` immediately after the function signature, before `clearImageResources()`.
- `loadSavedProjectIntoCanvas` (line 1816): same.
- `clearAnnotations` (line 1027): same, but only when `resetProject` is true. Existing code:

  ```ts
  if (resetProject) {
    projectId.value = newProjectId()
    projectCreatedAt.value = Date.now()
    projectName.value = 'Untitled'
  }
  ```

  Replace with:

  ```ts
  if (resetProject) {
    invalidateAutoSave()
    projectId.value = newProjectId()
    projectCreatedAt.value = Date.now()
    projectName.value = 'Untitled'
  }
  ```

- `startNewProject` (line 1899): add `invalidateAutoSave()` before the body.
- `handleDeleteSaved` (line 1883): inside the `if (id === projectId.value)` branch, call `invalidateAutoSave()`.

### Step 3: Capture the generation in `scheduleAutoSave`

Replace `scheduleAutoSave` (lines 1801–1808) with:

```ts
function scheduleAutoSave() {
  if (!hasImage.value) return
  const generation = autoSaveGeneration
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  saveStatus.value = 'saving'
  autoSaveTimer = setTimeout(async () => {
    if (generation !== autoSaveGeneration) return  // stale callback
    autoSaveTimer = null
    await performSave({ silent: true })
  }, 1000)
}
```

The `generation !== autoSaveGeneration` check inside the timer callback is
the load-bearing line — it gates any in-flight `performSave` to the
project it was scheduled for.

### Step 4: Guard `performSave` itself

In `performSave` (line 1746), before reading `projectId.value`, capture it:

```ts
async function performSave(opts: { silent?: boolean } = {}): Promise<boolean> {
  const canvas = getCanvas()
  if (!canvas || !hasImage.value) return false
  const generationAtStart = autoSaveGeneration
  const idAtStart = projectId.value
  saveStatus.value = 'saving'
  try {
    const baseImageData = await buildSavedBaseImage()
    if (!baseImageData) { /* unchanged */ }
    const layers = await buildSavedLayers()
    if (generationAtStart !== autoSaveGeneration) return false  // stale
    const result = saveProject({
      id: idAtStart,           // pin to the value read at function entry
      name: projectName.value || 'Untitled',
      /* ... rest unchanged ... */
    })
    /* ... */
  }
}
```

The double-guard (in `scheduleAutoSave`'s callback *and* inside
`performSave` itself) handles two cases:

- The first guard skips the callback entirely if `invalidateAutoSave()` ran
  after the timer was scheduled.
- The second guard handles the case where `performSave` was called *not* via
  the timer (e.g. via `performSave(); closeToolbarMenu()` at line 2908) and
  someone cleared the project concurrently.

**Verify**: `grep -n 'autoSaveGeneration' app/pages/index.vue` returns ≥ 6 matches (declaration + 5+ uses).

### Step 5: Add a regression test

Create `tests/unit/autosave-race.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('autosave generation contract', () => {
  it('an invalidation cancels a pending save without writing', () => {
    let generation = 0
    let saved = false

    function scheduleSave() {
      const myGen = generation
      setTimeout(() => {
        if (myGen !== generation) return
        saved = true
      }, 0)
    }

    scheduleSave()
    generation++   // simulate project swap before timer fires

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(saved).toBe(false)
        resolve()
      }, 10)
    })
  })

  it('a non-invalidated save still writes after the timer fires', () => {
    let generation = 0
    let saved = false

    function scheduleSave() {
      const myGen = generation
      setTimeout(() => {
        if (myGen !== generation) return
        saved = true
      }, 0)
    }

    scheduleSave()

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(saved).toBe(true)
        resolve()
      }, 10)
    })
  })
})
```

This pins the core invariant: invalidation must cancel the pending write.

**Verify**: `pnpm test --run tests/unit/autosave-race.test.ts` exits 0 with 2 passing tests.

### Step 6: Manual smoke

```sh
pnpm dev
```

1. Open DevTools, Application → Local Storage, note an empty `joltshot:save:*` set.
2. Paste image A. Tap a color in the toolbar to schedule an autoSave.
3. Within ~500 ms (before the 1s save fires), paste image B. Choose "Replace".
4. After 2s, refresh the page. The Saves panel should show only project A — the
   cancel should have prevented the save firing during the swap. Before the
   fix, project A would have been overwritten with image B's dataURL
   under A's project ID (a user-visible regression).

## Test plan

- **New test**: `tests/unit/autosave-race.test.ts` — 2 tests covering
  invalidation cancel and non-stale writes.
- **Manual smoke**: timestamp-paste-swap sequence verifying the saved
  project ID is the new one, not the old.
- **Verification**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n 'autoSaveGeneration' app/pages/index.vue` returns ≥ 6 matches
- [ ] `grep -n 'invalidateAutoSave' app/pages/index.vue` returns ≥ 5 matches (declaration + 4 callers)
- [ ] Manual smoke (Step 6) shows saves land under the new project ID
- [ ] No files outside `app/pages/index.vue` and the new test file are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm typecheck` reports `TS2304: Cannot find name 'autoSaveGeneration'`
  on a line where you declared it — Vue's `<script setup>` may be compiling
  the helper as a closure; if so, declare the counter at module scope outside
  any function (it already is, by design).
- The test in Step 5 flakes (timer-based) — replace the `setTimeout(0)` with
  `await new Promise(r => queueMicrotask(r))` and retry; if still flaky,
  STOP and report.
- A user reports that the cancel-via-generation is *cancelling legitimate
  saves* in normal interaction (e.g. color picker rapid taps generating
  multiple generations, only the last one saves). This would mean the
  timer-scheduling path needs to also bump the generation *only* on project
  swap, not on every `scheduleAutoSave` call. That matches the current
  plan — STOP and re-check that `scheduleAutoSave` does *not* increment.

## Maintenance notes

- The generation counter assumes only one save is in flight at a time.
  `scheduleAutoSave` debounces by clearing the existing timer, but it does
  not serialize `performSave` calls. If two `performSave`s race (one from
  the toolbar button, one from the timer), the second's results will
  stomp the first. Acceptable for v1; revisit when manual-save and
  timer-save can collide.
- A cleaner long-term architecture moves `scheduleAutoSave` / `performSave`
  / `invalidateAutoSave` into a `useAutoSave({ projectId, baseImage,
  annotations, settings })` composable. Out of scope here — that's the
  monolith refactor (audit #11).
- The generation counter is a single integer. If at some point two
  `replaceWithImage` runs overlap (unlikely with the synchronous paste UI),
  one will win and the other will write to the same project ID. Acceptable
  for the current single-flow UX.
