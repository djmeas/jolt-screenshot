# Canvas Zoom + Navigator — Design

**Date:** 2026-07-27
**Status:** Approved (pending user review of this spec)
**Scope:** `app/pages/index.vue` (script + template). No changes to `SavesPanel.vue`, `useProjectStorage.ts`, or any draw-path internals.

## Problem

The canvas always displays the image fit-to-viewport (or at natural size if smaller). There is no way to zoom in to place precise annotations or inspect detail. Users expect Photoshop-style zoom: Ctrl/Cmd+wheel zoom toward the cursor, keyboard shortcuts, a zoom control UI, and a small navigator preview showing which part of the image is visible.

## Goal

Add view-only zoom and pan:

- Ctrl/Cmd + wheel zooms toward the cursor.
- Toolbar-style zoom controls (`−`, percent, `+`, `Fit`, `1:1`) overlaid on the canvas.
- Shortcuts: Cmd/Ctrl `+` / `−` / `0` (fit) / `1` (100%).
- Hold Space and drag to pan when zoomed past fit.
- A navigator panel (bottom-right corner of the canvas) shows the whole image with a viewport rectangle; visible only when zoomed past fit; draggable to pan.
- Zoom never affects the exported image: Copy-to-Clipboard always produces the full image at natural resolution.

## Non-Goals (Out of Scope)

- Touch pinch-to-zoom.
- Animated/eased zoom transitions.
- Navigator visible when not zoomed.
- Persisting zoom/pan in saved projects (zoom is ephemeral view state).
- Any changes to annotation storage, drawing, hit-testing, or export logic.

## Why this approach (CSS display-scale + view offset)

The canvas backing store is always the image's natural resolution (`replaceWithImage`, `app/pages/index.vue:513`). Display size is set only via `canvas.style.width/height` (`updateCanvasDisplaySize`, `:253`). Every pointer interaction converts screen→canvas coords in one place, `getCanvasCoords` (`:267`), which derives the ratio from `canvas.getBoundingClientRect()`. Therefore:

- Zoom = scale `canvas.style.width/height` by a zoom factor.
- Pan = position the canvas absolutely inside the `overflow-hidden` wrapper.
- All drawing, hit-testing, resize handles, text overlay, and slam measurement keep working unchanged because they read the canvas rect.
- `copyToClipboard` (`:1118`) exports the backing store via `canvas.toBlob`, so output is automatically the full-resolution image regardless of zoom.

The navigator reuses the existing `drawAnnotations(ctx)` (`:314`) into a small canvas with a scaled context.

## State Model

All new state lives in `app/pages/index.vue`:

| Name | Type | Meaning |
|------|------|---------|
| `fitScale` | computed `number` | Existing fit ratio: `min(wrapperW / imgW, wrapperH / imgH, 1)`. Extracted from `updateCanvasDisplaySize` into a reusable computed so zoom math can reference it. |
| `zoomFactor` | ref `number` | Multiplier on top of `fitScale`. `≥ 1`. `1` = fit. |
| `displayScale` | computed `number` | `fitScale * zoomFactor` — CSS px per image px. |
| `viewX, viewY` | refs `number` | Image-pixel coordinates of the top-left of the visible region. Both `0` at fit. |
| `isZoomed` | computed `boolean` | `zoomFactor > 1.001` (epsilon to avoid float noise). Gates the navigator, pan cursor, and Space-drag. |
| `spacePanActive` | ref `boolean` | True while Space is held (and not typing in the text textarea). |
| `isPanning` | ref `boolean` | True during an active Space-drag. |
| `panStart` | ref `{ x, y, viewX, viewY }` | Pointer and view offsets at drag start. |

Zoom limits: `displayScale` clamped to `[fitScale, 8.0]` (i.e. `zoomFactor` clamped to `[1, 8 / fitScale]`). The `8.0` cap = 800%, matching Photoshop's practical max for this use case.

## View Math

The canvas becomes absolutely positioned inside the wrapper (which is already `relative` and `overflow-hidden`):

```
displayW = imgW * displayScale
displayH = imgH * displayScale

// Center when the displayed image is smaller than the wrapper in that axis:
baseLeft = displayW < wrapperW ? (wrapperW - displayW) / 2 : 0
baseTop  = displayH < wrapperH ? (wrapperH - displayH) / 2 : 0

canvas.style.left = baseLeft - viewX * displayScale
canvas.style.top  = baseTop  - viewY * displayScale
canvas.style.width  = displayW
canvas.style.height = displayH
```

**Clamping** — `clampView()` keeps the view inside the image. When the displayed image overflows the wrapper on an axis:

```
viewX ∈ [0, imgW - wrapperW / displayScale]
viewY ∈ [0, imgH - wrapperH / displayScale]
```

When the image fits on an axis, that axis's view offset is `0` (centered via `baseLeft`/`baseTop`). `clampView()` runs after every zoom, pan, image load, and window resize.

