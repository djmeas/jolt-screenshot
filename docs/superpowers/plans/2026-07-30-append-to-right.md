# Append To The Right Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users chain pasted/uploaded screenshots into one wide strip ("Append to right"), with optional numbered circle labels at the top-left of each image, persisted via the existing localStorage auto-save.

**Architecture:** Flatten-on-append: the current base image + 8px white gap + new image are composited onto a new canvas, which becomes the new `baseImage`. Only segment boundaries (`{ x, width }[]`) are kept for label rendering. Annotations, export, zoom, and thumbnails are untouched. The save schema gains one optional `strip` field — no storage version bump.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS, HTML5 Canvas.

**Spec:** `docs/superpowers/specs/2026-07-30-append-to-right-design.md`

## Global Constraints

- **No test runner exists in this repo** (no `test` script in `package.json`). Automated verification for every task = `pnpm build` exits 0. Manual verification via `pnpm dev` happens in Task 6.
- `ref` / `computed` / `nextTick` are Nuxt auto-imports — no import statements needed in `index.vue`.
- Styling follows the existing pattern: Tailwind classes with `:class="[isDark ? '...' : '...']"` ternaries.
- All edits are in `app/pages/index.vue` and `app/composables/useProjectStorage.ts`, plus one README line in Task 6.
- Appending is **not undoable**; never touch `annotationHistory` in append code.
- Labels are drawn on the main canvas in `redrawCanvas`, after `drawAnnotations`. Do not bake labels into the composite base image.
- Do not bump `STORAGE_VERSION` — the new save field is optional and backward compatible.
- Frequent commits: one commit per task.

---

### Task 1: Strip state, persistence schema, and reset rules

Lays the foundation: the `SavedStrip` schema in the storage composable, the strip refs in the page, save/restore wiring, and a `resetStripState()` helper called from every teardown path. No visible behavior change yet, so it is a safe first commit.

**Files:**
- Modify: `app/composables/useProjectStorage.ts:39-50` (`SavedProject` type), `:154-165` (`BuildSaveInput`), `:167-183` (`saveProject`)
- Modify: `app/pages/index.vue:97-98` (state refs), `:656-660` (`replaceWithImage`), `:742-747` (`clearAnnotations`), `:1377-1388` (`performSave` saveProject call), `:1432-1481` (`loadSavedProjectIntoCanvas`)

**Interfaces:**
- Consumes: existing `saveProject`, `BuildSaveInput`, `SavedProject` in `useProjectStorage.ts`; existing `baseImage`, `hasImage`, `performSave` in `index.vue`.
- Produces (used by all later tasks):
  - `SavedStripSegment = { x: number, width: number }` and `SavedStrip = { segments: SavedStripSegment[], labelsEnabled: boolean }` (exported from `useProjectStorage.ts`)
  - `SavedProject.strip?: SavedStrip`, `BuildSaveInput.strip?: SavedStrip`
  - `STRIP_GAP` (const, `8`)
  - `stripSegments: Ref<{ x: number, width: number }[]>` — empty means no strip
  - `labelsEnabled: Ref<boolean>` (default `true`)
  - `sessionLabelDefault: Ref<boolean>` (default `true`)
  - `resetStripState(): void`

- [ ] **Step 1: Add the `SavedStrip` schema to the storage composable**

In `app/composables/useProjectStorage.ts`, immediately after the `SavedBaseImage` type (line 30), insert:

```ts
export type SavedStripSegment = {
  x: number
  width: number
}

export type SavedStrip = {
  segments: SavedStripSegment[]
  labelsEnabled: boolean
}
```

In the same file, add the optional field to `SavedProject` (after line 48 `annotations: unknown[]`):

```ts
  strip?: SavedStrip
```

Add it to `BuildSaveInput` (after line 162 `annotations: unknown[]`):

```ts
  strip?: SavedStrip
```

And pass it through in `saveProject`'s `project` object literal (after line 181 `annotations: input.annotations,`):

