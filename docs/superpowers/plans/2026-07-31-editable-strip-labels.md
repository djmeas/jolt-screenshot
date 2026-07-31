# Editable Strip Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the numbered labels that appear on each image in an append-to-right strip clickable, so users can replace the auto-number with custom free-form text (e.g. "Step 1", "A", "Before"). Custom text is rendered as a pill when long, persisted in the save file, and reverts to the auto-number when cleared.

**Architecture:** A new per-segment `labelText: string` field extends the existing `stripSegments` records. Rendering, hit-testing, and persistence all read from this field; an empty value means "render the auto-number from the index". The renderer (`drawStripLabels`) is rewritten around a new `getLabelMetrics` helper that decides between a circle and a pill based on measured text width. An overlay `<input>` (always present in the DOM, hidden when no edit is active) sits in the canvas wrapper and is positioned/sized from the active segment's metrics. Click hit-testing runs in canvas coordinates, so zoom/pan are transparent.

**Tech Stack:** Nuxt 4, Vue 3 (`<script setup lang="ts">`), Tailwind CSS, HTML5 Canvas.

**Spec:** `docs/superpowers/specs/2026-07-31-editable-strip-labels-design.md`

## Global Constraints

- **No test runner exists in this repo** (no `test` script in `package.json`). Automated verification for every task = `pnpm build` exits 0. Manual verification via `pnpm dev` happens in the final task.
- `ref` / `computed` / `nextTick` are Nuxt auto-imports — no import statements needed in `index.vue`.
- Styling follows the existing pattern: Tailwind classes with `:class="[isDark ? '...' : '...']"` ternaries.
- All edits are in `app/pages/index.vue` and `app/composables/useProjectStorage.ts`. No changes to `SavesPanel.vue`, `ZoomNavigator.vue`, `ColorPickerPopover.vue`, or `app.vue`.
- Label edits are **not undoable**; never touch `annotationHistory` in label-edit code.
- `SavedStripSegment` gains an optional `labelText` field. **Do not bump `STORAGE_VERSION`** — pre-feature saves load fine because the field defaults to `""`.
- The `<input>` element must be **always present in the DOM**, hidden with `v-show` rather than `v-if`, so it can be focused without remount.
- Hit-testing is in **canvas coordinates**, not screen. The existing `getCanvasCoords(e)` helper at the top of `startDrawing` already converts client→canvas; the label hit-test reuses the same converted point.
- Frequent commits: one commit per task.

---

### Task 1: Persistence schema — per-segment `labelText`

Extend the storage schema and the page's strip state so each segment carries a `labelText` field. No visible behavior change yet, so it is a safe first commit.

**Files:**
- Modify: `app/composables/useProjectStorage.ts:32-35` (`SavedStripSegment` type)
- Modify: `app/pages/index.vue:100-109` (strip state refs + `resetStripState`), `:832, :834` (`appendImageToRight` segment construction), `:1562-1564` (save payload), `:1660-1661` (load restore)

**Interfaces:**
- Consumes: existing `SavedStripSegment`, `SavedStrip`, `BuildSaveInput` in `useProjectStorage.ts`; existing `stripSegments` in `index.vue`.
- Produces (used by all later tasks):
  - `SavedStripSegment.labelText?: string` (exported from `useProjectStorage.ts`)
  - `stripSegments[].labelText: string` (in-memory; default `""`)

- [ ] **Step 1: Add `labelText` to the storage type**

In `app/composables/useProjectStorage.ts`, change `SavedStripSegment` (lines 32-35) to:

```ts
export type SavedStripSegment = {
  x: number
  width: number
  labelText?: string
}
```

- [ ] **Step 2: Extend the in-memory segment type with `labelText`**

In `app/pages/index.vue`, change the strip segments ref (line 102) to:

```ts
const stripSegments = ref<{ x: number, width: number, labelText: string }[]>([])
```

- [ ] **Step 3: Add the editor state refs**

In `app/pages/index.vue`, immediately after the existing strip refs (after line 104, before `resetStripState` at line 106), insert:

```ts
const editingLabelIndex = ref<number | null>(null)
const editingLabelDraft = ref('')
```

- [ ] **Step 4: Extend `resetStripState` to clear the editor**

In `app/pages/index.vue`, change `resetStripState` (lines 106-109) to:

```ts
function resetStripState() {
  editingLabelIndex.value = null
  editingLabelDraft.value = ''
  stripSegments.value = []
  labelsEnabled.value = sessionLabelDefault.value
}
```

