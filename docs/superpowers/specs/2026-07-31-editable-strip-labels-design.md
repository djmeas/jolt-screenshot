# Editable Strip Labels — Design

**Date:** 2026-07-31
**Status:** Approved (pending user review of this spec)
**Scope:** `app/pages/index.vue` (state, hit-test, editor overlay, rendering, save/load wiring) and `app/composables/useProjectStorage.ts` (one optional field on `SavedStripSegment`). No changes to `SavesPanel.vue`, `ZoomNavigator.vue`, `ColorPickerPopover.vue`, or zoom/pan logic.

## Problem

The append-to-right feature already draws numbered labels (1, 2, 3…) at the top-left of each segment. The numbers are useful for "step 1 / step 2 / step 3" sequences, but real-world documentation often wants human-readable text (`Step 1`, `A`, `Before`, `Click submit`, etc.). The numbers are baked into the canvas on every redraw, and there is no way to customize them or even see what they say without re-importing a custom-built image.

## Goal

- Each segment's label becomes clickable on the canvas. A click opens an inline text input over the label, pre-filled with its current text (the auto-number, or the user's custom text if previously set).
- Custom text is rendered as-is: free-form, single-line, plain text.
- When the rendered text is too wide for the existing circle, the label auto-expands into a pill (rounded rectangle) that grows horizontally to fit the text (plus padding), capped only at `seg.width - inset * 2` so the pill never overflows its segment. If even at the minimum font size the text would still overflow the segment, the text is truncated with an ellipsis (`Long tex…`).
- Empty input on commit reverts the label to the auto-number.
- Custom label text persists with the project and survives reload / Saves-panel restore.
- Toggling the existing strip-wide **Labels** button hides labels (and any open editor) like today.

## Non-Goals (Out of Scope)

- Reordering, removing, or replacing individual images within a strip (inherited from `2026-07-30-append-to-right-design.md`).
- Dragging a label to a different position — labels stay anchored to their segment.
- Custom label colors, weights, or fonts — keeps the visual language consistent with the auto-number.
- Multi-line label text — single-line; ellipsize on overflow.
- Emoji in label text — rendered as plain string.
- Reverting to auto-number via a separate UI control — empty input on commit is the path.
- Pushing label edits onto the annotation undo stack (deliberate; matches "append is not undoable").
- Per-label disable — `labelsEnabled` is a strip-wide toggle.
- Any change to zoom, pan, navigator, copy, thumbnail, or save/load architecture beyond the new optional field.

## Why this approach (HTML input overlay, not a new annotation type)

