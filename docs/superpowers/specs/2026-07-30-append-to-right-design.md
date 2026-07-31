# Append To The Right — Design

**Date:** 2026-07-30
**Status:** Approved (pending user review of this spec)
**Scope:** `app/pages/index.vue` (script + template) and `app/composables/useProjectStorage.ts` (one optional field). No changes to `SavesPanel.vue`, zoom/pan, or export logic.

## Problem

Users documenting a sequence of events (e.g. a multi-step bug, a flow) must annotate each screenshot separately or manually stitch images in another tool. There is no way to chain multiple screenshots into one wide strip inside JoltShot.

## Goal

- When pasting/uploading an image while one is loaded, the existing dialog offers a third action: **Append to right** — the new image is composited onto the right edge of the canvas, extending its width.
- Optional numbered labels (white circle, dark number: 1, 2, 3…) rendered at the top-left of each image in the strip so viewers understand the sequence.
- Labels controllable both at append time (dialog checkbox) and afterward (toolbar toggle).
- Strips persist via the existing localStorage auto-save and survive reload / Saves-panel restore.

## Non-Goals (Out of Scope)

- Appending to other edges (bottom/left/top) or freeform grid layouts.
- Undoing an append with Cmd+Z (append is one-way, like Replace; annotation undo is unaffected).
- Reordering, removing, or replacing individual images within a strip.
- Gap width or label style customization.
- Any change to zoom, pan, navigator, or annotation behavior.

## Why this approach (flatten-on-append)

The app's architecture treats `baseImage` as the single full-canvas source of truth: `redrawCanvas` draws it at `(0,0)` covering the canvas (`app/pages/index.vue:506`), export copies the backing store, and save serializes it as one dataURL. On append we therefore composite **current base + white gap + new image** onto a new canvas and make that the new `baseImage`. The only strip-specific data kept is segment boundaries (`{ x, width }[]`), which is all label rendering needs.

Alternatives considered:

- **Structured strip model** (keep each image separate, redraw all per frame): more faithful, but requires rewriting redraw/save/load/clear/copy paths. Rejected — YAGNI, since appends are one-way.
- **Locked image-layer annotations**: layers live on top of a fixed-size canvas; the canvas would not grow. Rejected — breaks the core concept.

Benefits: annotations keep their coordinates (canvas only grows right/down, never shifts content); export, thumbnails, zoom, navigator, and copy all work unchanged; the save schema gains one optional field with no storage-version bump.

## User decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Height mismatch | Keep both images at natural size, top-aligned; canvas grows to the tallest; empty space padded with background |
| Padding color | Always white |
| Label control | Both: dialog checkbox at append time + toolbar toggle afterward |
| Undo append | Not undoable; annotation undo stack unaffected |
| Image spacing | Small white gap (8px) between images |
| Persistence | Strips persist in localStorage auto-save / Saves panel |

## Append flow

Entry point: `queueImageImport` (`app/pages/index.vue:714`) already routes paste (`handlePaste`) and file upload (`handleFileSelect`) to the same dialog when an image is loaded. The dialog (`:2767`) gains:

- A third primary button **"Append to right"** alongside Replace / Add as layer / Cancel.
- A checkbox **"Add numbered labels"**, initialized from `sessionLabelDefault` (default `true`), updated on change so the choice is remembered for the session. The checkbox is always visible in the dialog but only takes effect when **Append to right** is chosen; Replace and Add as layer ignore it.

New function `appendImageToRight(file: File)`:

1. Load the file into an `HTMLImageElement` at natural size (existing `loadImageElement`, `:547`). On failure: revoke the object URL, leave all state untouched (same pattern as `addImageAsLayer`, `:687`).
2. Compute new dimensions:
   - `newWidth = canvas.width + STRIP_GAP + img.naturalWidth`
   - `newHeight = max(canvas.height, img.naturalHeight)`
   - `STRIP_GAP = 8` (px, constant).
3. Create an offscreen canvas at the new size, fill it white, draw the current base image at `(0, 0)`, draw the new image at `(canvas.width + STRIP_GAP, 0)`.
4. Load the offscreen composite back into an `HTMLImageElement` and replace `baseImage`; resize the main canvas to the new dimensions.
5. Append `{ x: oldCanvasWidth + STRIP_GAP, width: img.naturalWidth }` to `stripSegments`.
6. Set `labelsEnabled` from the dialog checkbox.
7. `resetZoom()` + `updateCanvasDisplaySize()` so the widened canvas re-fits the viewport; replay the existing image-slam effect (`full` variant); `scheduleAutoSave()`.

