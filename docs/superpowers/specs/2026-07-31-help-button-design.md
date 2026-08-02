# Help Button + In-App User Guide — Design

**Date:** 2026-07-31
**Status:** Approved (pending user review of this spec)
**Scope:** One new component (`app/components/HelpContent.vue`), state + button + modal in `app/pages/index.vue`, one new bullet in `README.md`. No changes to `useProjectStorage.ts`, `SavesPanel.vue`, `ColorPickerPopover.vue`, `ZoomNavigator.vue`, `app.vue`, or existing modals.

## Problem

First-time users of JoltShot land on an empty canvas with a toolbar full of tools (Pen, Arrow, Box, Emoji, Text, Move, Colors, Stroke width, Undo, Clear, Copy, dark/light toggle, Saves panel, sequence Labels toggle) but no in-app onboarding. The README is technical and dev-focused (it documents the build setup and tech stack first) and isn't surfaced inside the app. Users who want to discover the "append to right" / "click a label to edit" workflows have nothing to read.

## Goal

- Add a small `?` button at the right edge of the desktop toolbar's second row (the row containing Color and Stroke). Clicking it opens a modal containing a short, friendly user guide.
- The guide covers, in plain English, the six most important things a new user needs to know: getting an image in, marking it up, stitching multiple screenshots with editable labels, saving projects, copying to clipboard, and a few quick tips.
- Modal closes on backdrop click, `Escape`, the explicit `×` button, or focus-outside-click. Mobile is intentionally not in scope — the button only appears at the same `xl` breakpoint as the rest of the desktop toolbar.
- One README bullet added to the "UI" section so the feature is discoverable from the repo docs.

## Non-Goals (Out of Scope)

- Mobile help access (the existing desktop/mobile split is preserved; mobile users have no in-app help).
- Searchable help, indexed docs, or a help page per feature.
- Internationalization / translations (English only).
- A guided tutorial overlay, tooltips on first use, or any other proactive onboarding.
- A persistent "first-run" experience that shows the modal automatically.
- Animated illustrations, video embeds, or external images inside the help content (text only).
- A help API or a way to deep-link to a section from elsewhere in the app.
- Any change to the existing README's technical content; only one new bullet in the "UI" section.

## Why this approach (modal + inline Vue content)

The user picked a modal (vs. a popover or side drawer) and an inline Vue component (vs. a markdown file or `/help` route). A modal is the right shape for a ~1-page reference document because it can be read in one sitting and dismissed cleanly; a popover would feel cramped and a side drawer would compete with the existing Saves panel. Inline Vue keeps the prose and the rendering in one file, with no build step, no markdown dependency, and no route navigation that would take the user out of the editor.

Alternatives considered:

- **External markdown file** — easier to edit long-form prose, but adds a dependency and a build step. Rejected for the simple, fixed ~1-page scope.
- **Separate `/help` route** — deep-linkable, but routes the user out of the editor. Rejected because the help should be a quick in-app reference, not a destination.
- **First-run auto-show** — pro-active, but interrupts users who already know the app. Rejected as annoying for returning users.

## User decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Where the docs are presented | Modal overlay (centered, dark backdrop) |
| Where the content lives | Inline Vue component (`HelpContent.vue`) |
| Tone and structure | Short friendly guide, ~1 page, 6 sections |
| Mobile access | Desktop only (≥ xl breakpoint) |
| Button label | Just a `?` glyph (no word label) |
| Content adapts to app state | No, static content |

## Component: `app/components/HelpContent.vue`

A single new file. Pure presentational Vue 3 SFC using `<script setup lang="ts">`. No props, no emits, no state.

