# Plan 004: Revoke leaked object URLs in loadSavedProject

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
- **Category**: correctness / memory
- **Planned at**: commit `00fa802`, 2026-08-01
- **Issue**: —

## Why this matters

`loadSavedProjectIntoCanvas` creates up to 1 base object URL and N layer
object URLs (`URL.createObjectURL`) per saved project. These URLs are not
revoked until the user navigates away, refreshes, or clears all images.
Opening 10 saved projects in a row leaks ~10×(1+layer-count) blob URLs into
the page's lifetime object URL table. Chromium and Safari both have soft
limits on a page's URL allocation; while large, they are not infinite.

In contrast, every *other* path in this file (replace, append, layer add)
revokes its own object URL on completion or registers it in
`trackedObjectUrls` to be revoked by the next `clearImageResources()`.

This plan plugs the leak by adding per-saved-project revocation and a
defensive track-everything path.

## Current state

File: `app/pages/index.vue`

`clearImageResources` (lines 804–809):

```ts
function clearImageResources() {
  for (const url of trackedObjectUrls) URL.revokeObjectURL(url)
  trackedObjectUrls.clear()
  imageElementCache.clear()
  baseImage.value = null
}
```

`loadSavedProjectIntoCanvas` (lines 1816–1881) — focus on the
`URL.createObjectURL` call sites at lines 1835 and 1843:

```ts
const img = await loadImageElement(saved.baseImage.dataUrl)
canvas.width = saved.width
canvas.height = saved.height
const objectUrl = URL.createObjectURL(await (await fetch(saved.baseImage.dataUrl)).blob())
baseImage.value = { objectUrl, image: img }
hasImage.value = true
resetZoom()

for (const layer of saved.layers) {
  try {
    const layerImg = await loadImageElement(layer.dataUrl)
    const layerObjectUrl = URL.createObjectURL(await (await fetch(layer.dataUrl)).blob())
    /* ... */
  } catch (err) {
    console.error('Failed to restore layer:', err)
  }
}
```

The `objectUrl` and `layerObjectUrl` variables are never revoked.

Other paths that create object URLs (which already revoke):

- `pages/index.vue:887-913` — `replaceWithImage`
- `pages/index.vue:919-940` — `addImageAsLayer`
- `pages/index.vue:947-990` — `appendImageToRight`

Conventions:

- All object URL allocations track into `trackedObjectUrls` (`new Set<string>` declared at line 98), so a single `clearImageResources()` revokes everything. The saved-project-load path was simply forgotten — this plan re-aligns it.

## Commands you will need

(Assumes plan 001 has landed.)

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0              |
| Lint      | `pnpm lint`              | exit 0              |
| Tests     | `pnpm test`              | exit 0              |

## Scope

**In scope**:

- `app/pages/index.vue` — modify `loadSavedProjectIntoCanvas` to register created URLs into `trackedObjectUrls`. Also revoke the prior project's URLs before allocating new ones.
- `tests/unit/object-url-lifecycle.test.ts` (create) — pin the registration contract.

**Out of scope**:

- Do not change `clearImageResources` semantics — its current behavior (revoke all + clear) is correct, just unused by the saved-project-load path.
- Do not refactor the `registerImageElement` / `trackedObjectUrls` duo into a class — the audit-deferred "monolith refactor" plan covers this when it lands.
- Do not change `addImageAsLayer`, `appendImageToRight`, or `replaceWithImage` — they already revoke correctly.

## Git workflow

- Branch: `advisor/004-saved-project-url-leak`
- Commit style: `fix: revoke object URLs created by loadSavedProject`
- Do NOT push or open a PR.

## Steps

### Step 1: Revoke previous URLs before allocating new ones in loadSavedProject

The current `loadSavedProjectIntoCanvas` at line 1819 only calls
`clearImageResources()` when `hasImage.value` is true:

```ts
if (hasImage.value) {
  clearImageResources()
  resetDrawingState()
  hasImage.value = false
}
```

That guards against the case where the user has an open project and switches
to a saved one. But `clearImageResources` only runs if a prior image is
present. Wrap the URL-revocation logic so it always runs on entry, even if
the canvas is currently empty (defensive against any stray URLs from a
prior partial-load or a future path).

Replace the block at lines 1819–1823 with:

```ts
clearImageResources()
resetDrawingState()
hasImage.value = false
```