**Zoom toward cursor** — keep the image point under the cursor stationary:

```
imagePtX = viewX + (cursorX - baseLeft) / displayScale
imagePtY = viewY + (cursorY - baseTop)  / displayScale
// after computing newDisplayScale:
viewX = imagePtX - (cursorX - newBaseLeft) / newDisplayScale
viewY = imagePtY - (cursorY - newBaseTop)  / newDisplayScale
clampView()
```

**Pan** — on Space-drag pointer move:

```
viewX = panStart.viewX - (clientX - panStart.x) / displayScale
viewY = panStart.viewY - (clientY - panStart.y) / displayScale
clampView()
```

A single `applyZoomTransform()` function writes the four style values above; it is called from `updateCanvasDisplaySize()` (which keeps its existing triggers: image load, project load, `ResizeObserver`) and after any zoom/pan mutation.

## Interactions

### Ctrl/Cmd + wheel (and trackpad pinch)

A `wheel` listener on `canvasWrapperRef` with `{ passive: false }`. When `e.ctrlKey || e.metaKey`: `preventDefault()` and zoom by `1.15 ** -Math.sign(e.deltaY)` toward the cursor position. Trackpad pinch gestures fire wheel events with `ctrlKey` set, so pinch works with no extra code. Plain wheel (no modifier) is ignored.

### Zoom control pill

A small overlay at the **bottom-left** of the canvas wrapper (inside `canvasWrapperRef`, absolute, above the canvas, pointer-events auto), shown only when `hasImage`:

- `−` button — zoom out one step toward the wrapper center.
- Percent readout — `Math.round(displayScale * 100) + '%'`. Display-only.
- `+` button — zoom in one step toward the wrapper center.
- `Fit` button — `zoomFactor = 1`, `viewX = viewY = 0`.
- `1:1` button — `displayScale = 1` (actual pixels), i.e. `zoomFactor = 1 / fitScale` (clamped to the max).

Styling matches the existing contextual hint bubbles (`backdrop-blur-sm`, rounded-full, border, dark/light variants) so it feels native to the app. One zoom step = `1.15×` (same increment as wheel).

### Keyboard shortcuts

Extend `handleKeydown` (`:1770`). Only when `hasImage`, and never while focus is in the text textarea:

- Cmd/Ctrl `=` or `+` → zoom in one step toward wrapper center.
- Cmd/Ctrl `-` → zoom out one step toward wrapper center.
- Cmd/Ctrl `0` → Fit.
- Cmd/Ctrl `1` → 100%.

All four `preventDefault()` to suppress browser zoom. Modifier-less keys keep existing behavior; the existing modifier pass-through at `:1788` is amended to claim these four.

### Space-drag pan

