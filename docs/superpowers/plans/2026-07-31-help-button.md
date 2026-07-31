# Help Button + In-App User Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?` button at the bottom-right of the desktop toolbar that opens a modal containing a short, friendly, in-app user guide covering the six most common JoltShot workflows.

**Architecture:** A new pure-presentational Vue component `app/components/HelpContent.vue` holds the prose. The host page `app/pages/index.vue` adds a `showHelp` ref, a `?` toolbar button, and a centered modal `<Teleport>` with backdrop / Esc / `×` close paths, focus management, and body scroll lock. No new dependencies; the content is a static Vue SFC.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-07-31-help-button-design.md`

## Global Constraints

- **No test runner exists in this repo** (no `test` script in `package.json`). Automated verification for every task = `pnpm build` exits 0. Manual verification via `pnpm dev` happens in the final task.
- `ref` / `computed` / `nextTick` are Nuxt auto-imports — no import statements needed in `index.vue`.
- Styling follows the existing pattern: Tailwind classes with `:class="[isDark ? '...' : '...']"` ternaries.
- All edits are in `app/components/HelpContent.vue` (new), `app/pages/index.vue`, and `README.md`.
- The `?` button is desktop-only (`xl` breakpoint) and lives in the same `hidden xl:flex items-center gap-1 shrink-0` wrapper as Undo / Clear / Copy.
- Modal close paths are: backdrop click, `Escape` key, `×` button. Each sets `showHelp = false`.
- Body scroll lock: `document.body.style.overflow = 'hidden'` while modal is open; restored on close.
- Focus management: on open, capture the previously focused element and move focus to the modal card; on close, restore focus to the `?` button (or the captured element if `helpButtonRef` is not the originating element).
- Frequent commits: one commit per task.

---

### Task 1: `HelpContent.vue` — the prose component

Create the new component with all six sections of the user guide. Pure presentational; takes `isDark` as a prop. After this task the component is wired nowhere — a follow-up task puts it on screen.

**Files:**
- Create: `app/components/HelpContent.vue`

**Interfaces:**
- Consumes: nothing (the page passes `isDark` as a prop).
- Produces: `<HelpContent :is-dark="isDark" />` — a self-contained block of styled prose. No emits.

- [ ] **Step 1: Create the component file with the script setup + props**

In `app/components/HelpContent.vue`, create a new file with the following content:

```vue
<script setup lang="ts">
defineProps<{
  isDark: boolean
}>()
</script>

<template>
  <div>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      Welcome to JoltShot. It's a fast, in-browser tool for marking up screenshots. Grab an image, draw on it, then copy it back to your clipboard ready to paste anywhere.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Get an image in
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      The fastest way to start is to copy a screenshot from anywhere on your computer and paste it in. On a Mac, that's <span class="font-semibold">Cmd+V</span>; on Windows or Linux, it's <span class="font-semibold">Ctrl+V</span>. JoltShot accepts PNG, JPEG, WebP, and other common image formats.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      If you have an image file you'd rather upload, drop it onto the page or use the upload button at the top. Once an image is loaded, pasting or uploading another one will ask whether to replace it, append it to the right as a new image in a sequence, or add it as a movable layer on top.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Mark it up
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      Pick a tool from the toolbar and draw on the image. <span class="font-semibold">Pen</span> is for freehand squiggles. <span class="font-semibold">Arrow</span> is for pointing at something specific. <span class="font-semibold">Box</span> draws a rectangle to highlight a region. <span class="font-semibold">Emoji</span> drops a reaction from a built-in picker. <span class="font-semibold">Text</span> adds a label you can type directly on the canvas.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      To move an annotation or change its size, switch to the <span class="font-semibold">Move</span> tool, click the annotation, and drag. The handles around the edges let you resize.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      Made a mistake? <span class="font-semibold">Cmd+Z</span> / <span class="font-semibold">Ctrl+Z</span> (or the Undo button) steps back. The Clear button starts over with the same image.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Stitch multiple screenshots
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      To show a sequence — a before/after, a step-by-step, a bug repro — paste a second screenshot and choose <span class="font-semibold">Append to right</span>. JoltShot glues the two images side by side into one wide strip, with a small white gap between them. Paste a third and it joins the chain. The canvas grows automatically.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      Each image in the strip gets a small numbered circle in the top-left corner. Click any of them to rename it — for example "Step 1", "Before", or "A". The circle turns into a pill that grows to fit the text. Clear the field and it reverts to the auto-number.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Save and copy
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      When your screenshot looks right, click <span class="font-semibold">Copy to Clipboard</span>. JoltShot puts the marked-up image on your clipboard as a PNG, ready to paste into a chat, a doc, an issue tracker, anywhere.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      If you want to come back to a project later, the <span class="font-semibold">Saves</span> panel in the top-right stores your work in your browser. Saved projects keep the image, the annotations, the strip layout, and any custom labels. Open the panel to restore one, or to delete the ones you no longer need.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      A few tips
    </h3>
    <ul :class="[isDark ? 'text-zinc-400' : 'text-zinc-600']" class="text-sm space-y-1.5 list-disc list-inside">
      <li>The dark/light toggle is in the top-left. Your choice sticks between visits.</li>
      <li>On a phone or tablet, all the same tools work with your finger. The toolbar collapses into a menu on small screens.</li>
      <li>If you've got a really long screenshot, you can zoom the canvas with <span class="font-semibold">Cmd/Ctrl + scroll</span> and pan by holding <span class="font-semibold">Space</span> and dragging.</li>
      <li>Custom colors are available — click the rainbow swatch next to the color circles to pick any color you like.</li>
      <li>All your work stays in your browser. Nothing is uploaded anywhere.</li>
    </ul>
  </div>