- [ ] **Step 5: Initialize `labelText: ''` in `appendImageToRight`**

In `app/pages/index.vue`, in `appendImageToRight` (lines 800-847), there are two places that build segment objects. Change them to include `labelText: ''`:

Line 832 currently:
```ts
        stripSegments.value = [{ x: 0, width: oldWidth }]
```
becomes:
```ts
        stripSegments.value = [{ x: 0, width: oldWidth, labelText: '' }]
```

Line 834 currently:
```ts
    stripSegments.value = [...stripSegments.value, { x: oldWidth + STRIP_GAP, width: img.naturalWidth }]
```
becomes:
```ts
    stripSegments.value = [...stripSegments.value, { x: oldWidth + STRIP_GAP, width: img.naturalWidth, labelText: '' }]
```

- [ ] **Step 6: Persist `labelText` in `performSave`**

In `app/pages/index.vue`, in `performSave` (around lines 1562-1564), the strip payload builds a shallow copy of segments. Change the `segments` map to:

```ts
        ? { segments: stripSegments.value.map(s => ({ x: s.x, width: s.width, labelText: s.labelText })), labelsEnabled: labelsEnabled.value }
```

- [ ] **Step 7: Restore `labelText` in `loadSavedProjectIntoCanvas`**

In `app/pages/index.vue`, in the load-restore branch (lines 1660-1661), change:

```ts
      stripSegments.value = saved.strip.segments.map(s => ({ x: s.x, width: s.width, labelText: s.labelText ?? '' }))
```

- [ ] **Step 8: Verify the build**

Run: `pnpm build`
Expected: exits 0. The `SavedStripSegment` type widening is a no-op for existing saves (the field is optional and defaults to `""` on load), so no version bump is needed.

- [ ] **Step 9: Commit**

```bash
git add app/composables/useProjectStorage.ts app/pages/index.vue
git commit -m "Add labelText field to strip segments (state + persistence)"
```

---

### Task 2: `getLabelMetrics` helper + pill-when-long rendering

Rework `drawStripLabels` to share a single `getLabelMetrics` helper that decides between a circle and a pill based on measured text width. After this task, custom text wider than the circle renders as a pill with auto-shrunk font; auto-numbers still render as circles exactly as today.

**Files:**
- Modify: `app/pages/index.vue:557-581` (`drawStripLabels`)

**Interfaces:**
- Consumes: `stripSegments` (from Task 1), `labelsEnabled`, `getCanvas()`.
- Produces:
  - `getLabelMetrics(seg, i, radius, ctx): { text: string, fontSize: number, isPill: boolean, rect: { x, y, w, h } }` — pure function, no state mutation. `rect` is in canvas coordinates.

- [ ] **Step 1: Add constants near the existing `STRIP_GAP` constant**

In `app/pages/index.vue`, immediately after `const STRIP_GAP = 8` (line 101), insert:

```ts
const LABEL_MIN_FONT = 8
const LABEL_PILL_PADDING_RATIO = 0.5
const LABEL_FOCUS_RING_COLOR = '#6366f1'
```

- [ ] **Step 2: Add the `displayedLabelText` helper**

In `app/pages/index.vue`, immediately after the editor state refs (the new lines added in Task 1), insert:

```ts
function displayedLabelText(seg: { labelText: string }, i: number): string {
  return seg.labelText || String(i + 1)
}
```

- [ ] **Step 3: Add `getLabelMetrics`**

In `app/pages/index.vue`, immediately before `drawStripLabels` (which currently starts at line 557), insert:

```ts
function getLabelMetrics(
  seg: { x: number, width: number, labelText: string },
  i: number,
  radius: number,
  ctx: CanvasRenderingContext2D,
): { text: string, fontSize: number, isPill: boolean, rect: { x: number, y: number, w: number, h: number } } {
  const inset = radius * 0.75 + 6
  const cy = inset + radius
  const cx = seg.x + inset + radius
  const text = displayedLabelText(seg, i)
  let fontSize = Math.round(radius)
  ctx.font = `bold ${fontSize}px sans-serif`
  let textWidth = ctx.measureText(text).width

  // Fits in a circle: text width <= diameter minus 4px slack.
  if (textWidth <= 2 * radius - 4) {
    return {
      text,
      fontSize,
      isPill: false,
      rect: { x: cx - radius, y: cy - radius, w: 2 * radius, h: 2 * radius },
    }
  }

  // Pill path: shrink font down to LABEL_MIN_FONT, then ellipsize once.
  // Pill is sized to fit the text, capped only by the segment width so it never overflows the image.
  const pillPadding = radius * LABEL_PILL_PADDING_RATIO
  const maxPillWidth = seg.width - inset * 2
  let pillWidth = textWidth + 2 * pillPadding

  if (pillWidth > maxPillWidth) {
    while (fontSize > LABEL_MIN_FONT && pillWidth > maxPillWidth) {
      fontSize -= 1
      ctx.font = `bold ${fontSize}px sans-serif`
      textWidth = ctx.measureText(text).width
      pillWidth = textWidth + 2 * pillPadding
    }
    if (pillWidth > maxPillWidth) {
      const maxChars = Math.max(3, Math.floor((maxPillWidth / fontSize) * 1.5))
      const truncated = text.length > maxChars ? text.slice(0, Math.max(1, maxChars - 1)) + '…' : text
      ctx.font = `bold ${fontSize}px sans-serif`
      textWidth = ctx.measureText(truncated).width
      pillWidth = Math.min(textWidth + 2 * pillPadding, maxPillWidth)
    }
  }

  return {
    text,
    fontSize,
    isPill: true,
    rect: { x: seg.x + inset, y: cy - radius, w: pillWidth, h: 2 * radius },
  }
}
```

- [ ] **Step 4: Rewrite `drawStripLabels` to use `getLabelMetrics`**

In `app/pages/index.vue`, replace `drawStripLabels` (lines 557-581) with:

```ts
function drawStripLabels(ctx: CanvasRenderingContext2D) {
  const canvas = getCanvas()
  if (!canvas || stripSegments.value.length < 2 || !labelsEnabled.value) return
  const radius = Math.min(28, Math.max(14, canvas.height * 0.03))
  ctx.save()
  for (let i = 0; i < stripSegments.value.length; i++) {
    const seg = stripSegments.value[i]!
    const m = getLabelMetrics(seg, i, radius, ctx)
    ctx.beginPath()
    if (m.isPill) {
      ctx.roundRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h, radius)
    } else {
      const cx = m.rect.x + radius
      const cy = m.rect.y + radius
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#18181b'
    ctx.stroke()
    ctx.fillStyle = '#18181b'
    ctx.font = `bold ${m.fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = m.rect.x + m.rect.w / 2
    const cy = m.rect.y + m.rect.h / 2
    ctx.fillText(m.text, cx, cy)
    if (editingLabelIndex.value === i) {
      ctx.beginPath()
      if (m.isPill) {
        ctx.roundRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h, radius)
      } else {
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      }
      ctx.strokeStyle = LABEL_FOCUS_RING_COLOR
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }
  ctx.restore()
}
```

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue
git commit -m "Render strip labels as pill when text exceeds circle"
```

---

### Task 3: Hit-testing + open editor on click

Wire up the canvas mouse-down flow so a click inside a label opens the editor for that segment. After this task, clicking a label on the canvas places an empty-positioned (placeholder) input over it; the input is wired in Task 4.

**Files:**
- Modify: `app/pages/index.vue:917-994` (`startDrawing`), add new function `hitTestLabel` near `drawStripLabels`

**Interfaces:**
- Consumes: `stripSegments`, `labelsEnabled`, `editingLabelIndex`, `getLabelMetrics`, `redrawCanvas`.
- Produces: `hitTestLabel(canvasX, canvasY, ctx): number | null` — returns the index of the topmost label hit, or `null`. Pure (no side effects).

- [ ] **Step 1: Add `hitTestLabel`**

In `app/pages/index.vue`, immediately after `getLabelMetrics` (added in Task 2), insert:

```ts
function hitTestLabel(canvasX: number, canvasY: number, ctx: CanvasRenderingContext2D): number | null {
  if (!labelsEnabled.value) return null
  if (editingLabelIndex.value !== null) return null
  const canvas = getCanvas()
  if (!canvas) return null
  const radius = Math.min(28, Math.max(14, canvas.height * 0.03))
  for (let i = stripSegments.value.length - 1; i >= 0; i--) {
    const m = getLabelMetrics(stripSegments.value[i]!, i, radius, ctx)
    if (
      canvasX >= m.rect.x && canvasX <= m.rect.x + m.rect.w &&
      canvasY >= m.rect.y && canvasY <= m.rect.y + m.rect.h
    ) return i
  }
  return null
}
```

- [ ] **Step 2: Branch in `startDrawing` to open the editor**