The current labels are drawn on the main canvas by `drawStripLabels` (`app/pages/index.vue:557`) and never go through the annotation pipeline. They are not draggable, not selectable via the Move tool, and not undoable. Promoting them to a first-class annotation type would force the existing select/move/undo code to special-case label annotations (so users can't drag them off their segment) and pollute the annotation history with non-annotation records.

Instead, the design treats labels as **per-segment state** with a small inline editor overlaid on the canvas. This is the lightest extension that fits the existing model: rendering, hit-testing, and persistence all read from one segment record, and the editor is a transient popover that only exists while a label is being edited.

Alternatives considered:

- **Promote labels to a new `Annotation` type** — most "annotation-like", but mixes segment-anchored state with free-floating annotations. Conceptually messy; would require special cases in the move/undo code. Rejected.
- **Burn custom text into the base image at edit time** — simplest mental model, but the text becomes pixels, so saved projects can't preserve custom labels across reload. Rejected (breaks the persistence goal).

## User decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| How to edit | Inline `<input>` overlay on the canvas, focused and text-selected on open |
| Allowed content | Free-form text (any characters) |
| Long text | Expand to pill; auto-shrink font, ellipsize at min font size |
| Reset to auto-number | Empty input on commit reverts to the segment's auto-number |
| Switching labels | Click another label to commit current edit and open the new one |
| Persistence | Persist `labelText` per segment in `SavedStripSegment` |
| Tool restriction | Always editable, regardless of selected tool |

## State model

`app/pages/index.vue` adds two new refs and extends `stripSegments`:

| Name | Type | Meaning |
|------|------|---------|
| `stripSegments[].labelText` | `string` (new field) | User-provided label text, or `""` for auto-number |
| `editingLabelIndex` | `ref<number \| null>(null)` | Index of segment being edited, or `null` |
| `editingLabelDraft` | `ref<string>('')` | In-progress text in the input |

A single helper centralizes the auto-number fallback so every read site stays in sync:

```ts
function displayedLabelText(seg: { labelText: string }, i: number): string {
  return seg.labelText || String(i + 1)
}
```

`resetStripState` (`:106`) gains two lines: clear `editingLabelIndex` to `null` and `editingLabelDraft` to `''`. No commit on reset — in-flight edits are discarded, matching how text annotations behave on tool-switch.

## Rendering: pill-when-long

A new helper computes the rendered metrics once, shared by the renderer and the hit-test:

```ts
function getLabelMetrics(seg, i, ctx, radius): {
  text: string        // resolved text (custom or auto-number)
  fontSize: number    // chosen font size, may be < round(radius)
  isPill: boolean
  rect: { x: number, y: number, w: number, h: number }  // bounding box in canvas coords
}
```

**Inputs:** `seg.x`, `seg.width`, `displayedText = displayedLabelText(seg, i)`, base font size = `round(radius)`, radius as today (`clamp(14, canvas.height * 0.03, 28)`).

**Algorithm:**

1. Set `fontSize = round(radius)`, `ctx.font = "bold " + fontSize + "px sans-serif"`, measure `textWidth = ctx.measureText(displayedText).width`.
2. If `textWidth <= 2 * radius - 4` → **circle**: `isPill = false`, `rect = { x: cx - radius, y: cy - radius, w: 2 * radius, h: 2 * radius }`.
3. Else compute `pillMaxWidth = seg.width - inset * 2`, `pillPadding = radius * 0.5`. Try `pillWidth = textWidth + 2 * pillPadding`. If `pillWidth > pillMaxWidth`, shrink: drop `fontSize` by 1px (min 8), re-measure, retry. If `fontSize` hits the floor and `pillWidth > pillMaxWidth`, ellipsize: `text = truncateWithEllipsis(original, maxChars)`, re-measure once, accept whatever width that produces (it will be ≤ pillMaxWidth in practice).
4. Pill rect: `isPill = true`, `rect = { x: seg.x + inset, y: cy - radius, w: pillWidth, h: 2 * radius }`. The pill is **left-anchored** to the segment (same left edge as the circle), growing right; the right edge is bounded by `seg.x + seg.width - inset`.

**`drawStripLabels` is rewritten** to loop segments and delegate to `getLabelMetrics` for shape decisions:

- Circle path: identical to today — `ctx.arc` + `ctx.fill()` + `ctx.stroke()`, then centered text.
- Pill path: `ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, radius); ctx.fill(); ctx.stroke();` then text positioned at `(cx, cy)` with `textAlign = 'center'`.
- When `i === editingLabelIndex`, after the regular fill/stroke, draw a 2px indigo focus ring (`strokeStyle = '#6366f1'`, `lineWidth = 2`, `ctx.stroke()` over the same path) so the canvas-side connection to the overlay is obvious.

Constants:

- `LABEL_MIN_FONT = 8`
- `LABEL_PILL_PADDING_RATIO = 0.5` (pill text-to-rect padding, multiplied by radius)
- Ellipsize: trim to `Math.max(3, floor((pillMaxWidth / fontSize) * 1.5))` chars, append `…`.

## Hit-testing + inline editor

### Hit-test

A new function `hitTestLabel(canvasX, canvasY): number | null` runs **before** any tool-mode logic in the canvas mouse-down handler. It returns the segment index or `null`.

```ts
function hitTestLabel(x, y) {
  if (!labelsEnabled.value) return null
  if (editingLabelIndex.value !== null) return null  // already editing; let blur handle it
  const radius = ...
  for (let i = stripSegments.value.length - 1; i >= 0; i--) {
    const m = getLabelMetrics(stripSegments.value[i], i, ctx, radius)
    if (x >= m.rect.x && x <= m.rect.x + m.rect.w &&
        y >= m.rect.y && y <= m.rect.y + m.rect.h) return i
  }
  return null
}
```

- Walks segments in reverse so a later (right) label wins on overlap.
- Hit-test is in **canvas coordinates**, so zoom/pan are transparent. The existing `mouseDownOnCanvas` already converts `clientX/clientY` to canvas coords before dispatching; the label hit-test reuses that same converted point.
- If `editingLabelIndex` is non-null, the test returns `null` so a click on the canvas while editing does not start a draw. The `<input>`'s `@blur` handler is what closes the active edit (commit semantics).

When `hitTestLabel` returns an index:

1. If `editingLabelIndex` is already set to a different segment → call `commitLabelEdit` on the current draft first.
2. Set `editingLabelIndex = i`, `editingLabelDraft = displayedLabelText(stripSegments[i], i)`.
3. `redrawCanvas()` (to draw the focus ring).
4. `e.preventDefault(); e.stopPropagation(); return;` — no tool mode activates.

### Hover cursor

Hovering over a label changes the canvas cursor to a text I-beam (`cursor-text`) so the user can see that the label is clickable/editable. Implemented with a new `hoveredLabelIndex: ref<number | null>(null)` that is updated on every mousemove (`draw` handler, after the tool-mode branches):

```ts
if (!isPanning.value) {
  const ctx = getCanvasContext()
  if (ctx) {
    const newLabelHover = hitTestLabel(x, y, ctx)
    if (newLabelHover !== hoveredLabelIndex.value) {
      hoveredLabelIndex.value = newLabelHover
    }
  }
}
```

`hitTestLabel` already early-returns `null` when `labelsEnabled` is off or an edit is open, so the hover state naturally clears in those cases.

`canvasCursorClass` returns `cursor-text` when `hoveredLabelIndex !== null` — taking priority over the per-tool cursor but yielding to active panning (`isPanning` → `cursor-grabbing`, `spacePanActive` → `cursor-grab`).

`onCanvasMouseLeave` clears `hoveredLabelIndex` so the cursor resets when the mouse leaves the canvas.

### Editor overlay

A single `<input>` element is rendered in the template, **always present in the DOM** and toggled with `v-show` (so it can be focused without remount):

```html
<input
  v-show="editingLabelIndex !== null"
  ref="labelEditorInput"
  v-model="editingLabelDraft"
  class="absolute z-20 ..."
  :style="labelEditorStyle"
  @keydown.enter.prevent="commitLabelEdit()"
  @keydown.escape.prevent="cancelLabelEdit()"
  @keydown.tab.prevent="onLabelEditorTab($event)"
  @blur="commitLabelEdit()"
/>
```

`labelEditorStyle` is a computed that returns the input's left/top/width/height/font-size in CSS, derived from the active segment's `getLabelMetrics` rect converted to screen pixels (multiply by the canvas display scale, add the canvas wrapper's `getBoundingClientRect` left/top). The computed depends on `editingLabelDraft` so the input grows as the user types — `getLabelMetrics` is called with a synthetic segment whose `labelText` is the current draft, so what the user sees in the input matches exactly what will be rendered on commit. Capped at the segment width (existing `maxPillWidth` cap in `getLabelMetrics`); the user can still type past the cap, but the input stops growing.

A `watch(editingLabelIndex)` callback, or a `nextTick` after the index is set, focuses the input and selects its text:

```ts
await nextTick()
labelEditorInput.value?.focus()
labelEditorInput.value?.select()
```

### Commit / cancel

```ts
function commitLabelEdit() {
  const i = editingLabelIndex.value
  if (i == null) return
  const next = editingLabelDraft.value.trim()
  if (next !== stripSegments.value[i].labelText) {
    stripSegments.value[i] = { ...stripSegments.value[i], labelText: next }
  }
  editingLabelIndex.value = null
  editingLabelDraft.value = ''
  redrawCanvas()
  scheduleAutoSave()
}

function cancelLabelEdit() {
  editingLabelIndex.value = null
  editingLabelDraft.value = ''
  redrawCanvas()
}
```

- Whitespace: leading/trailing spaces are trimmed. Internal whitespace preserved.
- Empty string after trim: stored as `""`, which means "auto-number".
- No-op commits (text unchanged) still clear the editor state, redraw, and skip the save.

### Tab navigation

`onLabelEditorTab` commits the current edit and opens the next segment's editor, wrapping at the end:

```ts
function onLabelEditorTab(e: KeyboardEvent) {
  const i = editingLabelIndex.value
  if (i == null) return
  const total = stripSegments.value.length
  const next = e.shiftKey ? (i - 1 + total) % total : (i + 1) % total
  commitLabelEdit()
  // after commit, open next
  editingLabelIndex.value = next
  editingLabelDraft.value = displayedLabelText(stripSegments.value[next], next)
  redrawCanvas()
  nextTick(() => labelEditorInput.value?.focus())
}
```

## Persistence

### Schema (`useProjectStorage.ts`)

`SavedStripSegment` gains an optional field:

```ts
export type SavedStripSegment = {
  x: number
  width: number
  labelText?: string
}
```

`SavedProject.strip` is already optional, so pre-feature saves keep loading. **No `STORAGE_VERSION` bump**, matching the existing precedent for `SavedStrip` itself.

### Save (`performSave` in `index.vue`, `:1562`)

The current segment map is extended to include the field. Single-line change:

```ts
strip: stripSegments.value.length > 1
  ? { segments: stripSegments.value.map(s => ({ ...s, labelText: s.labelText ?? '' })), labelsEnabled: labelsEnabled.value }
  : undefined,
```

Strip is always written when the project is a strip, regardless of whether any segment has custom text. Keeps the rule simple.

### Load (`loadSavedProjectIntoCanvas` in `index.vue`, `:1660`)

Extend the segment map to copy `labelText` (defaulting to `""` for legacy saves):

```ts
stripSegments.value = saved.strip.segments.map(s => ({
  x: s.x,
  width: s.width,
  labelText: s.labelText ?? '',
}))
```

`labelsEnabled` restore is unchanged.

### Reset rules

`resetStripState` (`:106`) clears segments, restores `labelsEnabled`, and clears `editingLabelIndex` + `editingLabelDraft` (no commit). It is called from:

- `replaceWithImage` (`:656`) — Replace starts a fresh single image.
- `clearAnnotations` / Clear flow (`:742`) — Clear / New Project.
- `loadSavedProjectIntoCanvas` (`:1432`) — before restoring the loaded project's own strip state.

If a label editor is open when any of these run, the in-flight edit is discarded (no commit) and the input is hidden. This matches the existing behavior of text annotations on tool-switch.

### Thumbnails and copy

`drawStripLabels` runs on every `redrawCanvas`, and the copy-to-clipboard pipeline (`copyToClipboard`) and the auto-save thumbnail (`makeThumbnailFromCanvas`) both draw the canvas. Custom text comes through for free. No code change in those paths.

### Undo

Label edits are **not** pushed onto `annotationHistory`. The annotation undo stack is for annotation operations; labels are segment-level state, not annotations. This matches the prior decision that "append is not undoable". If the user wants to revert, they edit the field back. (Documented as a non-goal so the choice is visible.)

## Interactions (unchanged behaviors)

- **Undo (⌘Z):** annotation history unaffected by label edits.
- **Add as layer** after a strip exists: unchanged — layers are independent movable annotations.
- **Replace on a strip:** wipes the strip back to a single image; in-flight label edit discarded.
- **Zoom / pan / navigator / copy / thumbnail:** no changes — they read canvas dimensions and draw the canvas, both of which transparently include custom labels.
- **Toolbar Labels toggle:** when toggled off while editing, `editingLabelIndex` is cleared (no commit) and the input is hidden. When toggled back on, no editor reopens.

## Error handling

- **Image load failure on append:** unchanged (mirrors `addImageAsLayer`, `:687`).
- **Storage quota on auto-save:** existing quota handling in `performSave` applies unchanged. Custom text is a small string per segment, so save size grows negligibly.
- **Editor open during canvas resize / zoom change:** `labelEditorStyle` recomputes from the live canvas metrics; the input tracks the new size. If the input would go off-screen, it gets clipped by the wrapper — acceptable.
- **`editingLabelIndex` pointing at a stale segment after a reset:** the reset path clears the index, so this cannot happen.

## Testing

No test framework exists in this project. Verification is a manual smoke-test checklist run against `pnpm dev`, on top of the existing append-to-right checks (1–8 in `2026-07-30-append-to-right-design.md`):

1. Click a numbered label → input overlay appears positioned over the label with text selected. Type `Step 1` → Enter → label renders as `Step 1` in a pill (text wider than the circle).
2. Click the same label → input pre-fills with `Step 1`. Clear the field, blur → label reverts to the auto-number `1` in a circle.
3. Click label 1, type `A`, then click label 2 without pressing Enter → label 1 commits as `A`, label 2 opens for editing. Two separate custom labels, both rendered.
4. Click a label, press Esc → no change to the segment; overlay closes.
5. Type a 30-character string in a label → font shrinks and text ellipsizes to fit the pill cap; pill never overflows the segment horizontally.
6. Edit a label, wait for auto-save, reload the page → custom text restored.
7. Edit a label, then click **Clear** → in-flight edit discarded; `stripSegments` cleared; `editingLabelIndex` null. No stale overlay.
8. Edit a label, then click **Replace** in the paste dialog → in-flight edit discarded; `stripSegments` cleared; new image is a single segment.
9. With labels toggle off, click where a label would be → no edit overlay (label hit-test is gated on `labelsEnabled`).
10. Zoom in 200%, click a label → input is positioned correctly at the new screen size; type → canvas re-renders with the new font scaled to zoom.
11. Copy the canvas to clipboard while a label says `Step 1` → clipboard image contains `Step 1` rendered, not the auto-number.
12. Save the project, reload via Saves panel → custom labels restored.
13. Existing append-to-right checks 1–8 still pass.
