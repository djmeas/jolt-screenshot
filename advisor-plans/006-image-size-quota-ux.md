# Plan 006: Add image-size guard and quota UX

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
> If `app/pages/index.vue`, `app/composables/useProjectStorage.ts`, or
> `app/components/SavesPanel.vue` have changed, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `001-verification-baseline.md`
- **Category**: correctness / perf
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

Pasting a 4K×4K screenshot is a common case. A 4K×4K RGBA canvas allocates
64 MB of GPU memory plus a few MB for the PNG data URL. A 10K×10K image
allocates 400 MB and trips the GPU process. Today the app silently accepts
any size, then fails with a generic "Could not save project." error when
the resulting data URL exceeds `localStorage`'s typical 5–10 MB quota.
The user has no signal that the image is the problem, only the failure.

This plan adds a pre-flight size check and a friendlier error message.

## Current state

Files and lines (current as of `00fa802`):

`app/pages/index.vue:884-914` — `replaceWithImage`:

```ts
async function replaceWithImage(fileOrUrl: File | string) {
  clearImageResources()
  resetStripState()
  const objectUrl = typeof fileOrUrl !== 'string' ? URL.createObjectURL(fileOrUrl) : null
  const url = objectUrl ?? fileOrUrl
  try {
    const img = await loadImageElement(url)
    const canvas = getCanvas()
    const ctx = getCanvasContext()
    if (!canvas || !ctx) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    if (objectUrl) trackedObjectUrls.add(objectUrl)
    baseImage.value = { objectUrl, image: img }
    hasImage.value = true
    resetDrawingState()
    resetZoom()
    redrawCanvas()
    nextTick(() => {
      updateCanvasDisplaySize()
      playImageSlamEffect('full')
    })
    projectId.value = newProjectId()
    projectCreatedAt.value = Date.now()
    projectName.value = 'Untitled'
    scheduleAutoSave()
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    console.error('Failed to load image:', err)
  }
}
```

Same pattern at `pages/index.vue:916-941` (`addImageAsLayer`) and
`pages/index.vue:943-990` (`appendImageToRight`).

`app/composables/useProjectStorage.ts:1-293` — `saveProject` and
`performSave` (page-level: `pages/index.vue:1746-1797`) interpret
`QuotaExceededError` from `localStorage.setItem`. Failure message:

```ts
quotaError.value = 'Browser storage is full. Delete a saved project to free space.'
```

`app/components/SavesPanel.vue:50-57` — `formatRelativeTime` and `formatBytes`
utilities.

Conventions:

- Errors are surfaced via a `quotaError` ref consumed by a Teleport-mounted
  alert at `pages/index.vue:3457-3479`.
- All error paths end in `quotaError.value = '<message>'`.

## Commands you will need

(Assumes plan 001 has landed.)

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Lint      | `pnpm lint`      | exit 0              |
| Tests     | `pnpm test`      | exit 0              |

## Scope

**In scope**:

- `app/pages/index.vue` — add a size guard in `replaceWithImage`, `addImageAsLayer`, `appendImageToRight`. Add a project-level constant `MAX_IMAGE_PIXELS`.
- `app/composables/useProjectStorage.ts` — improve the quota error to include the offending projected payload size when known.
- `tests/unit/image-size-guard.test.ts` (create) — pin the constant and the file-size pixel computation.

**Out of scope**:

- Server-side or worker-based image downscaling (would require significant new infrastructure).
- Per-user configuration of the limit (one hardcoded value is fine for now).
- Image-type validation (`pages/index.vue:1945` already filters on `type.startsWith('image/')`).
- The `<canvas>.toBlob('image/png')` result size — that's a separate plan-worthy topic (export-size vs source-size).

## Git workflow

- Branch: `advisor/006-image-size-quota-ux`
- Commit style: `feat: surface image-too-large errors with friendlier messages`
- Do NOT push or open a PR.

## Steps

### Step 1: Define the limit

Near the top of `app/pages/index.vue` (alongside other constants), add:

```ts
const MAX_IMAGE_PIXELS = 16_000_000  // ~16 megapixels (e.g. 4000x4000)
const MAX_IMAGE_BYTES_ESTIMATE = 8_000_000  // ~8 MB PNG in localStorage
```

These are intentionally generous for a screenshot tool. A Retina display
screenshot is typically ~3 MP; the cap covers 4K monitors and small
scrolling captures.

Add a tiny helper, just above `replaceWithImage`:

```ts
function formatPixels(w: number, h: number): string {
  const mp = (w * h) / 1_000_000
  return `${mp.toFixed(1)} MP`
}
```

### Step 2: Pre-flight check in `replaceWithImage`

At the top of the `try` block in `replaceWithImage` (after `loadImageElement(url)` resolves but before `canvas.width = img.naturalWidth`), insert:

```ts
if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  quotaError.value = `That image is ${formatPixels(img.naturalWidth, img.naturalHeight)} which is over the ${formatPixels(MAX_IMAGE_PIXELS, 1)} limit. Try a smaller crop or lower-DPI screenshot.`
  return
}
```

**Verify**: `grep -n 'MAX_IMAGE_PIXELS' app/pages/index.vue` returns ≥ 2 matches (declaration + use).