In `app/pages/index.vue`, in `startDrawing` (lines 917-994), the very first action after `e.preventDefault()` and the `hasImage` check is `spacePanActive` handling, then `getCanvasCoords(e)`. Insert the label hit-test **immediately after** the canvas coords are obtained (currently line 928) and **before** the existing `toolMode === 'move'` branch:

```ts
  const { x, y } = getCanvasCoords(e)
  const ctx = getCanvasContext()
  if (ctx) {
    const labelIdx = hitTestLabel(x, y, ctx)
    if (labelIdx !== null) {
      if (editingLabelIndex.value !== null && editingLabelIndex.value !== labelIdx) {
        commitLabelEdit()
      }
      editingLabelIndex.value = labelIdx
      editingLabelDraft.value = displayedLabelText(stripSegments.value[labelIdx]!, labelIdx)
      redrawCanvas()
      e.stopPropagation()
      return
    }
  }
```

The position is unchanged. The `ctx` variable is reused by the existing draw code below.

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: exits 0. (`commitLabelEdit` is defined in Task 4 — for now, add a temporary stub at the bottom of the script so the typechecker is happy, then remove it after Task 4 lands.)

Add this stub near the bottom of `<script setup>` (anywhere after the `displayedLabelText` helper is fine):

```ts
function commitLabelEdit() {
  // Implemented in Task 4.
}
```

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.vue
git commit -m "Hit-test strip labels on canvas mousedown"
```

---

### Task 4: Inline editor — input overlay, commit/cancel, tab navigation

Add the `<input>` element to the template, the position/size computed, the commit/cancel/tab logic, and the `@blur` handler. After this task, clicking a label opens a focused, text-selected input positioned over the label; Enter commits, Esc cancels, Tab moves to the next label.

**Files:**
- Modify: `app/pages/index.vue` (script: add `labelEditorStyle`, `labelEditorInputRef`, `commitLabelEdit`, `cancelLabelEdit`, `onLabelEditorTab`, `clearLabelEditor`; remove the Task 3 stub; modify `toggleStripLabels` to also clear the editor)
- Modify: `app/pages/index.vue:2885-2897` (template: add the `<input>` element below the existing text overlay)

**Interfaces:**
- Consumes: `stripSegments`, `editingLabelIndex`, `editingLabelDraft`, `getLabelMetrics`, `getCanvas`, `canvasWrapperRef`.
- Produces:
  - `labelEditorInputRef: Ref<HTMLInputElement | null>`
  - `labelEditorStyle: ComputedRef<Record<string, string>>` — CSS `left`, `top`, `width`, `height`, `fontSize` for the overlay.
  - `commitLabelEdit(): void`
  - `cancelLabelEdit(): void`
  - `onLabelEditorTab(e: KeyboardEvent): void`

- [ ] **Step 1: Remove the Task 3 stub and add the real `commitLabelEdit`**

In `app/pages/index.vue`, delete the `commitLabelEdit` stub added in Task 3 and replace it with the real implementation (place it near the other label helpers, e.g. right after `onLabelEditorTab`):

```ts
function commitLabelEdit() {
  const i = editingLabelIndex.value
  if (i == null) return
  const next = editingLabelDraft.value.trim()
  if (next !== stripSegments.value[i]!.labelText) {
    stripSegments.value = stripSegments.value.map((s, idx) =>
      idx === i ? { ...s, labelText: next } : s,
    )
  }
  editingLabelIndex.value = null
  editingLabelDraft.value = ''
  redrawCanvas()
  scheduleAutoSave()
}
```

- [ ] **Step 2: Add `cancelLabelEdit` and `onLabelEditorTab`**

In `app/pages/index.vue`, immediately after `commitLabelEdit`, insert:

```ts
function cancelLabelEdit() {
  editingLabelIndex.value = null
  editingLabelDraft.value = ''
  redrawCanvas()
}

