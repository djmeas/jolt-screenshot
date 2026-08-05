# Sequence Numbers Tool — Design

**Date:** 2026-08-05
**Status:** Approved (pending user review of this spec)
**Scope:** `app/pages/index.vue` — new tool mode + annotation type, placement flow, move/delete integration, toolbar button, keyboard shortcut, rendering. No changes to composables, `SavesPanel.vue`, `ZoomNavigator.vue`, `ColorPickerPopover.vue`, or zoom/pan logic.

## Problem

The app can annotate with pen, arrow, box, emoji, text, and images, but has no way to drop numbered callouts directly onto the canvas. Users documenting screenshots often want sequential "1, 2, 3…" markers at arbitrary points. Currently the only numbering is the segment-strip labels baked into the append-to-right layout, which are segment-anchored and not free-floating.

Additionally, there is **no way to delete an individual annotation** in the app (only "Clear all"). This feature needs deletion for sequence numbers (to trigger renumbering), and designing the delete affordance as a general capability benefits every annotation type.

## Goal

- A new top-nav tool, **Sequence Numbers** (in the tool strip, following pen/arrow/box/emoji/text/move), with keyboard shortcut **7**.
- When selected, a click on the canvas places a **white filled circle with a black number** centered at the click point.
- Numbers come from a running sequence: the first placed is `1`, then `2`, `3`, … Numbers are **derived on the fly** from array order (see Numbering below). There is no stored counter and no stored per-label number.
- Deleting an existing sequence number renumbers the remaining ones so they stay contiguous: with `1 2 3 4 5`, deleting the 3rd yields `1 2 3 4` (the former 4th and 5th become 3rd and 4th).
- Sequence numbers are selectable and **draggable in Move mode**, and **deletable** there with the Delete/Backspace key.
- Sequence numbers persist with the project (plain serialized annotations) and survive reload / Saves-panel restore, with numbers recomputed from array order on load.
- Sequence numbers participate in undo (`pushAnnotationState`), and undo of a delete restores correct numbering.

## Non-Goals (Out of Scope)

- Adjustable circle size in the UI — fixed default radius (≈28px canvas units, consistent with the strip-label ballpark).
- Styling options for the circles — always white circle with black number; the global `strokeColor` and `strokeWidth` do **not** affect them.
- Reordering sequence labels independently of the placement order — numbering follows array order.
- Numbering that "remembers" higher values after deletion (monotonic high-water counter) — deliberately rejected; numbers always re-derive contiguously.
- Dragging a sequence number to reorder it in the sequence (numbers follow array order; dragging only moves x/y).
- Any change to zoom, pan, navigator, copy, thumbnail, or save/load architecture.

## Approach

**Add `sequence` as a first-class annotation type in the existing single `annotations` array**, with the number derived at render time. This is Approach A from the brainstorming session.

Why derived (not stored): there is no separate counter or `number` field to drift out of sync during delete, undo, or load. Renumbering is a pure function of array order, so it is always correct by construction. The array order is exactly the placement order, which is what the sequence semantics require.

Alternatives considered and rejected:
- **Stored `number` field + renumber pass on delete** — more mutable state to keep consistent across delete/undo/load; the renumber pass is needed anyway, so it adds code without adding safety.
- **Separate `sequenceLabels` collection** — duplicates the move/hit-test/undo/export/save code paths that already operate uniformly over the single `annotations` array.

## User Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Delete mechanism | General delete in Move mode via Delete/Backspace key, which renumbers sequence labels when a sequence annotation is removed |
| Numbering after delete | Pure re-derive on the fly — always contiguous `1..N`, next placed number is `count + 1` |
| Circle color | Always a white circle with a black number (independent of `strokeColor`) |
| Circle size | Fixed default size, no resize via handles, no slider |
| Move behavior | Draggable in Move mode (reposition only), Delete/Backspace removes |

## State Model

`app/pages/index.vue`:

- Extend the tool union:
  `const toolMode = ref<'pen' | 'arrow' | 'box' | 'emoji' | 'text' | 'move' | 'sequence'>('pen')`
- Add annotation type to the union (no new module/class):
  `type SequenceAnnotation = { type: 'sequence', x: number, y: number, radius: number }`
- One constant for the fixed default radius, e.g. `const SEQ_RADIUS = 28`.
- No new refs required for the feature itself. The existing `pushAnnotationState`, `annotations`, `redrawCanvas`, and move-mode state all apply unchanged.
- Add `'sequence'` to `TOOL_SHORTCUTS` (`'7': 'sequence'`) and register a toolbar button.