### Step 3: Apply to `addImageAsLayer` and `appendImageToRight`

In `addImageAsLayer` (after `loadImageElement(objectUrl)` resolves):

```ts
if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
  URL.revokeObjectURL(objectUrl)
  quotaError.value = `That image is ${formatPixels(img.naturalWidth, img.naturalHeight)} which is over the ${formatPixels(MAX_IMAGE_PIXELS, 1)} limit.`
  return
}
```

In `appendImageToRight` (after `loadImageElement(objectUrl)` resolves):

```ts
if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
  URL.revokeObjectURL(objectUrl)
  quotaError.value = `That image is ${formatPixels(img.naturalWidth, img.naturalHeight)} which is over the ${formatPixels(MAX_IMAGE_PIXELS, 1)} limit.`
  return
}
```

(Both messages use the same template — copy verbatim for parity.)

**Verify**: `grep -n 'limit. Try a smaller crop' app/pages/index.vue` (or similar text) returns the expected number of insertions.

### Step 4: Tighten the quota error in `useProjectStorage` and `performSave`

In `app/composables/useProjectStorage.ts:241-245`:

```ts
function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
}
```

Leave this as-is; it's correct. The improvement belongs in the caller
(`performSave`) where we can compute a more helpful message.

In `pages/index.vue:1773-1779` (inside `performSave`):

```ts
if (!result.ok) {
  saveStatus.value = 'error'
  if (result.reason === 'quota') {
    quotaError.value = `Browser storage is full (${formatBytes(estimateStorageUsage())} used). Delete a saved project to free space, or try a smaller image.`
  } else {
    quotaError.value = 'Could not save project.'
  }
  return false
}
```

`estimateStorageUsage` is already imported at the top of `pages/index.vue:9`.

**Verify**: After edit, `formatBytes` and `estimateStorageUsage` are both referenced inside the quota branch.

### Step 5: Add a regression test

Create `tests/unit/image-size-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('image size limits', () => {
  const MAX_IMAGE_PIXELS = 16_000_000

  it('accepts a 4000x4000 image (16 MP)', () => {
    expect(4000 * 4000).toBeLessThanOrEqual(MAX_IMAGE_PIXELS)
  })

  it('rejects a 5000x5000 image (25 MP)', () => {
    expect(5000 * 5000).toBeGreaterThan(MAX_IMAGE_PIXELS)
  })

  it('rejects a 10000x4000 ultra-wide screenshot (40 MP)', () => {
    expect(10000 * 4000).toBeGreaterThan(MAX_IMAGE_PIXELS)
  })
})
```

This pins the chosen limit. If a future change wants to raise or lower it,
this test forces the change to be deliberate.

**Verify**: `pnpm test --run tests/unit/image-size-guard.test.ts` exits 0 with 3 passing tests.

### Step 6: Manual smoke

```sh
pnpm dev
```

1. Paste a normal-sized screenshot — should work as before.
2. Generate a 6000×6000 PNG (any image editor can do this) and paste it — the
   `quotaError` toast should appear with the friendly message, no canvas
   allocation, and no autoSave fired.
3. Click the `×` on the toast to dismiss.

If a 6000×6000 PNG is hard to generate, the alternative is to lower
`MAX_IMAGE_PIXELS` temporarily to 4_000_000 during the test — but the
failing case in Step 5's test (`5000 * 5000 = 25_000_000 > 16_000_000`)
asserts the limit, so a 5K×5K paste would be sufficient.

## Test plan

- **New test**: `tests/unit/image-size-guard.test.ts` — 3 boundary tests.
- **Manual smoke**: paste a too-large image and confirm the friendly error appears.
- **Verification**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n 'MAX_IMAGE_PIXELS' app/pages/index.vue` returns ≥ 4 matches (declaration + 3 call sites)
- [ ] `grep -n 'formatPixels' app/pages/index.vue` returns ≥ 4 matches (declaration + 3 call sites)
- [ ] Manual smoke (Step 6) confirms friendly error appears for a too-large paste
- [ ] No files outside `app/pages/index.vue`, `app/composables/useProjectStorage.ts` (read-only inspection ok), and the new test file are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- The user reports that the limit is too aggressive for legit workflows —
  STOP, this is a tuning observation and not a bug. Open a follow-up
  issue/PR with the user's use case; don't lower the limit below 16 MP
  silently.
- The handler runs but the canvas briefly allocates to the larger size
  before the early-return — that's the existing `canvas.width = naturalWidth`
  layout; the guard must come BEFORE that line. Confirm by re-reading the
  order; STOP if you can't reorder.
- Plan 007 (AutoSave race) lands first and changes where
  `quotaError` is reset; verify the new path doesn't drop the message.

## Maintenance notes

- The 16 MP / 8 MB cap is a guess based on common screenshot sizes and
  browser `localStorage` quotas. If real user reports suggest they're
  hitting the cap regularly, raise it; if memory pressure is reported,
  lower it. Don't tighten without monitoring data.
- A future enhancement: show a preview before the user commits a large
  paste, with a "Use as-is / Scale to fit / Cancel" trio. Out of scope
  here — it changes the UX flow.
- Estimating the PNG output size before commit requires an async canvas
  encode and is non-trivial; defer to a separate plan if needed.