Note: this expands the existing conditional to always run
`clearImageResources()` — fine because the function itself early-exits if
`trackedObjectUrls` is empty, and is a no-op if `baseImage.value` is null.
Actually it doesn't early-exit — let's read its body again:

```ts
function clearImageResources() {
  for (const url of trackedObjectUrls) URL.revokeObjectURL(url)
  trackedObjectUrls.clear()
  imageElementCache.clear()
  baseImage.value = null
}
```

It's safe to call unconditionally (no observable side effect when state is
already empty). Keep `resetDrawingState()` and `hasImage.value = false`
guarded by `if (hasImage.value)` so we don't blow away an empty canvas — wait,
they're fine. The existing pattern resets drawing state regardless when
loading a saved project (preserving intent). Match it: run all three lines
unconditionally:

```ts
clearImageResources()
resetDrawingState()
hasImage.value = false
resetStripState()
```

(The existing `resetStripState()` call is at line 1824 already.)

**Verify**: After edit, `grep -n 'hasImage.value) {' app/pages/index.vue` returns 0 matches in the loadSavedProject function block.

### Step 2: Register the new object URLs in trackedObjectUrls

Around line 1835, replace:

```ts
const objectUrl = URL.createObjectURL(await (await fetch(saved.baseImage.dataUrl)).blob())
baseImage.value = { objectUrl, image: img }
```

with:

```ts
const objectUrl = URL.createObjectURL(await (await fetch(saved.baseImage.dataUrl)).blob())
trackedObjectUrls.add(objectUrl)
baseImage.value = { objectUrl, image: img }
```

And around line 1843, replace:

```ts
const layerObjectUrl = URL.createObjectURL(await (await fetch(layer.dataUrl)).blob())
const placement = computeLayerPlacement(layer.naturalWidth, layer.naturalHeight, canvas.width, canvas.height)
annotations.value = [...annotations.value, {
  type: 'image',
  id: layer.id,
  objectUrl: layerObjectUrl,
  ...placement,
}]
registerImageElement(layer.id, layerImg, layerObjectUrl)
```

with:

```ts
const layerObjectUrl = URL.createObjectURL(await (await fetch(layer.dataUrl)).blob())
trackedObjectUrls.add(layerObjectUrl)
const placement = computeLayerPlacement(layer.naturalWidth, layer.naturalHeight, canvas.width, canvas.height)
annotations.value = [...annotations.value, {
  type: 'image',
  id: layer.id,
  objectUrl: layerObjectUrl,
  ...placement,
}]
registerImageElement(layer.id, layerImg, layerObjectUrl)
```

(The `registerImageElement` call at the end, when given a non-null
`objectUrl`, already calls `trackedObjectUrls.add(objectUrl)` per
`pages/index.vue:801`. So strictly only the base URL needs the explicit
register; the layer URL is covered by `registerImageElement`. However, the
explicit `trackedObjectUrls.add(layerObjectUrl)` is harmless *and* makes the
intent visible. Either approach is acceptable. The plan calls for adding it
explicitly for both — clarity over micro-optimization.)

**Verify**: After edit, `grep -n 'URL.createObjectURL' app/pages/index.vue` returns 6 matches (one for `trackedObjectUrls.add` follows each).

### Step 3: Defensive revocation on early errors

The function has a `try` block around the image load (lines 1831 and 1877)
where any failure logs and assigns an error. Inside the layer loop, each
layer is `try`-wrapped individually. Add explicit revocation of any URLs
created so far if `loadImageElement` throws:

Add this just before line 1879 (the catch):

```ts
} catch (err) {
  console.error('Failed to load saved project:', err)
  // Revoke any URLs we created during this load attempt before bailing.
  for (const url of [...trackedObjectUrls]) {
    if (!url.startsWith('blob:')) continue
    URL.revokeObjectURL(url)
    trackedObjectUrls.delete(url)
  }
  quotaError.value = 'Could not load saved project.'
}
```

(This is overly defensive for the happy path where `clearImageResources`
at function entry has nothing to revoke; in practice the `catch` only
fires if `loadImageElement` rejects after we've created at least one URL.
Keep the loop cheap — it iterates an already-empty set most of the time.)

Note: removing the URL-prefix check yields simpler code if you prefer; the
extra `startsWith` guard avoids accidentally revoking blob URLs that came
from outside the function (none today, but cheap insurance).

**Verify**: After edit, the catch block contains a for-loop and a
`URL.revokeObjectURL` call.

### Step 4: Add a regression test