</template>
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: exits 0. The new component is not yet imported anywhere, but Nuxt's auto-import scan picks it up; an unused component should not break the build.

- [ ] **Step 3: Commit**

```bash
git add app/components/HelpContent.vue
git commit -m "Add HelpContent component with in-app user guide"
```

---

### Task 2: `showHelp` state, button, and modal in `index.vue`

Add the `showHelp` ref, the `?` button in the toolbar, and the modal `<Teleport>`. This task includes the focus management and body scroll lock. After this task, clicking `?` opens the modal and the close paths all work.

**Files:**
- Modify: `app/pages/index.vue` — add `showHelp` ref, add `helpButtonRef`, add `?` button to the desktop toolbar after Copy to Clipboard, add the `<Teleport>` modal block

**Interfaces:**
- Consumes: `HelpContent` component (from Task 1), `isDark` (existing), existing `nextTick` auto-import.
- Produces:
  - `showHelp: Ref<boolean>` — modal open state.
  - `helpButtonRef: Ref<HTMLButtonElement | null>` — the `?` toolbar button.
  - `helpCardRef: Ref<HTMLDivElement | null>` — the modal card.
  - `previouslyFocusedElement: HTMLElement | null` (local variable, not exported).

- [ ] **Step 1: Add the state refs**

In `app/pages/index.vue`, near the existing `showPasteDialog` / `pendingPasteFile` declarations (around line 97-98), add:

```ts
const showHelp = ref(false)
const helpButtonRef = ref<HTMLButtonElement | null>(null)
const helpCardRef = ref<HTMLDivElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null
let helpKeydownCleanup: (() => void) | null = null
```

Place `helpButtonRef` next to the other toolbar refs. The `previouslyFocusedElement` and `helpKeydownCleanup` live at module scope as plain `let`s — they're not reactive state, just bookkeeping for the open/close lifecycle.

- [ ] **Step 2: Add the `?` button to the desktop toolbar**

In `app/pages/index.vue`, immediately after the "Copy to Clipboard" button (currently ending at line 2683 with the closing `</button>` of the Copy button), and before the `</div>` that closes the `hidden xl:flex items-center gap-1 shrink-0` wrapper (line 2684), insert:

```html
          <button
            ref="helpButtonRef"
            type="button"
            class="flex items-center justify-center w-8 h-8 rounded-lg text-base font-semibold transition-colors"
            :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']"
            title="Help"
            aria-label="Open help"
            @click="showHelp = true"
          >?</button>
```

The button is 32×32 (`w-8 h-8`), with the `?` glyph at `text-base font-semibold` (16px semibold). `aria-label="Open help"` and `title="Help"` for screen readers and tooltip.

- [ ] **Step 3: Add the modal `<Teleport>` block**