```ts
    strip: input.strip,
```

- [ ] **Step 2: Add strip state refs to the page**

In `app/pages/index.vue`, immediately after line 98 (`const pendingPasteFile = ref<File | null>(null)`), insert:

```ts
// Append-to-right strip state
const STRIP_GAP = 8
const stripSegments = ref<{ x: number, width: number }[]>([])
const labelsEnabled = ref(true)
const sessionLabelDefault = ref(true)

function resetStripState() {
  stripSegments.value = []
  labelsEnabled.value = sessionLabelDefault.value
}
```

- [ ] **Step 3: Reset strip state in `replaceWithImage`**

In `replaceWithImage` (`app/pages/index.vue:656`), change the opening lines from:

```ts
async function replaceWithImage(fileOrUrl: File | string) {
  clearImageResources()
```

to:

```ts
async function replaceWithImage(fileOrUrl: File | string) {
  clearImageResources()
  resetStripState()
```

- [ ] **Step 4: Reset strip state in `clearAnnotations`**

In `clearAnnotations` (`app/pages/index.vue:742`), change:

```ts
  cancelPasteDialog()
  closeToolbarMenu()
  clearImageResources()
  resetDrawingState()
```

to:

```ts
  cancelPasteDialog()
  closeToolbarMenu()
  clearImageResources()
  resetDrawingState()
  resetStripState()
```

- [ ] **Step 5: Include strip in `performSave`**

In `performSave` (`app/pages/index.vue:1377`), change the `saveProject({...})` call from:

```ts
      baseImage: baseImageData,
      layers,
      annotations: JSON.parse(JSON.stringify(annotations.value)),
      settings: buildSavedSettings(),
```

to:

```ts
      baseImage: baseImageData,
      layers,
      annotations: JSON.parse(JSON.stringify(annotations.value)),
      strip: stripSegments.value.length > 1
        ? { segments: stripSegments.value.map(s => ({ ...s })), labelsEnabled: labelsEnabled.value }
        : undefined,
      settings: buildSavedSettings(),
```

(`undefined` keys are dropped by `JSON.stringify`, so single-image saves stay byte-identical.)

- [ ] **Step 6: Restore strip in `loadSavedProjectIntoCanvas`**

In `loadSavedProjectIntoCanvas` (`app/pages/index.vue:1432`), change:

```ts
  if (hasImage.value) {
    clearImageResources()
    resetDrawingState()
    hasImage.value = false
  }
```

to:

```ts
  if (hasImage.value) {
    clearImageResources()
    resetDrawingState()
    hasImage.value = false
  }
  resetStripState()
```

Then, after the settings restore block (lines 1474-1477, `strokeColor.value = ...` through `emojiSize.value = ...`), insert:

```ts
    if (saved.strip && saved.strip.segments.length > 1) {
      stripSegments.value = saved.strip.segments.map(s => ({ ...s }))
      labelsEnabled.value = saved.strip.labelsEnabled
    }
```

- [ ] **Step 7: Verify build passes**

Run: `pnpm build`
Expected: exits 0 (the new `strip` field is unused-but-typed; Nuxt/TS compiles cleanly).

- [ ] **Step 8: Commit**

```bash
git add app/composables/useProjectStorage.ts app/pages/index.vue
git commit -m "Add strip state and persistence schema for append-to-right"
```

---

### Task 2: `appendImageToRight` compositing

The core layout algorithm: composite current base + white gap + new image onto a wider canvas, swap in the composite as the new `baseImage`, record the segment boundary, and re-fit the view. Not yet wired to any UI.

**Files:**
- Modify: `app/pages/index.vue` (insert after `addImageAsLayer`, around `:712`)