- `keydown` Space (not in textarea, `hasImage`, `isZoomed`) → `spacePanActive = true`, `preventDefault()` (avoids page scroll).
- `keyup` Space → `spacePanActive = false`, end any active pan.
- While `spacePanActive`, `canvasCursorClass` shows `cursor-grab` (`cursor-grabbing` while `isPanning`).
- `startDrawing` (`:627`) returns early when `spacePanActive` is true — no annotation is created. Instead a pan begins: record `panStart`, set `isPanning`.
- `draw` (`:698`) while `isPanning` applies the pan math instead of drawing.
- `stopDrawing` (`:742`) ends the pan.
- Space with no image, or not zoomed, does nothing (and does not block default, so it doesn't swallow normal Space usage elsewhere).
- The Move tool keeps its current behavior (drags annotations); Space-drag is the only pan trigger.

## Navigator Panel

A small panel absolutely positioned at the **bottom-right** of the canvas wrapper, `v-if="isZoomed"`:

- A `<canvas>` ~180px wide; height follows image aspect ratio (`180 * imgH / imgW`, max ~180px).
- Drawn content: `ctx.drawImage(baseImage, 0, 0, navW, navH)`, then `ctx.scale(navW / imgW, navH / imgH)` and call `drawAnnotations(ctx)` so annotations appear in the thumbnail.
- A viewport rectangle overlaid in the app's indigo accent: `rect = (viewX, viewY, wrapperW / displayScale, wrapperH / displayScale)` scaled by `navW / imgW`, stroked ~1.5px with a light fill for legibility.
- Redraw triggers: zoom change, pan change, annotation change (`annotations` deep watch), image load, theme change. Redraws are cheap (one image + a few annotations at ≤180px); throttle pointer-move redraws to one per frame via `requestAnimationFrame`.
- **Dragging the navigator pans:** pointer down/move on the navigator maps navigator coords → image coords and centers the view there (`viewX = imgPtX - (wrapperW / displayScale) / 2`, then `clampView()`). Clicking also re-centers.
- The navigator has `pointer-events: auto` and sits above the main canvas but below the text-input overlay in z-order.
- Panel styling matches the zoom pill (rounded, border, backdrop blur, dark/light).

## Affected Existing Code (and why it still works)

| Existing code | Effect of zoom/pan |
|---------------|--------------------|
| `getCanvasCoords` (`:267`) | Reads `canvas.getBoundingClientRect()`, which already reflects the new size/position. No change needed. |
| `textInputStyle` (`:844`) | Rect-based; the textarea follows the zoomed/panned canvas. No change. |
| `measureSlamTargetFromCanvas/Layer` (`:1616`, `:1629`) | Rect-based; slam animations still target correctly. |
| `canvasCursorClass` (`:1720`) | Extended to return grab/grabbing cursors while Space-pan is active. |
| `updateCanvasDisplaySize` (`:253`) | Becomes the home of `applyZoomTransform()`; fit math extracted into the `fitScale` computed. Existing triggers unchanged. |
| `replaceWithImage` (`:513`) | Resets `zoomFactor/viewX/viewY` to fit on new image. |
| `clearAnnotations` (`:598`) | Resets zoom/pan to fit. |
| `copyToClipboard` (`:1118`) | Exports backing store; zoom never affects output. Verified in testing. |
| Slam canvas classes (`canvas-slam-enter` etc.) | Use CSS `transform`; pan uses `left/top`, so no conflict. |
| Toolbar / topnav | Untouched (zoom UI is a canvas overlay, not a toolbar row). |

## Lifecycle & Edge Cases

- **New image / clear:** zoom resets to fit (`zoomFactor = 1`, `viewX = viewY = 0`).
- **Window / wrapper resize:** existing `ResizeObserver` calls `updateCanvasDisplaySize` → `applyZoomTransform()` → `clampView()`, keeping the view valid. `zoomFactor` is preserved across resizes.
- **Zoom out to exactly fit:** `viewX/viewY` clamp to `0`; navigator hides.
- **Space released mid-drag:** `keyup` ends the pan cleanly.
- **Typing text:** Space inside the textarea types a space (no pan); zoom shortcuts are inert while the textarea is focused.
- **Empty state (no image):** zoom pill hidden, wheel/Space/shortcuts inert.
- **Large images:** `fitScale < 1`, so `1:1` may exceed the 800% cap only for very small images; the clamp handles it (for images smaller than the wrapper, `fitScale = 1` and `1:1` = fit).

## Component Boundaries

Everything stays in `app/pages/index.vue` except one small new component:

- **`app/components/ZoomNavigator.vue`** — props: `image: HTMLImageElement`, `annotations` (read-only), `isDark`, `viewport` (`{ x, y, w, h }` in image px), natural image size. Emits: `pan(imageX, imageY)` when the user drags/clicks. Owns its own canvas and its redraw (calls a passed `drawThumbnail(ctx, scale)` render prop from the parent so `drawAnnotations` stays in the page). This keeps the thumbnail rendering self-contained and keeps `index.vue` from growing its render surface.

The zoom pill, wheel handler, Space-pan, shortcuts, and all view math live in `index.vue` because they are tightly coupled to the existing canvas refs and pointer handlers.

## Files Touched

- `app/pages/index.vue` — new zoom/pan state + math, wheel listener, Space-pan, shortcuts, `applyZoomTransform`, zoom pill + navigator in template, `fitScale` computed extraction.
- `app/components/ZoomNavigator.vue` — new component (navigator canvas + viewport rect + drag-to-pan).

No changes to `<script setup>` logic for annotations, tools, saves, or export beyond the integration points listed above.

## Verification

Manual, via `npm run dev` (no test runner exists in this repo):

1. Load an image wider than the viewport. Ctrl+wheel up → canvas zooms in centered on the cursor; the point under the cursor stays under the cursor.
2. Zoom to 800% cap → further zoom-in is a no-op. Zoom out past fit → stops at fit, navigator disappears.
3. While zoomed, hold Space → grab cursor; drag pans; release Space → cursor returns to tool cursor. Drawing tools do not draw while Space is held.
4. `−`/`+`/`Fit`/`1:1` pill buttons and Cmd/Ctrl `+`/`−`/`0`/`1` all change zoom as labeled; browser zoom is suppressed.
5. Navigator appears only when zoomed; rectangle matches the visible region; dragging the rectangle (or clicking elsewhere in the thumbnail) pans the main view.
6. Draw a pen stroke and place text while zoomed — annotations land where the pointer is. Text textarea appears at the clicked point.
7. Resize the window while zoomed — view stays clamped and sane.
8. Copy-to-Clipboard at 400% zoom → pasted result is the full image at natural resolution, not the zoomed crop.
9. Load a new image / Clear → zoom resets to fit.
10. Type in the text textarea — Space inserts a space, shortcuts don't fire.
11. No regression to: tool/color/stroke indicator animations, slam animation on paste, emoji popover, Saves drawer, theme toggle, compact menu below `xl`.