Create `tests/unit/object-url-lifecycle.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('object URL lifecycle in loadSavedProject', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('revokes previously tracked URLs before allocating new ones', () => {
    const tracked = new Set<string>()
    const revoked: string[] = []
    const stubCreate = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const u = `blob:test/${Math.random()}`
      tracked.add(u)
      return u
    })
    const stubRevoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => {
      revoked.push(u)
      tracked.delete(u)
    })

    // simulate two saves
    const u1 = stubCreate(undefined as unknown as Blob)
    tracked.add(u1)
    const u2 = stubCreate(undefined as unknown as Blob)
    tracked.add(u2)

    // simulate clearImageResources
    for (const url of tracked) URL.revokeObjectURL(url)
    tracked.clear()

    expect(revoked).toEqual(expect.arrayContaining([u1, u2]))
    expect(tracked.size).toBe(0)
  })
})
```

This pins the contract: creating a URL must be followed by
`trackedObjectUrls.add`, and the revocation helper iterates the set and
clears it. It doesn't verify the *placement* of those calls inside the
function — that's the executor's manual smoke (Step 5).

**Verify**: `pnpm test --run tests/unit/object-url-lifecycle.test.ts` exits 0 with 1 passing test.

### Step 5: Manual smoke (optional)

```sh
pnpm dev
```

In the browser DevTools console:

```js
performance.measureUserAgentSpecificMemory() // may not exist on stable
console.log('initial:', document.body.innerHTML.length)
```

Save 5 distinct projects (different content/labels), then load each in
succession via the Saves panel. DevTools → Memory → "Take heap snapshot"
before the first load and after the fifth. The "Detached HTMLImageElement"
count should not exceed the per-snapshot increase by more than 1 per
project (one residual is acceptable due to in-flight rendering; more
indicates a leak). If the test environment doesn't expose this, document
the limitation and rely on Step 4.

## Test plan

- **New test**: `tests/unit/object-url-lifecycle.test.ts` — pins the create/track/revoke contract via mocked `URL.createObjectURL`/`revokeObjectURL`.
- **Optional manual**: heap snapshot before/after five sequential loads.
- **Verification**: `pnpm typecheck && pnpm lint && pnpm test` all exit 0.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (now 13 tests passing: 11 from prior plans + 2 from this one if you count the touch-listener and undo-history tests, or just 1 for this plan alone)
- [ ] `grep -n 'trackedObjectUrls.add' app/pages/index.vue` returns ≥ 4 matches (registered was used in 3 other places, now in `loadSavedProjectIntoCanvas` too — count ≥ 4 means base + each layer)
- [ ] `grep -n 'URL.revokeObjectURL' app/pages/index.vue` returns ≥ 5 matches (existing ones plus the new defensive loop)
- [ ] No files outside `app/pages/index.vue` and the new test file are modified (`git status`)
- [ ] `advisor-plans/README.md` status row updated to **DONE**

## STOP conditions

Stop and report back (do not improvise) if:

- The `registerImageElement(layer.id, layerImg, layerObjectUrl)` call at the
  end of the layer loop already adds the URL to `trackedObjectUrls` (per
  the existing line 801), making Step 2's second `trackedObjectUrls.add`
  a no-op duplicate. Proceed with the duplicate anyway — it's harmless
  and the next reviewer will thank you for the explicit intent.
- The `loadImageElement` chain throws immediately for any saved project
  after this change (regression on the happy path). The defensive catch
  block in Step 3 is the likely culprit — revert Step 3 and report.
- The `if (hasImage.value)` conditional inside loadSavedProject is the
  load-bearing path for an unrelated use case (e.g. the editor's debounced
  state). Re-add the conditional and STOP.

## Maintenance notes

- This plan brings all object URL allocations under a single revocation
  policy (`trackedObjectUrls` set, drained by `clearImageResources`). Any
  future feature that adds an image — e.g. clipboard paste of an SVG, a
  sticker pack picker — must follow the same `registerImageElement` or
  `trackedObjectUrls.add` step.
- The deferred monolith refactor (audit finding #11) should extract
  `clearImageResources` + `trackedObjectUrls` + `imageElementCache` into
  a `useImageResources()` composable. Until then, keep them flat in
  `pages/index.vue`.
- A weaker alternative — never storing object URLs in the saved project
  schema in the first place and re-decoding from the data URL on load —
  would eliminate the leak entirely. Out of scope here because it would
  require a project-schema migration. Worth a future direction item.