Numbering derivation: at render time, compute each sequence annotation's number as `1 + (count of `type === 'sequence'` annotations appearing earlier in `annotations` array)`. The next number placed is `1 + total sequence count`.

## Rendering

In `drawAnnotations`, add a `sequence` branch:

- White filled circle: `ctx.fillStyle = '#ffffff'`, `beginPath`, `arc(ann.x, ann.y, ann.radius, 0, 2π)`, `fill`. A thin outline (e.g. `#111`/`rgba(0,0,0,0.35)`) keeps the white circle visible on light images.
- Black number centered: bold `sans-serif` font sized from `radius` (e.g. `~radius * 1.1`), `textAlign = 'center'`, `textBaseline = 'middle'`, `fillStyle = '#000000'`.
- The drawn text is the derived number (multi-digit numbers fit because the font scales with the radius).

The number must also render correctly in the zoom navigator thumbnail and any export path that calls `drawAnnotations` — it does automatically since it lives in `drawAnnotations`.

## Placement Flow

Add a `'sequence'` branch to the existing `onCanvasClick` handler (the click-based path already used by emoji/text):

1. `getCanvasCoords` → `{ x, y }`.
2. `pushAnnotationState()`.
3. Append `{ type: 'sequence', x, y, radius: SEQ_RADIUS }`.
4. `redrawCanvas()`.

No drag threshold, no preview — it is a click-to-place tool like emoji. `startDrawing`/`draw`/`stopDrawing` are untouched (like emoji/text, they no-op for this mode).

## Move & Delete Integration

**Move (drag):** add a `sequence` branch to `getAnnotationAt` with a circle hit-test (`Math.hypot(x - ann.x, y - ann.y) <= ann.radius`) and a `sequence` branch in `translateAnnotation` (updates `x`/`y`). Both follow the existing emoji/text pattern. Hover highlight and cursor behavior come along automatically since the move-mode hit-test path is shared.

**General delete via Delete/Backspace:** in `handleKeydown`, add a handler for `Delete` and `Backspace` (guarded against `isEditableTarget`, and only when `toolMode === 'move'`) that removes the annotation currently hovered under the pointer. This is the existing select-by-hover model (`hoveredAnnotationIndex`, set in the `draw` handler): the user points at an annotation in Move mode, sees it highlighted, and presses Delete/Backspace. The flow:

1. Only when `toolMode === 'move'` and `hoveredAnnotationIndex` is not null.
2. Target index = `hoveredAnnotationIndex.value` (fall back to `getHoveredAnnotationForMoveMode` at the last known pointer position if needed).
3. If found: `pushAnnotationState()`, `filter` it out of `annotations`, clear selection/hover state, `redrawCanvas()`.

Renumbering is automatic: removing an array element shifts the indices of subsequent sequence annotations, so their derived numbers decrease by one.

**Undo** works unchanged: `undo()` restores the pre-delete array, and derived numbers recover. No special handling needed.

## Persistence

Sequence annotations are plain JSON objects in the `annotations` array, so `useProjectStorage` serializes/restores them with no changes. On load, numbers recompute from array order — same as after any in-session delete. Old saved projects (without sequence annotations) are unaffected.

## Testing

- Add/extend unit tests in `tests/unit/` for:
  - Numbering derivation on a mixed array (sequence labels interleaved with box/text/pen) — each sequence label gets `1..N` in array order.
  - Renumbering after deleting a sequence annotation (middle, first, last) — remaining labels contiguous.
  - Renumbering after undo of a delete — labels recover to pre-delete numbers.
- Given this is a single-file SFC, extraction of the numbering/delete logic into a small pure, exported (or `@vitest`-importable) helper where feasible improves testability. Any such refactor stays within `index.vue`'s script block conventions or a `utils/` module if the existing pattern allows.
- Manual verification: place 5 numbers, delete 3rd → see 1,2,3,4; drag one in Move mode; Delete/Backspace removes; Ctrl+Z restores; reload project retains numbers.

## Risks / Notes

- **Backspace keyboard focus:** the Delete/Backspace handler must skip editable targets (`isEditableTarget`) and avoid interfering with the text/label editor inputs.
- **Indicator/positioning:** the existing `registerToolButton`/`updateToolIndicator` map must include the new mode so the animated selection indicator tracks the new button during narrow/large tooltips and menu views.
- **`setToolMode` reset:** ensure the new mode is handled in any reset/cleanup branches (e.g. closing overlays) consistently with emoji/text.