function onLabelEditorTab(e: KeyboardEvent) {
  const i = editingLabelIndex.value
  if (i == null) return
  const total = stripSegments.value.length
  const next = e.shiftKey ? (i - 1 + total) % total : (i + 1) % total
  commitLabelEdit()
  editingLabelIndex.value = next
  editingLabelDraft.value = displayedLabelText(stripSegments.value[next]!, next)
  redrawCanvas()
  nextTick(() => labelEditorInputRef.value?.focus())
}
```

- [ ] **Step 3: Add `labelEditorInputRef` and `labelEditorStyle`**

In `app/pages/index.vue`, immediately after the existing `textInputRef` declaration (line 72), insert:

```ts
const labelEditorInputRef = ref<HTMLInputElement | null>(null)
```

Then immediately after the existing `textInputStyle` computed (around line 1172, after the closing `}`), insert:

```ts
const labelEditorStyle = computed(() => {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper) return {}
  const ctx = canvas.getContext('2d')
  if (!ctx) return {}
  const i = editingLabelIndex.value
  if (i == null) return {}
  const seg = stripSegments.value[i]
  if (!seg) return {}
  const radius = Math.min(28, Math.max(14, canvas.height * 0.03))
  // Size the editor overlay to the current draft so the input grows as the user types.
  const draftSeg = { ...seg, labelText: editingLabelDraft.value }
  const m = getLabelMetrics(draftSeg, i, radius, ctx)
  const canvasRect = canvas.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  const scaleX = canvasRect.width / canvas.width
  const scaleY = canvasRect.height / canvas.height
  return {
    left: `${canvasRect.left - wrapperRect.left + m.rect.x * scaleX}px`,
    top: `${canvasRect.top - wrapperRect.top + m.rect.y * scaleY}px`,
    width: `${m.rect.w * scaleX}px`,
    height: `${m.rect.h * scaleY}px`,
    fontSize: `${m.fontSize * scaleY}px`,
  }
})
```

- [ ] **Step 4: Add a focus-on-open watcher**

In `app/pages/index.vue`, immediately after the `labelEditorStyle` computed, insert:

```ts
watch(editingLabelIndex, async (idx) => {
  if (idx == null) return
  await nextTick()
  labelEditorInputRef.value?.focus()
  labelEditorInputRef.value?.select()
})
```

- [ ] **Step 5: Update `toggleStripLabels` to close the editor when labels are hidden**

In `app/pages/index.vue`, change `toggleStripLabels` (lines 147-151) to:

```ts
function toggleStripLabels() {
  labelsEnabled.value = !labelsEnabled.value
  if (!labelsEnabled.value) {
    editingLabelIndex.value = null
    editingLabelDraft.value = ''
  }
  redrawCanvas()
  scheduleAutoSave()
}
```

- [ ] **Step 6: Add the `<input>` element to the template**

In `app/pages/index.vue`, immediately after the existing text-input `<textarea>` (which ends at line 2897), insert:

```html
        <!-- Strip label editor overlay -->
        <input
          v-show="editingLabelIndex !== null"
          ref="labelEditorInputRef"
          v-model="editingLabelDraft"
          type="text"
          maxlength="64"
          class="absolute z-20 px-2 border-2 border-indigo-500 rounded shadow-xl outline-none text-center"
          :class="[isDark ? 'bg-zinc-900/95 text-white' : 'bg-white/95 text-slate-900']"
          :style="labelEditorStyle"
          @keydown.enter.prevent="commitLabelEdit"
          @keydown.escape.prevent="cancelLabelEdit"
          @keydown.tab.prevent="onLabelEditorTab"
          @blur="commitLabelEdit"
        />
```

- [ ] **Step 7: Verify the build**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add app/pages/index.vue
git commit -m "Add inline editor for strip labels"
```

---

### Task 5: Hover cursor — show I-beam over labels

When the mouse hovers a label, change the canvas cursor to a text I-beam so the user can see the label is clickable/editable. Implemented with a new `hoveredLabelIndex` ref updated on every mousemove, plus an extra branch in `canvasCursorClass`.

**Files:**
- Modify: `app/pages/index.vue:66` (add `hoveredLabelIndex` next to `hoveredAnnotationIndex`), `:870-873, :1934, :1961` (reset alongside `hoveredAnnotationIndex`), `:1146-1197` (`draw` handler, append hover-detection branch), `:2264-2277` (`canvasCursorClass`)

**Interfaces:**
- Consumes: `hitTestLabel` (from Task 3), `getCanvasContext`, `getCanvasCoords`, `labelsEnabled`, `editingLabelIndex`.
- Produces: `hoveredLabelIndex: ref<number | null>(null)` — segment index under the mouse, or `null`. Cleared on `onCanvasMouseLeave` and on every reset site alongside `hoveredAnnotationIndex`.

- [ ] **Step 1: Add the `hoveredLabelIndex` ref**

In `app/pages/index.vue`, immediately after `const hoveredAnnotationIndex = ref<number | null>(null)` (line 66), insert:

```ts
const hoveredLabelIndex = ref<number | null>(null)
```

- [ ] **Step 2: Reset it everywhere `hoveredAnnotationIndex` is reset**

Three sites:
- Line 870: add `hoveredLabelIndex.value = null` immediately after the existing `hoveredAnnotationIndex.value = null`.
- Line 1934 (`onCanvasMouseLeave`): same — add the line right after.
- Line 1961: same.

- [ ] **Step 3: Track hover in the `draw` handler**

In `app/pages/index.vue`, the `draw` function ends at line 1197. After the existing `toolMode === 'move' && !moveDragging.value && !resizeDragging.value` branch's closing `}`, append:

```ts
  // Label hover: tracked on every mousemove so the cursor reflects hover state
  // outside of move mode too. hitTestLabel early-returns when labels are off
  // or an edit is open, so this is a cheap no-op in those cases.
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

- [ ] **Step 4: Update `canvasCursorClass` to return `cursor-text` on label hover**

In `app/pages/index.vue`, modify `canvasCursorClass` (lines 2264-2276) to return `cursor-text` when `hoveredLabelIndex !== null`. Priority order: `isPanning` > `spacePanActive` > label hover > tool mode.

```ts
const canvasCursorClass = computed(() => {
  if (isPanning.value) return 'cursor-grabbing'
  if (spacePanActive.value) return 'cursor-grab'
  if (hoveredLabelIndex.value !== null) return 'cursor-text'
  const cursors: Record<typeof toolMode.value, string> = {
    pen: 'cursor-crosshair',
    arrow: 'cursor-crosshair',
    box: 'cursor-crosshair',
    emoji: 'cursor-cell',
    text: 'cursor-text',
    move: 'cursor-grab active:cursor-grabbing',
  }
  return cursors[toolMode.value]
})
```

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue
git commit -m "Show text cursor on hover over strip labels"
```

---

### Task 6: README update + manual smoke test

Document the new "click a label to edit" affordance in the README, then walk through the spec's manual test checklist against `pnpm dev`.

**Files:**
- Modify: `README.md:14` (the existing "Append to right" bullet)

**Interfaces:**
- Consumes: nothing.
- Produces: updated user-facing docs.

- [ ] **Step 1: Update the README bullet**

In `README.md`, the line at 14 currently reads:

```
- **Append to right** – Chain multiple screenshots into one wide strip, with optional numbered sequence labels (1, 2, 3…)
```

Change it to:

```
- **Append to right** – Chain multiple screenshots into one wide strip, with optional sequence labels. Click a label on the canvas to replace the auto-number with custom text (e.g. "Step 1", "A"); the label auto-expands to a pill for longer text, and clearing the field reverts to the auto-number.
```

- [ ] **Step 2: Run the dev server and walk the smoke-test checklist**

Start: `pnpm dev`
Then verify each of the following by hand, exactly as listed in the spec at `docs/superpowers/specs/2026-07-31-editable-strip-labels-design.md` under "Testing":

1. Click a numbered label → input overlay appears positioned over the label with text selected. Type `Step 1` → Enter → label renders as `Step 1` in a pill.
2. Click the same label → input pre-fills with `Step 1`. Clear the field, blur → label reverts to the auto-number `1` in a circle.
3. Click label 1, type `A`, then click label 2 without pressing Enter → label 1 commits as `A`, label 2 opens for editing. Both render.
4. Click a label, press Esc → no change; overlay closes.
5. Type a 30-character string in a label → font shrinks; text ellipsizes; pill never overflows the segment.
6. Edit a label, wait for auto-save, reload the page → custom text restored.
7. Edit a label, then click **Clear** → in-flight edit discarded; no stale overlay.
8. Edit a label, then click **Replace** in the paste dialog → in-flight edit discarded; new image is a single segment.
9. With the toolbar **Labels** toggle off, click where a label would be → no edit overlay.
10. Zoom in (mouse wheel or zoom control), click a label → input tracks the new size; commits render at the new font.
11. Copy the canvas to clipboard with a custom label → clipboard image contains the custom text.
12. Save the project, reload via the Saves panel → custom labels restored.
13. Existing append-to-right checks 1–8 still pass (see `2026-07-30-append-to-right-design.md`).

If any check fails, fix the issue, re-run `pnpm build` to confirm, then re-test.

- [ ] **Step 3: Stop the dev server**

Run: `Ctrl+C` in the terminal where `pnpm dev` is running.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document editable strip labels in README"
```