**Interfaces:**
- Consumes: `STRIP_GAP`, `stripSegments`, `labelsEnabled`, `sessionLabelDefault`, `resetStripState` (Task 1); existing `getCanvas`, `baseImage`, `hasImage`, `loadImageElement`, `trackedObjectUrls`, `resetZoom`, `redrawCanvas`, `updateCanvasDisplaySize`, `playImageSlamEffect`, `scheduleAutoSave`.
- Produces:
  - `appendImageToRight(file: File): Promise<void>` — called by Task 3's dialog handler.

- [ ] **Step 1: Implement `appendImageToRight`**

In `app/pages/index.vue`, immediately after the closing brace of `addImageAsLayer` (line 712), insert:

```ts
async function appendImageToRight(file: File) {
  const canvas = getCanvas()
  const base = baseImage.value
  if (!canvas || !base || !hasImage.value) return
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    const oldWidth = canvas.width
    const oldHeight = canvas.height
    const newWidth = oldWidth + STRIP_GAP + img.naturalWidth
    const newHeight = Math.max(oldHeight, img.naturalHeight)

    const composite = document.createElement('canvas')
    composite.width = newWidth
    composite.height = newHeight
    const cctx = composite.getContext('2d')
    if (!cctx) throw new Error('no-2d-context')
    cctx.fillStyle = '#ffffff'
    cctx.fillRect(0, 0, newWidth, newHeight)
    cctx.drawImage(base.image, 0, 0, oldWidth, oldHeight)
    cctx.drawImage(img, oldWidth + STRIP_GAP, 0)
    URL.revokeObjectURL(objectUrl)

    const compositeImg = await loadImageElement(composite.toDataURL('image/png'))
    if (base.objectUrl) {
      URL.revokeObjectURL(base.objectUrl)
      trackedObjectUrls.delete(base.objectUrl)
    }
    canvas.width = newWidth
    canvas.height = newHeight
    baseImage.value = { objectUrl: null, image: compositeImg }
    if (stripSegments.value.length === 0) {
      stripSegments.value = [{ x: 0, width: oldWidth }]
    }
    stripSegments.value = [...stripSegments.value, { x: oldWidth + STRIP_GAP, width: img.naturalWidth }]
    labelsEnabled.value = sessionLabelDefault.value
    resetZoom()
    redrawCanvas()
    nextTick(() => {
      updateCanvasDisplaySize()
      playImageSlamEffect('full')
    })
    scheduleAutoSave()
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    console.error('Failed to append image:', err)
  }
}
```

Key details:
- The composite is drawn from `base.image` (never the on-screen canvas), so labels and annotations are **not** baked in.
- `drawImage(base.image, 0, 0, oldWidth, oldHeight)` mirrors `redrawCanvas`'s stretch so a restored save with mismatched natural/canvas size still composites correctly.
- `labelsEnabled` is re-read from `sessionLabelDefault` on every append, which is how the dialog checkbox (Task 3) takes effect.
- `URL.revokeObjectURL` in both paths is intentional — revoking an already-revoked URL is a harmless no-op.
- No `pushAnnotationState()` and no `projectId` change: appends are not undoable and continue the same project.

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add appendImageToRight compositing"
```

---

### Task 3: Paste dialog — "Append to right" button + labels checkbox

Wires the feature to the user: the existing paste/upload dialog gains the third action and the labels checkbox.

**Files:**
- Modify: `app/pages/index.vue` (`confirmAddImageLayer` around `:735-740`; dialog template around `:2784-2816`)

**Interfaces:**
- Consumes: `appendImageToRight` (Task 2); existing `pendingPasteFile`, `cancelPasteDialog`, `sessionLabelDefault` (Task 1).
- Produces:
  - `confirmAppendImage(): Promise<void>` — dialog click handler.

- [ ] **Step 1: Add the `confirmAppendImage` handler**

In `app/pages/index.vue`, immediately after `confirmAddImageLayer` (the function ending around line 740), insert:

```ts
async function confirmAppendImage() {
  const file = pendingPasteFile.value
  if (!file) return
  cancelPasteDialog()
  await appendImageToRight(file)
}
```

- [ ] **Step 2: Update the dialog copy**

In the dialog template (line 2787-2789), change:

```html
          <p class="mt-2 text-sm" :class="[isDark ? 'text-zinc-400' : 'text-slate-600']">
            An image is already loaded. Replace it or add the new image as a layer on top?
          </p>
