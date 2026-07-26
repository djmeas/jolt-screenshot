# Topnav Row 2 — Design

**Date:** 2026-07-26
**Status:** Approved (pending user review of this spec)
**Scope:** `app/pages/index.vue` (template only)

## Problem

At certain viewport widths at and above Tailwind's `xl` breakpoint (≥1280px), the top toolbar's tool buttons (pen, arrow, box, emoji, text, move), color swatches, stroke sizes, conditional text size slider, conditional arrow pivot slider, and the Undo / Clear / Copy actions all sit in a single `flex flex-wrap` row inside the same toolbar card. When the available width is not enough to hold all of them on one line, items wrap onto a second row in an arbitrary order. The wrap looks accidental rather than intentional.

The user has confirmed that a 2-row toolbar is acceptable (and is common in other tools). The fix should be a clean, structured split, not a `flex-wrap` afterthought.

## Goal

At `xl` and above, the toolbar always renders as two structured rows inside the same card:
- **Row 1** holds the most-used controls (brand, theme toggle, Saves, tool selection, Undo / Clear / Copy).
- **Row 2** holds formatting controls (color, stroke, and the conditional Text Size / Arrow Pivot sliders).

The split is intentional and stable across all `xl+` widths. At very wide viewports the same two rows still appear, but the contents of each row sit on a single line because there is enough horizontal space.

Below `xl`, the existing `xl:hidden` compact menu is the entire toolbar — unchanged.

## Approach

Replace the single horizontal `flex flex-wrap` toolbar wrapper with a vertical flex container that owns two child rows. Both rows are always rendered at `xl+`. The choice of which controls go in which row is fixed:

- **Row 1** (always at `xl+`): brand · theme toggle · Saves · divider · tool buttons strip · spacer · Undo / Clear / Copy.
- **Row 2** (always at `xl+`): Color swatches · divider · Stroke sizes · divider · (conditional) Text Size slider · (conditional) Arrow Pivot slider.

The card itself (background, border, rounded corners, shadow, padding) is preserved as today. The two rows share the card's padding and are separated by a hairline border. Each row is itself a `flex flex-wrap items-center gap-1` row.

The existing `xl:hidden` compact menu is left untouched. At `<xl`, the toolbar is still the compact menu (Saves pill, Undo, Clear, Copy, and an overflow menu) — exactly as today.

## Layout

### Card wrapper (replaces existing single toolbar div)

```html
<div
  class="relative z-10 flex flex-col rounded-xl border shadow-xl min-w-0 px-2 sm:px-3 py-2 transition-colors duration-200"
  :class="[isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200']"
>
  <!-- Row 1 -->
  <div class="flex flex-wrap items-center gap-1">
    <!-- brand, theme toggle, Saves (xl-only), divider, tool strip, spacer, Undo/Clear/Copy (xl-only) -->
  </div>

  <!-- Row 2 -->
  <div
    class="mt-1.5 pt-1.5 border-t flex flex-wrap items-center gap-1"
    :class="[isDark ? 'border-zinc-800' : 'border-slate-200']"
  >
    <!-- Color, divider, Stroke, divider, (conditional Size), (conditional Pivot) -->
  </div>
</div>
```

### Row 1 contents

In source order, top-level children of row 1:

1. Brand `<img>` (no change).
2. Theme toggle button (no change).
3. Saves button — existing `hidden xl:flex` styling preserved.
4. Divider before the tool strip — existing `hidden sm:block w-px h-5 mx-0.5 sm:mx-1.5 shrink-0` (no change).
5. Tool strip `<div ref="toolStripRef">` containing all 6 tool buttons (no change).
6. Spacer `<div class="hidden xl:block flex-1 min-w-2" />` (no change).
7. Undo / Clear / Copy container — existing `hidden xl:flex items-center gap-1 shrink-0` (no change).

### Row 2 contents

In source order, top-level children of row 2:

1. Color block — existing `hidden xl:flex items-center gap-2 shrink-0` (no change to internal classes).
2. Divider between Color and Stroke — `hidden xl:block w-px h-5 mx-1.5 shrink-0` (no change).
3. Stroke block — existing `hidden xl:flex items-center gap-2 shrink-0` (no change).
4. Divider before Text Size (only when `toolMode === 'text'`) — `hidden xl:block w-px h-5 mx-1.5 shrink-0`.
5. Text Size slider block — only rendered when `toolMode === 'text'`. Existing `hidden xl:flex` preserved.
6. Divider before Arrow Pivot (only when `selectedArrow != null`) — `hidden xl:block w-px h-5 mx-1.5 shrink-0`.
7. Arrow Pivot slider block — only rendered when `selectedArrow != null`. Existing `hidden xl:flex` preserved.

## Behavior Preserved

- Tool indicator animation (`toolIndicatorStyle`, `registerToolButton`) — the tool strip `ref` still points at the same DOM node; the indicator positions itself within row 1.
- Color indicator animation (`colorIndicatorStyle`, `registerColorButton`) — the color strip `ref` still points at the same DOM node; the indicator positions itself within row 2.
- Stroke indicator animation (`strokeIndicatorStyle`, `registerStrokeButton`) — the stroke strip `ref` still points at the same DOM node; the indicator positions itself within row 2.
- Emoji popover anchor — its `absolute top-full left-0` positioning is relative to its parent (the emoji button wrapper), which is unchanged.
- Saves drawer / `SavesPanel` — its `v-if="showSavesPanel"` trigger is unchanged.
- Compact mobile/tablet menu (`xl:hidden` overflow block) — untouched.
- All keyboard shortcuts, focus order, `tabindex` semantics, and `aria-label`/`title` attributes — unchanged.
- `<script setup>` logic, refs, computed values, and event handlers — no changes.

## Out of Scope

- Exposing Color / Stroke / Text Size / Arrow Pivot at `<xl` viewports. They remain `hidden xl:flex` (or guarded by the same `v-if` they already have). The compact menu is the only toolbar at `<xl`, exactly as today.
- Reworking or redesigning the mobile/tablet compact menu.
- Reordering items within either row. Source order in each row is the same as today's source order, just split between the two rows.
- Changing the breakpoint (`xl` = 1280px). If the wrap only happens between `lg` (1024px) and `xl` (1280px), the wrap will now be visible at those widths since Color/Stroke/Size/Pivot are only rendered at `xl+`. Below `xl`, the compact menu is in effect. This is the desired behavior.
- Any changes to the canvas, save/load, or annotation logic.

## Verification

1. Run `pnpm dev` (or `nuxt dev`).
2. At 1440px wide: row 1 shows brand/theme/Saves/divider/tools/spacer/Undo/Clear/Copy on a single line. Row 2 shows Color/divider/Stroke on a single line below row 1, separated by a hairline. This is the only visual change vs. today at this width — the second row is the new norm, not a wrap.
3. At 1280px (xl breakpoint): same as #2, but if the viewport is exactly at the breakpoint the contents of row 1 may themselves wrap onto two visual lines (because there is just barely enough room for Saves + tools + Undo/Clear/Copy). This existing inner-wrap behavior is preserved.
4. At 1024px (below xl): only the compact menu is visible. Row 1 and row 2 are both hidden.
5. Select Text tool at 1280px → row 2 grows to include the Text Size block. Switch to Pen → Size block disappears from row 2.
6. Draw an arrow at 1280px → row 2 grows to include the Arrow Pivot block. Click elsewhere to deselect → Pivot block disappears.
7. No visual regression to: tool indicator slide animation, color ring animation, stroke dot pop, emoji popover positioning, theme toggle, Saves drawer, Copy-to-Clipboard success state.

## Files Touched

- `app/pages/index.vue` — only the template region (lines ~1858-2139), specifically the toolbar wrapper and the wrapping of its existing children into two child rows. No `<script setup>` changes.