The first segment boundary is recorded lazily: when the first append happens, `stripSegments` becomes `[{ x: 0, width: oldCanvasWidth }, { x: …, width: … }]`. A strip "exists" when `stripSegments.length > 1`.

## Labels

**Rendering:** drawn in `redrawCanvas` *after* `drawAnnotations` (always legible, never hidden behind drawings or image layers), only when `stripSegments.length > 1 && labelsEnabled`.

**Style per segment** (index `i`, 0-based):

- White filled circle, 2px dark (`#18181b`) outline.
- Centered dark number `i + 1`, bold sans-serif, font size ≈ radius.
- Position: top-left of the segment at `(seg.x + inset, inset)`, `inset = radius * 0.75 + 6`.
- Radius scales with canvas height: `clamp(14, canvas.height * 0.03, 28)` px, so labels stay proportional on phone screenshots and 4K captures alike.

**Controls:**

- Dialog checkbox sets `labelsEnabled` at append time; `sessionLabelDefault` remembers the choice for subsequent appends in the session.
- A **Labels toggle button** (icon: circled "1") appears in the toolbar only when `stripSegments.length > 1`; clicking flips `labelsEnabled` and redraws. Active state styled like existing tool buttons; disabled when no image is loaded, consistent with other toolbar buttons.

**Export:** labels draw on the main canvas, so copy-to-clipboard and auto-save thumbnails include them automatically. Toggling off before copying omits them.

## State model

New refs in `app/pages/index.vue` (near the other image state):

| Name | Type | Meaning |
|------|------|---------|
| `stripSegments` | ref `{ x: number, width: number }[]` | Segment boundaries for label rendering. Empty = single image (no strip). |
| `labelsEnabled` | ref `boolean` | Whether labels render. Default `true`. |
| `sessionLabelDefault` | ref `boolean` | Session-remembered dialog checkbox value. Default `true`. |
| `STRIP_GAP` | const `number` | 8px white gap between appended images. |

## Persistence

`useProjectStorage.ts`:

```ts
export type SavedStrip = {
  segments: { x: number, width: number }[]
  labelsEnabled: boolean
}

// SavedProject gains:
strip?: SavedStrip
```

- Optional field → pre-feature saves load fine (`strip` is `undefined` → no strip, labels on). **No `STORAGE_VERSION` bump; existing saves are not wiped.**
- `performSave` includes `strip` only when `stripSegments.length > 1`; otherwise omits it (saves stay clean for single-image projects).
- `loadSavedProjectIntoCanvas` restores `stripSegments`/`labelsEnabled` from `saved.strip`, defaulting to empty/`true`.
- `BuildSaveInput` gains the matching optional field.

## Reset rules

`stripSegments` resets to `[]` (and `labelsEnabled` to `sessionLabelDefault`) in the same paths that tear down image state today:

- `replaceWithImage` (`:656`) — Replace starts a fresh single image.
- `clearAnnotations` (`:742`) — Clear / New Project.
- `loadSavedProjectIntoCanvas` (`:1432`) — before restoring the loaded project's own strip state.

## Interactions (unchanged behaviors)

- **Undo (⌘Z):** append is not undoable; the annotation history stack is untouched by appends.
- **Add as layer** after a strip exists: unchanged — layers are independent movable annotations.
- **Replace on a strip:** wipes the strip back to a single image (the dialog already frames Replace as destructive).
- **Zoom / pan / navigator / copy / thumbnail:** no changes — they read canvas dimensions, which simply reflect the wider canvas.

## Error handling

- **Image load failure on append:** revoke object URL, keep current state, log to console (mirrors `addImageAsLayer`).
- **Storage quota on auto-save:** existing quota handling in `performSave` applies unchanged (composite dataURLs grow with strip width; quota errors surface via the existing `quotaError` UI).

## Testing

No test framework exists in this project; verification is a manual smoke-test checklist run against `pnpm dev`:

1. Paste image A → paste image B → choose **Append to right** → canvas widens, B flush right of A with an 8px white gap.
2. Append a taller image → old image padded with white below; append a shorter one → new image padded below.
3. Append a third image → appended right of the second; labels renumber 1–3.
4. Labels: checkbox unchecked → no labels; toolbar toggle flips live; labels appear in copy-to-clipboard output when on.
5. Save/reload round-trip: reload page → strip + label state restored; Saves panel restore works.
6. Replace on a strip → single image, labels/toolbar toggle gone.
7. Annotations drawn before an append stay in place; annotations + undo work after an append.
8. Zoom/pan/navigator on a wide strip behave as on any image.