```

to:

```html
          <p class="mt-2 text-sm" :class="[isDark ? 'text-zinc-400' : 'text-slate-600']">
            An image is already loaded. Replace it, append it to the right as a sequence, or add it as a layer on top?
          </p>
```

- [ ] **Step 3: Add the labels checkbox and Append button**

In the dialog template, replace the button container (lines 2790-2814):

```html
          <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="confirmReplaceImage"
            >
              Replace
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              @click="confirmAddImageLayer"
            >
              Add as layer
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100']"
              @click="cancelPasteDialog"
            >
              Cancel
            </button>
          </div>
```

with:

```html
          <label class="mt-4 flex items-center gap-2 text-sm cursor-pointer select-none" :class="[isDark ? 'text-zinc-300' : 'text-slate-700']">
            <input v-model="sessionLabelDefault" type="checkbox" class="w-4 h-4 rounded accent-indigo-600" />
            Add numbered labels (1, 2, 3…)
          </label>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="confirmReplaceImage"
            >
              Replace
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              @click="confirmAppendImage"
            >
              Append to right
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="confirmAddImageLayer"
            >
              Add as layer
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100']"
              @click="cancelPasteDialog"
            >
              Cancel
            </button>
          </div>
```

Notes:
- The checkbox `v-model`s `sessionLabelDefault` directly, so the choice is remembered for the session and read by `appendImageToRight`. It only affects Append; Replace and Add as layer ignore it (no behavior change needed for them).
- "Add as layer" is demoted from indigo to the secondary style so Append is the single emphasized action.

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add append-to-right action and labels checkbox to paste dialog"
```

---

### Task 4: Label rendering in `redrawCanvas`

Draws the numbered white circles at the top-left of each segment, after annotations, only when a strip exists and labels are enabled.

**Files:**
- Modify: `app/pages/index.vue` (`redrawCanvas` at `:499-507`; insert `drawStripLabels` after `drawAnnotations` at `:497`)

**Interfaces:**
- Consumes: `stripSegments`, `labelsEnabled` (Task 1); existing `getCanvas`.
- Produces:
  - `drawStripLabels(ctx: CanvasRenderingContext2D): void` — called from `redrawCanvas`; reused nowhere else.

- [ ] **Step 1: Implement `drawStripLabels`**

In `app/pages/index.vue`, immediately after the closing brace of `drawAnnotations` (line 497), insert:

```ts
function drawStripLabels(ctx: CanvasRenderingContext2D) {
  const canvas = getCanvas()
  if (!canvas || stripSegments.value.length < 2 || !labelsEnabled.value) return
  const radius = Math.min(28, Math.max(14, canvas.height * 0.03))
  const inset = radius * 0.75 + 6
  ctx.save()
  for (let i = 0; i < stripSegments.value.length; i++) {
    const seg = stripSegments.value[i]!
    const cx = seg.x + inset + radius
    const cy = inset + radius
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#18181b'
    ctx.stroke()
    ctx.fillStyle = '#18181b'
    ctx.font = `bold ${Math.round(radius)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), cx, cy)
  }
  ctx.restore()
}
```

- [ ] **Step 2: Call it from `redrawCanvas`**

In `redrawCanvas` (lines 505-507), change:

```ts
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(base.image, 0, 0, canvas.width, canvas.height)
  drawAnnotations(ctx)
```

to:

```ts
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(base.image, 0, 0, canvas.width, canvas.height)
  drawAnnotations(ctx)
  drawStripLabels(ctx)
```

Placement is deliberate: after annotations so labels stay legible, before the move-mode handles and draw previews (ephemeral UI stays on top). The navigator thumbnail (`drawNavigatorThumbnail`, `:393`) intentionally does **not** call it — the navigator is a viewport aid, not the export.

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue
git commit -m "Render numbered strip labels on canvas"
```

