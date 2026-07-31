# Custom Color Picker Design

Date: 2026-07-27
Branch: `feature/ColorPickerCustom`

## Goal

Replace the fixed 8-swatch color palette's limitations with a Photoshop-style custom color picker. The first swatch becomes a "rainbow" custom-color slot that opens a popover where the user can pick any color via a saturation/value area, hue slider, alpha slider, hex input, or RGBA numeric inputs. Picked colors apply with real transparency to pen, arrow, box, and text tools.

## Decisions (from brainstorming)

- **Custom popover** (not native `<input type="color">`) — consistent cross-platform UI, full RGBA support, matches app styling.
- **Real alpha** — alpha < 100% produces semi-transparent strokes on canvas.
- **Swatch becomes the picked color** — after picking, the rainbow swatch shows the picked color; clicking re-opens the picker.
- **Live apply** — `strokeColor` updates on every change while dragging; closing the popover keeps the last color.
- **Recent colors** — popover shows the last 5 custom colors, persisted to `localStorage`.

## Components

### `app/components/ColorPickerPopover.vue` (new)

Self-contained picker component.

**Props:**
- `modelValue: string` — current color as `#rrggbb` or `rgba(r, g, b, a)`
- `isDark: boolean` — theme flag for styling

**Emits:**
- `update:modelValue` — emitted live on every color change (drag or field edit)
- `close` — user dismissed the popover (Escape, close button); parent also handles click-outside

**Internal state:** HSVA (`h: 0–360`, `s: 0–1`, `v: 0–1`, `a: 0–1`), initialized by parsing `modelValue`. All conversions between HSVA ↔ RGB ↔ hex live inside this component as pure helper functions (no dependency on app.vue).

**UI layout (top to bottom):**
1. **Saturation/Value area** (~200×140px canvas): horizontal = saturation, vertical = value, background filled with current hue. Draggable crosshair rendered on the canvas; pointer events (mouse + touch) update `s`/`v` live.
2. **Hue slider** (canvas, full width): 0–360 rainbow gradient with draggable handle.
3. **Alpha slider** (canvas, full width): gradient from transparent to current RGB over a checkerboard pattern.
4. **Fields row:**
   - Hex input: accepts `#rgb`, `#rrggbb`, `#rrggbbaa`; shows `#rrggbb` when a=1, `#rrggbbaa` otherwise. Invalid input is ignored (field restores last valid value on blur).
   - R, G, B numeric inputs (0–255) and A input (0–100%, mapped to 0–1).
   - All field edits update HSVA and emit live, same as drags.
5. **Recent colors row:** up to 5 swatches, most-recent-first; each shows color over checkerboard; clicking one sets it as the current color.

**Canvases** are rendered with a small offscreen-friendly redraw function called whenever HSVA changes (SV area re-renders only when hue changes; alpha gradient re-renders when RGB changes). Device-pixel-ratio scaling for crispness.

### `app/app.vue` changes

- **Rainbow swatch:** inserted as the first item in both color strips (desktop toolbar ~line 1727, mobile overflow menu ~line 1890). Background is a rainbow `conic-gradient` until a custom color has been picked; afterwards it shows the picked color over a checkerboard (CSS `background-image` layering).
- **Custom color tracking:** a `customColor = ref<string | null>(null)` holds the last picked custom color. The rainbow swatch is the "custom slot."
- **Popover toggle:** clicking the rainbow swatch toggles the popover, anchored below the swatch (absolute positioning within the relatively-positioned strip container). Both desktop and mobile menu instances get a popover; only one is open at a time.
- **Live apply:** `@update:modelValue` sets `customColor` and calls `selectStrokeColor(value)`-equivalent logic (direct assignment + indicator update + pick animation). Popover close (`@close`, click-outside, Escape) just closes the popover — last color stays.
- **Indicator ring:** the custom swatch is registered in the color button maps under a sentinel key (`'__custom__'`). `updateColorIndicator` resolves the lookup key: if `strokeColor` matches a fixed swatch value, use that; otherwise use `'__custom__'`. The ring therefore tracks the rainbow swatch whenever a custom color is active.
- **Recent colors persistence:** on popover close, the current custom color is pushed to a `recentColors` list (dedupe by exact string, cap 5, most-recent-first) and saved to `localStorage` under `joltshot-recent-colors`. Loaded on mount and passed to the popover as a prop (or read by the popover directly — decided in implementation; leaning toward the popover owning this to keep app.vue small).

## Color model

`strokeColor` remains a `string` but may now hold `#rrggbb` or `rgba(r, g, b, a)`. Canvas `strokeStyle`/`fillStyle` accept both formats natively, so all drawing code (pen strokes, arrows, boxes, text, previews) and PNG export work unchanged.

## Error handling

- Invalid hex input: ignored; field restores the last valid value on blur/Escape.
- Out-of-range RGBA numbers: clamped (0–255, 0–100).
- Missing/corrupt `localStorage` recents: parse failure → empty list.
- Popover near viewport edge: popover uses fixed positioning computed from the swatch's bounding rect, clamped horizontally to stay within the viewport with an 8px margin.

## Testing

No test framework exists in this repo. Verification is a manual checklist:

1. Pick a color via SV area drag → pen stroke draws in that color.
2. Pick via hue/alpha sliders → box with 50% alpha is semi-transparent over the image.
3. Type `#00ff00` in hex field → stroke becomes green; type `#00ff0080` → semi-transparent green.
4. Type R/G/B/A numbers → color updates live; out-of-range values clamp.
5. Pick a custom color → rainbow swatch becomes that color; indicator ring tracks the rainbow swatch.
6. Arrow, box, and text tools all respect the custom color including alpha.
7. Close and reopen popover → recent colors row shows previous picks (up to 5, deduped); survives reload.
8. Popover works from both the desktop toolbar strip and the mobile overflow menu; only one open at a time.
9. Escape and click-outside close the popover; color stays applied.
10. Copy-to-clipboard PNG export renders transparent strokes correctly.
11. Light and dark mode styling both legible.
