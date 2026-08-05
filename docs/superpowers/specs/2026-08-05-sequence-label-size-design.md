# Sequence Label Size — Design

**Date:** 2026-08-05
**Status:** Approved (pending user review of this spec)
**Scope:** `app/pages/index.vue` (derived radius, Row-2 control, placement, hit-test, save/load wiring), `app/utils/sequence.ts` (pure size-resolution helpers + tests), `app/composables/useProjectStorage.ts` (one new optional field on `SavedSettings`). No changes to other components or the numbering logic.

## Problem

The Sequence Numbers tool places labels at a fixed radius (`SEQ_RADIUS = 28` canvas px) baked into each annotation. On a large pasted image the labels look fine; on a small image they are proportionally much larger than intended — there is no way to adapt label size to the working image, and no way for the user to adjust it.

## Goal

- Sequence label radius becomes **derived at render time** from a global per-project setting — never stored on the annotation (same philosophy as the derived numbering).
- **Default = Auto**: radius is a ratio of the canvas height with a legible floor and cap: `clamp(canvas.height × 0.03, 14, 28)` — the exact formula the strip labels already use (see `labelEditorStyle`/`getLabelMetrics` in `index.vue`). Large pastes → ~28px; small pastes shrink toward the 14px floor.
- A **draggable size control** on Row 2 of the top nav (next to Stroke), always visible, which switches between Auto and an explicit pixel size (range 8–64):
  - **Auto mode**: slider thumb sits at the computed auto value; the readout shows that value; dragging the slider switches to pixel mode at the dragged value.
  - **Pixel mode**: dragging the slider resizes **all** sequence labels live (radius is derived, so it is one setting + a redraw — no rewrite pass).
  - An **Auto** button next to the slider returns to Auto mode.
- The setting (`number | 'auto'`) persists with the project via the existing `SavedSettings` and restores on load, like stroke width / text size / emoji size.
- Old saved projects are compatible: their per-annotation `radius` field is simply ignored; labels render at the global size.

## Non-Goals (Out of Scope)

- Per-label sizing — the slider is global to the working image (Approach A approved in brainstorming).
- Making the size change undoable via the annotation undo stack — consistent with the other global settings (stroke width, text size, emoji size are not undoable).
- Changing the numbering logic, the white-circle/black-number style, or the Move/Delete behavior.
- Any zoom/pan/navigator/copy/thumbnail changes.

## Approach

**Approach A (approved): remove `radius` from the annotation and derive it from a global setting.** Numbering is already derived; radius derivation is the same pattern. Rendering, hit-testing, and the slider readout all call one resolver:

- `resolveSequenceRadius(size: number | 'auto', canvasHeight: number): number`
  - `'auto'` → `autoSequenceRadius(canvasHeight)` = `Math.min(28, Math.max(14, canvasHeight * 0.03))`
  - `number` → clamped to `[8, 64]`
- `autoSequenceRadius(canvasHeight: number): number` (exported for tests)

## User Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| What the control adjusts | Absolute pixel value with an Auto mode (not a multiplier) |
| Existing labels on change | All labels resize live (global setting; derived radius) |
| Slider visibility | Always visible on Row 2 (like Color/Stroke), plus mirrored in the mobile overflow menu |
| Persistence | Persist with the project via `SavedSettings`, restore on load |

## State Model

`app/pages/index.vue`:

- Replace `const SEQ_RADIUS = 28` with:
  ```ts
  const SEQ_AUTO_RATIO = 0.03
  const SEQ_AUTO_MIN = 14
  const SEQ_AUTO_MAX = 28
  const SEQ_SIZE_MIN = 8
  const SEQ_SIZE_MAX = 64
  const sequenceLabelSize = ref<number | 'auto'>('auto')
  ```
- `SequenceAnnotation` becomes `{ type: 'sequence', x: number, y: number }` (radius removed). The `Annotation` union, move/translate, delete, numbering, and undo logic are unchanged.
- Placement in `onCanvasClick` drops the `radius` field: `{ type: 'sequence', x, y }`.
- New pure helpers in `app/utils/sequence.ts` (auto-imported, same as `assignSequenceNumbers`):
  ```ts
  export function autoSequenceRadius(canvasHeight: number): number
  export function resolveSequenceRadius(size: number | 'auto', canvasHeight: number): number
  ```