- Renders a `<div>` containing 6 `<section>` blocks (one per guide section below).
- Reads `isDark` from a composable or prop. The component accepts `isDark: boolean` as a prop so the parent (`index.vue`) can pass it down — same pattern as the existing components, which read `isDark` from the top-level store.
- Tailwind classes throughout; dark/light via `:class="[isDark ? '...' : '...']"`.
- Typography: `prose`-like inline styles (the project doesn't use the `@tailwindcss/typography` plugin, so we set the typography manually with Tailwind classes — see "Visual treatment" below).

## State in `app/pages/index.vue`

| Name | Type | Meaning |
|------|------|---------|
| `showHelp` | `ref<boolean>(false)` | Whether the help modal is open. Default `false`. |

Reset alongside other modals: `cancelPasteDialog`, `pendingClearSaved = false`, and `closeToolbarMenu()` do not affect `showHelp` — closing one modal should not close another. The only way `showHelp` flips to `false` is the explicit close paths (backdrop / Esc / `×`).

## Toolbar button (desktop, row 1)

A new `?` button is added at the right edge of the **second row** of the desktop toolbar (the row that already contains Color, Stroke, and the conditional text-size / arrow-pivot controls). It is placed inside the existing row-2 flex container, after the conditional Pivot template, and uses `ml-auto` so it floats to the far right. Styling follows the existing toolbar buttons (same Tailwind class shape, same dark/light variants). No icon library dep — use a plain text `?` inside a small circular button.

- Width/height: 32×32, `rounded-md`, with the `?` character at 16px font size, semibold.
- Tooltip: `title="Help"`.
- Accessibility: `aria-label="Open help"`.
- Click handler: `showHelp = true`.
- Element ref: `ref="helpButtonRef"`. Used by the modal to restore focus on close (see "Open / close behavior" below).
- Visible only at `xl` breakpoint and up (the wrapper already gates this).
- Disabled only when `!hasImage`? No — the help is useful even before loading an image. Always enabled.

## Modal: `<Teleport to="body">`

Lives at the bottom of the template, next to the existing `showPasteDialog` and `pendingClearSaved` teleports. Z-index `z-50` (matches existing modals).

```html
<Teleport to="body">
  <div
    v-if="showHelp"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-title"
  >
    <div class="absolute inset-0 bg-black/50" @click="showHelp = false" />
    <div
      ref="helpCardRef"
      class="relative w-full max-w-2xl rounded-xl border shadow-2xl"
      :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
    >
      <!-- Header: title + close -->
      <div class="flex items-center justify-between p-5 pb-3">
        <h2 id="help-title" class="text-lg font-semibold" :class="[isDark ? 'text-zinc-100' : 'text-slate-900']">
          How to use JoltShot
        </h2>
        <button
          type="button"
          class="w-8 h-8 rounded-md flex items-center justify-center text-lg"
          :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']"
          aria-label="Close help"
          @click="showHelp = false"
        >×</button>
      </div>
      <!-- Scrollable body -->
      <div class="px-5 pb-5 max-h-[80vh] overflow-y-auto">
        <HelpContent :is-dark="isDark" />
      </div>
    </div>
  </div>
</Teleport>
```

### Open / close behavior

- **Open:** clicking the `?` button sets `showHelp = true`. On the next `nextTick`, focus moves to the `helpCardRef` (the modal card) so Tab navigation stays inside the modal.
- **Close triggers (all set `showHelp = false`):**
  1. Backdrop click (`@click` on the dim overlay).
  2. `Escape` key — a `watch(showHelp, ...)` adds a `keydown` listener on `window` when true and removes it when false.
  3. The `×` button in the modal header.
- **Body scroll lock:** when `showHelp` is true, `document.body.style.overflow = 'hidden'`. The same `watch` toggles this on/off. Restored to `''` on close. This is a small extra nicety over the existing paste dialog, which does not lock scroll — the help content is taller and the lock is helpful when the guide fills most of the viewport.
- **Focus restoration:** when the modal closes, restore focus to the `?` button by `helpButtonRef.value?.focus()`. Capture the originating element on open and refocus it on close.

## Help content (prose)

Six sections, each 1–3 short paragraphs. No bullet-heavy formatting in the main body. Section headings are styled, not linked. Plain English, no internal jargon, no version numbers.

### Section 1 — Welcome (1 paragraph)

> Welcome to JoltShot. It's a fast, in-browser tool for marking up screenshots. Grab an image, draw on it, then copy it back to your clipboard ready to paste anywhere.

### Section 2 — Get an image in (2 short paragraphs)

> The fastest way to start is to copy a screenshot from anywhere on your computer and paste it in. On a Mac, that's `Cmd+V`; on Windows or Linux, it's `Ctrl+V`. JoltShot accepts PNG, JPEG, WebP, and other common image formats.
>
> If you have an image file you'd rather upload, drop it onto the page or use the upload button at the top. Once an image is loaded, pasting or uploading another one will ask whether to replace it, append it to the right as a new image in a sequence, or add it as a movable layer on top.

### Section 3 — Mark it up (3 short paragraphs)

> Pick a tool from the toolbar and draw on the image. **Pen** is for freehand squiggles. **Arrow** is for pointing at something specific. **Box** draws a rectangle to highlight a region. **Emoji** drops a reaction from a built-in picker. **Text** adds a label you can type directly on the canvas.
>
> To move an annotation or change its size, switch to the **Move** tool, click the annotation, and drag. The handles around the edges let you resize.
>
> Made a mistake? `Cmd+Z` / `Ctrl+Z` (or the Undo button) steps back. The Clear button starts over with the same image.

### Section 4 — Stitch multiple screenshots (2 short paragraphs)

> To show a sequence — a before/after, a step-by-step, a bug repro — paste a second screenshot and choose **Append to right**. JoltShot glues the two images side by side into one wide strip, with a small white gap between them. Paste a third and it joins the chain. The canvas grows automatically.
>
> Each image in the strip gets a small numbered circle in the top-left corner. Click any of them to rename it — for example "Step 1", "Before", or "A". The circle turns into a pill that grows to fit the text. Clear the field and it reverts to the auto-number.

### Section 5 — Save and copy (2 short paragraphs)

> When your screenshot looks right, click **Copy to Clipboard**. JoltShot puts the marked-up image on your clipboard as a PNG, ready to paste into a chat, a doc, an issue tracker, anywhere.
>
> If you want to come back to a project later, the **Saves** panel in the top-right stores your work in your browser. Saved projects keep the image, the annotations, the strip layout, and any custom labels. Open the panel to restore one, or to delete the ones you no longer need.

### Section 6 — A few tips (4–5 short bullets)

- The dark/light toggle is in the top-left. Your choice sticks between visits.
- On a phone or tablet, all the same tools work with your finger. The toolbar collapses into a menu on small screens.
- If you've got a really long screenshot, you can zoom the canvas with `Cmd/Ctrl + scroll` and pan by holding Space and dragging.
- Custom colors are available — click the rainbow swatch next to the color circles to pick any color you like.
- All your work stays in your browser. Nothing is uploaded anywhere.

## Visual treatment of the modal

- **Card width:** `max-w-2xl` (672px) on desktop, full-width with `w-full` on small viewports.
- **Padding:** `p-5` inside the card, `p-4` outside the card (consistent with the existing `pendingClearSaved` modal).
- **Scrollable body:** `max-h-[80vh] overflow-y-auto` on the inner content area. Long content scrolls inside the modal, never the page.
- **Section spacing:** `mt-5` between sections (the first section sits flush with the top padding).
- **Section headings:** `text-base font-semibold mt-5 mb-1.5`. Color matches the title.
- **Paragraphs:** `text-sm leading-relaxed`. Color: `text-zinc-700` light / `text-zinc-300` dark.
- **Inline emphasis (`**bold**`):** `font-semibold` in the same color as the surrounding text. (No `<strong>` element — just typography.)
- **Tips list:** `text-sm space-y-1.5 list-disc list-inside` on a `<ul>`. Color: `text-zinc-600` light / `text-zinc-400` dark — slightly muted so it doesn't compete with the main prose.

## State, persistence, integration

- No new persisted state. `showHelp` resets on reload.
- No new dependencies (no markdown library, no focus-trap library). Focus management is a single `ref` + one `nextTick` + the `Escape` keydown listener.
- No changes to the existing modals, save flow, copy flow, or theme.
- The `?` button lives in the row-2 flex container, so it shares the responsive `xl:` breakpoint visibility with the rest of the row-2 controls.

## Error handling

- **HelpContent missing or empty:** none — the component is shipped in this branch; if it failed to load, the modal would render an empty body, which is a build-time failure, not a runtime error path.
- **Focus restoration when the `?` button is unmounted:** the captured `previouslyFocusedElement` is checked for `isConnected` before refocusing; if it's been removed from the DOM, focus is dropped to `<body>`.

## Testing

No test framework exists in this project. Verification is a manual smoke-test checklist run against `pnpm dev`:

1. Open the app at desktop width (≥ 1280px) — the `?` button appears at the right edge of the second toolbar row (the Color / Stroke row), separated from the rest of that row by `ml-auto`.
2. Click the `?` button — the modal opens with all six sections visible. The page behind is dimmed and cannot scroll.
3. Click the dim backdrop — the modal closes.
4. Open again, press `Escape` — the modal closes.
5. Open again, click the `×` in the top-right — the modal closes.
6. Open the modal and press `Tab` repeatedly — focus stays inside the modal (the `×` is the only focusable control, so focus cycles on it).
7. Open the modal, close it — focus returns to the `?` button in the toolbar.
8. Resize the viewport to 400px wide — the modal is full-width with internal scroll, no horizontal page scroll.
9. Toggle dark/light mode with the modal open — modal text remains readable; sections, paragraphs, and tips are styled for the new theme.
10. Resize to a phone width (< 1280px) — the `?` button is hidden, no in-app help on mobile (expected; documented).
11. With the modal open, paste a screenshot — the modal stays open over the canvas; no conflict with the paste dialog.
12. README's "UI" section now includes the new `**Help**` bullet.

## Open question (for spec self-review / user review)

None — all user-facing decisions were made during brainstorming.