---

### Task 5: Toolbar Labels toggle

A toggle button, visible only when a strip exists, in both the desktop toolbar and the mobile overflow menu.

**Files:**
- Modify: `app/pages/index.vue` (handler near `undo` at `:126-134`; desktop toolbar group at `:2231-2242`; mobile overflow menu at `:2511-2521`)

**Interfaces:**
- Consumes: `stripSegments`, `labelsEnabled` (Task 1); existing `hasImage`, `redrawCanvas`, `scheduleAutoSave`, `closeToolbarMenu`.
- Produces:
  - `toggleStripLabels(): void`

- [ ] **Step 1: Add the `toggleStripLabels` handler**

In `app/pages/index.vue`, immediately after the `undo` function (ends line 134), insert:

```ts
function toggleStripLabels() {
  labelsEnabled.value = !labelsEnabled.value
  redrawCanvas()
  scheduleAutoSave()
}
```

- [ ] **Step 2: Add the desktop toggle button**

In the desktop "Undo / Clear / Copy" group (line 2231), insert immediately before the Undo button (line 2232):

```html
          <button
            v-if="stripSegments.length > 1"
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            :class="[labelsEnabled
              ? (isDark ? 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200')
              : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100')]"
            :disabled="!hasImage"
            title="Toggle numbered labels"
            @click="toggleStripLabels"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text></svg>
            Labels
          </button>
```

- [ ] **Step 3: Add the mobile overflow-menu toggle**

In the mobile overflow menu, insert immediately before the Undo/Clear row container (line 2511, `<div class="flex gap-2 pt-1 border-t" ...>`):

```html
          <button
            v-if="stripSegments.length > 1"
            type="button"
            class="flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            :class="[labelsEnabled
              ? (isDark ? 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200')
              : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100')]"
            :disabled="!hasImage"
            @click="toggleStripLabels(); closeToolbarMenu()"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text></svg>
            {{ labelsEnabled ? 'Hide labels' : 'Show labels' }}
          </button>
```

(The menu item closes the menu on click, matching the existing Undo menu-item behavior.)

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add toolbar toggle for strip labels"
```

---

### Task 6: Manual verification + README

Full smoke-test of the spec checklist against the dev server, plus one README feature line.

**Files:**
- Modify: `README.md:11-14` (Image loading feature list)

**Interfaces:**
- Consumes: everything above.
- Produces: verified feature.

- [ ] **Step 1: Update the README**

In `README.md`, in the "Image loading" list (after line 13, `- **Upload** – Drop a file or use the upload button to load an image`), insert:

```markdown
- **Append to right** – Chain multiple screenshots into one wide strip, with optional numbered sequence labels (1, 2, 3…)
```

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: serves at `http://localhost:3000` with no console errors.

- [ ] **Step 3: Run the spec verification checklist**

Verify each item from the spec's Testing section:

1. Paste image A → paste image B → dialog shows Replace / **Append to right** / Add as layer / Cancel + the labels checkbox → choose Append → canvas widens, B flush right of A with an 8px white gap.
2. Append a taller image → old image padded with white below; append a shorter one → new image padded below.
3. Append a third image → appended right of the second; labels read 1, 2, 3.
4. Labels: uncheck the dialog checkbox before an append → no labels; toolbar Labels toggle flips them live; Copy to Clipboard output includes labels when on, excludes them when off.
5. Reload the page → strip + label state restored; restoring from the Saves panel also restores them.
6. On a strip, paste again and choose Replace → single image; Labels toggle disappears.
7. Draw an annotation, append an image → annotation stays in place; annotations and ⌘Z undo still work after the append (append itself is not undoable).
8. Zoom in/out, Space-drag pan, and the navigator work on the wide strip.

- [ ] **Step 4: Final build check**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document append-to-right in README"
```