In `app/pages/index.vue`, immediately after the existing paste-dialog `<Teleport>` (which ends around line 3326), insert:

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
          <div class="flex items-center justify-between p-5 pb-3">
            <h2
              id="help-title"
              class="text-lg font-semibold"
              :class="[isDark ? 'text-zinc-100' : 'text-slate-900']"
            >
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
          <div class="px-5 pb-5 max-h-[80vh] overflow-y-auto">
            <HelpContent :is-dark="isDark" />
          </div>
        </div>
      </div>
    </Teleport>
```

- [ ] **Step 4: Add the open/close side-effect watcher**

In `app/pages/index.vue`, near the bottom of `<script setup>` (just before the closing `</script>` tag, after all the other logic), insert:

```ts
watch(showHelp, async (isOpen) => {
  if (isOpen) {
    previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') showHelp.value = false
    }
    window.addEventListener('keydown', onKeydown)
    helpKeydownCleanup = () => window.removeEventListener('keydown', onKeydown)
    await nextTick()
    helpCardRef.value?.focus()
  } else {
    document.body.style.overflow = ''
    if (helpKeydownCleanup) {
      helpKeydownCleanup()
      helpKeydownCleanup = null
    }
    if (previouslyFocusedElement && previouslyFocusedElement.isConnected) {
      previouslyFocusedElement.focus()
    } else if (helpButtonRef.value) {
      helpButtonRef.value.focus()
    }
    previouslyFocusedElement = null
  }
})
```

Notes:
- `helpKeydownCleanup` is a module-scope `let` declared in Step 1, not a property stashed on the ref. The cleanup runs both on the close branch of this watcher and on any future unmount path.
- `previouslyFocusedElement` is captured on open and used on close. The `isConnected` check guards against the originating element having been unmounted between open and close.

- [ ] **Step 5: Make the modal card focusable**

In the template from Step 3, add `tabindex="-1"` to the `helpCardRef` div so it can receive programmatic focus. The full attribute on the div becomes `tabindex="-1" ref="helpCardRef"`. This is required because the watcher's `helpCardRef.value?.focus()` needs the element to be focusable; a plain `<div>` without `tabindex` is not.

After this change, the div line in the template reads:

```html
        <div
          ref="helpCardRef"
          tabindex="-1"
          class="relative w-full max-w-2xl rounded-xl border shadow-2xl outline-none"
```

(`outline-none` removes the focus ring on the card itself so the modal looks the same whether it has focus or not. The `×` button is the visible focusable control.)

- [ ] **Step 6: Verify the build**

Run: `pnpm build`
Expected: exits 0. The new `HelpContent` component is auto-imported; the `?` button, modal, and watcher all compile.

- [ ] **Step 7: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add help button and modal in toolbar"
```

---

### Task 3: README bullet + manual smoke test

Add the new bullet to the README's "UI" section, then walk the spec's 12-item manual smoke-test checklist against `pnpm dev`.

**Files:**
- Modify: `README.md` — add the `**Help**` bullet to the "UI" section (line 38–39)

**Interfaces:**
- Consumes: nothing.
- Produces: updated user-facing docs.

- [ ] **Step 1: Add the README bullet**

In `README.md`, the "UI" section currently reads (lines 37-39):

```
### UI
- **Dark / light mode** – Theme toggle with preference saved in `localStorage`
- **Keyboard shortcuts** – Undo and paste
```

Change it to:

```
### UI
- **Dark / light mode** – Theme toggle with preference saved in `localStorage`
- **Help** – Click `?` in the bottom-right of the toolbar for a quick user guide covering all the common workflows
- **Keyboard shortcuts** – Undo and paste
```

The `**Help**` bullet sits between dark/light mode and keyboard shortcuts. Keep alphabetical-ish ordering is not required; the spec just says "one new bullet in the UI section."

- [ ] **Step 2: Run the dev server and walk the smoke-test checklist**

Start: `pnpm dev`
Then verify each of the following by hand, exactly as listed in the spec at `docs/superpowers/specs/2026-07-31-help-button-design.md` under "Testing":

1. Open the app at desktop width (≥ 1280px) — the `?` button appears at the bottom-right of the toolbar, after Copy to Clipboard.
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

If any check fails, fix the issue, re-run `pnpm build` to confirm, then re-test.

- [ ] **Step 3: Stop the dev server**

Run: `Ctrl+C` in the terminal where `pnpm dev` is running.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document help button in README"
```