`app/composables/useProjectStorage.ts`:

- `SavedSettings` gains `sequenceLabelSize: number | 'auto'` (optional `sequenceLabelSize?: ...` for backward compatibility with old saved projects).

## Rendering

In `drawAnnotations`'s `sequence` branch, replace `ann.radius` with a call to a plain resolver function (NOT a `computed` — `getCanvas().height` is not reactive, so a computed would go stale when a new image loads; the resolver is called during every redraw, and redraws always follow image loads):

```ts
function getEffectiveSequenceRadius(): number {
  return resolveSequenceRadius(sequenceLabelSize.value, getCanvas()?.height ?? 0)
}
```

All arc/font math in the sequence branch uses `getEffectiveSequenceRadius()` instead of `ann.radius`.

## Hit-Test

`hitTestSequence(seq, x, y)` currently reads `seq.radius`. It gains the resolved radius instead:

```ts
function hitTestSequence(seq: SequenceAnnotation, x: number, y: number): boolean {
  return Math.hypot(x - seq.x, y - seq.y) <= getEffectiveSequenceRadius()
}
```

No change to `getAnnotationAt`, `translateAnnotation`, `getResizeHandlePosition` (still returns null for sequence → not resizable).

## Row-2 Control (Desktop) + Mobile Menu

Follows the exact layout pattern of the Stroke section (`Row 2` around `index.vue:2948`) and the Text Size slider (`index.vue:2982`):

- Desktop Row 2, after Stroke, always visible (`hidden xl:flex`):
  - Label `Seq size`
  - **Auto** button (highlighted when `sequenceLabelSize === 'auto'`; click → `sequenceLabelSize.value = 'auto'`)
  - `<input type="range" min="8" max="64" :value="sequenceLabelSize === 'auto' ? getEffectiveSequenceRadius() : sequenceLabelSize">`; `@input` sets `sequenceLabelSize.value = Number(...)` (dragging in Auto mode transitions to pixel mode automatically). The template calls `getEffectiveSequenceRadius()` directly — it re-evaluates fresh on every re-render, which fires when `hasImage` or `sequenceLabelSize` changes, so it always reflects the current canvas height.
  - Readout: `{{ Math.round(getEffectiveSequenceRadius()) }}px`
- Mobile overflow menu (`showToolbarMenu` panel): a mirrored `Seq size` section after the Stroke section, same behavior, `xl:hidden` context.
- Slider is disabled when `!hasImage` (like other canvas-bound controls).

## Save / Load

- `buildSavedSettings()` gains `sequenceLabelSize: sequenceLabelSize.value`.
- Restore path adds `sequenceLabelSize.value = saved.settings.sequenceLabelSize ?? 'auto'` (defaults to Auto for old saves).
- Autosave: extend the existing `watch([textFontSize, emojiSize], ...)` to include `sequenceLabelSize` so dragging schedules a save.

## Compatibility

- Old saved annotations carry a `radius` field that is no longer read — harmless, since `annotations` restore casts to `Annotation[]` and the field is simply unused.
- Old saved settings lack `sequenceLabelSize` → `?? 'auto'` covers them.

## Testing

- `tests/unit/sequence.test.ts` additions (or a new `tests/unit/sequence-size.test.ts`):
  - `autoSequenceRadius` clamps: small height (e.g. 100 → 14), large height (e.g. 4000 → 28), mid height scales (`500 * 0.03 = 15`).
  - `resolveSequenceRadius` with `'auto'` delegates to the auto formula; with a number clamps to `[8, 64]` (e.g. `5 → 8`, `99 → 64`).
- Existing numbering tests unchanged (they use structural `AnyAnn` literals and are unaffected by the radius removal).
- Manual verification: small image → labels shrink toward 14px; large image → ~28px; drag slider → all labels resize live; Auto button resets; save/reload restores the setting; old saved project loads at Auto.

## Risks / Notes

- The auto formula uses the full-resolution canvas height (`getCanvas().height`), not the display size — consistent with how every other annotation size is expressed (canvas coordinates).
- Removing `radius` from the type means old `SequenceAnnotation` literals in tests or elsewhere must be updated; a repo grep for `radius` in sequence contexts is part of implementation.
