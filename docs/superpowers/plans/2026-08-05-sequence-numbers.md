# Sequence Numbers Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sequence Numbers" tool that places numbered white-circle callouts (1, 2, 3…) onto the canvas, auto-renumbering contiguously when one is deleted in Move mode.

**Architecture:** A pure util `app/utils/sequence.ts` derives each sequence annotation's number from its index among `type === 'sequence'` annotations in the existing single `annotations` array (no stored counter). The SFC (`app/pages/index.vue`) adds a `sequence` member to the tool-mode union and annotation union, renders derived numbers in `drawAnnotations`, places them on click, lets the Move tool drag them, and adds a general Delete/Backspace delete in Move mode.

**Tech Stack:** Nuxt 4 (Vue 3 `<script setup>` SFC), Vitest + happy-dom, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind.

## Global Constraints

- `app/utils/` is auto-imported into Vue SFCs (e.g. `colorOverCheckerStyle` is used with no import in `index.vue`); the util functions are auto-available in `index.vue` **after `npx nuxt prepare` regenerates `.nuxt/imports.d.ts`**.
- Tests import utils explicitly from `~/utils/...` (alias `~` → `app/`), matching `tests/unit/color.test.ts`.
- `noUncheckedIndexedAccess: true` — use `!` after indexed reads (e.g. `anns[i]!`), matching existing code style.
- Sequence circles are always white fill + black number; the global `strokeColor`/`strokeWidth` must NOT affect them.
- Fixed radius constant `SEQ_RADIUS = 28`; no size UI, no resize handles.
- Numbers are derived only — never stored on the annotation object.
- Delete/Backspace deletes the hovered annotation **only in Move mode**, and must not fire when an input/textarea/contenteditable is focused (`isEditableTarget` guard already at the top of `handleKeydown`).

---

### Task 1: Sequence numbering utility + unit tests

**Files:**
- Create: `app/utils/sequence.ts`
- Test: `tests/unit/sequence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `assignSequenceNumbers(anns: readonly { type: string }[]): Map<number, number>` — maps array index → 1-based number, one entry per `type === 'sequence'` annotation. Later tasks use this for rendering and for verifying renumber-on-delete.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sequence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assignSequenceNumbers } from '~/utils/sequence'

type AnyAnn = { type: string }

const seq = (): AnyAnn => ({ type: 'sequence', x: 0, y: 0, radius: 28 })

describe('assignSequenceNumbers', () => {
  it('assigns contiguous 1..N in array order, treating other types as gaps', () => {
    const anns: AnyAnn[] = [{ type: 'box' }, seq(), { type: 'text' }, seq(), seq()]
    expect([...assignSequenceNumbers(anns).entries()]).toEqual([[1, 1], [3, 2], [4, 3]])
  })

  it('returns an empty map when there are no sequence annotations', () => {
    expect(assignSequenceNumbers([{ type: 'box' }, { type: 'pen', path: [] }]).size).toBe(0)
  })

  it('renumbers contiguously after deleting the middle of 1..5 → 1..4', () => {
    const anns: AnyAnn[] = [seq(), seq(), seq(), seq(), seq()]
    const withoutThird = anns.filter((_, i) => i !== 2)
    expect([...assignSequenceNumbers(withoutThird).values()]).toEqual([1, 2, 3, 4])
  })

  it('renumbers after deleting the first: former 2nd becomes 1st', () => {
    const anns: AnyAnn[] = [seq(), seq()]
    const withoutFirst = anns.filter((_, i) => i !== 0)
    expect([...assignSequenceNumbers(withoutFirst).values()]).toEqual([1])
  })

  it('gives an appended sequence annotation the next number (placement memory)', () => {
    const anns: AnyAnn[] = [seq(), seq(), seq()]
    const withNew = [...anns, seq()]
    expect(assignSequenceNumbers(withNew).get(withNew.length - 1)).toBe(4)
  })

  it('ignores a leading non-sequence annotation before numbering', () => {
    const anns: AnyAnn[] = [{ type: 'pen', path: [] }, { type: 'box' }, seq()]
    expect(assignSequenceNumbers(anns).get(2)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/sequence.test.ts`
Expected: FAIL — "Failed to resolve import '~/utils/sequence'" / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/utils/sequence.ts`:

```ts
export function assignSequenceNumbers(anns: readonly { type: string }[]): Map<number, number> {
  const numbers = new Map<number, number>()
  let counter = 0
  for (let i = 0; i < anns.length; i++) {
    if (anns[i]!.type === 'sequence') {
      counter += 1
      numbers.set(i, counter)
    }
  }
  return numbers
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/sequence.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Regenerate Nuxt auto-import types (so SFCs see the new util)**

Run: `npx nuxt prepare`
Expected: exits 0, regenerates `.nuxt/imports.d.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/utils/sequence.ts tests/unit/sequence.test.ts
git commit -m "feat: add sequence numbering utility with tests"
```

---

### Task 2: Sequence annotation type, tool mode, and canvas rendering

**Files:**
- Modify: `app/pages/index.vue` —
  - tool mode union at `index.vue:51`
  - annotation types/union at `index.vue:170-176`
  - `drawAnnotations` at `index.vue:609-649`

**Interfaces:**
- Consumes: `assignSequenceNumbers` from Task 1 (auto-imported, no import line).
- Produces: type `SequenceAnnotation = { type: 'sequence', x, y, radius }` (member of `Annotation`), tool mode literal `'sequence'`, constant `SEQ_RADIUS = 28`. Later tasks rely on these exact names.

- [ ] **Step 1: Extend the tool-mode union**

At `app/pages/index.vue:51`, change:

```ts
const toolMode = ref<'pen' | 'arrow' | 'box' | 'emoji' | 'text' | 'move'>('pen')
```

to:

```ts
const toolMode = ref<'pen' | 'arrow' | 'box' | 'emoji' | 'text' | 'move' | 'sequence'>('pen')
```

- [ ] **Step 2: Add the annotation type, union member, and radius constant**

Immediately before `type PenStroke = ...` at `app/pages/index.vue:170`, add:

```ts
const SEQ_RADIUS = 28
type SequenceAnnotation = { type: 'sequence', x: number, y: number, radius: number }
```

At `app/pages/index.vue:176`, change:

```ts
type Annotation = PenStroke | ArrowAnnotation | BoxAnnotation | EmojiAnnotation | TextAnnotation | ImageAnnotation
```

to:

```ts
type Annotation = PenStroke | ArrowAnnotation | BoxAnnotation | EmojiAnnotation | TextAnnotation | ImageAnnotation | SequenceAnnotation
```

- [ ] **Step 3: Render sequence numbers in `drawAnnotations`**

Replace the whole `drawAnnotations` function (currently `app/pages/index.vue:609-649`) with the version below. It converts the loop to index-based so the util's index map applies, and adds the `sequence` branch. Keep every existing branch body identical.

```ts
function drawAnnotations(ctx: CanvasRenderingContext2D) {
  const sequenceNumbers = assignSequenceNumbers(annotations.value)
  for (let i = 0; i < annotations.value.length; i++) {
    const ann = annotations.value[i]!
    if (ann.type === 'image') {
      const img = imageElementCache.get(ann.id)
      if (img) ctx.drawImage(img, ann.x, ann.y, ann.width, ann.height)
    } else if (ann.type === 'pen') {
      if (ann.path.length < 2) continue
      ctx.strokeStyle = ann.color
      ctx.lineWidth = ann.lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(ann.path[0].x, ann.path[0].y)
      for (let j = 1; j < ann.path.length; j++) {
        ctx.lineTo(ann.path[j]!.x, ann.path[j]!.y)
      }
      ctx.stroke()
    } else if (ann.type === 'sequence') {
      const number = sequenceNumbers.get(i) ?? 0
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(ann.x, ann.y, ann.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = `bold ${Math.round(ann.radius)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#000000'
      ctx.fillText(String(number), ann.x, ann.y)
    } else if (ann.type === 'arrow') {
      drawArrow(ctx, ann)
    } else if (ann.type === 'box') {
      ctx.strokeStyle = ann.color
      ctx.lineWidth = ann.lineWidth
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height)
    } else if (ann.type === 'emoji') {
      ctx.font = `${ann.size}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ann.emoji, ann.x, ann.y)
    } else if (ann.type === 'text') {
      ctx.font = `${ann.fontSize}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = ann.color
      const lines = ann.text.split('\n')
      const lineHeight = ann.fontSize * 1.2
      for (let j = 0; j < lines.length; j++) {
        ctx.fillText(lines[j]!, ann.x, ann.y + j * lineHeight)
      }
    }
  }
}
```

Note: `assignSequenceNumbers` is auto-imported (Task 1 Step 5 ensured types). If `npm run typecheck` reports it as not found, re-run `npx nuxt prepare`.

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck`
Expected: PASS (no errors).

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: add sequence annotation type and canvas rendering"
```

---

### Task 3: Placement, toolbar button, and keyboard shortcut

**Files:**
- Modify: `app/pages/index.vue` —
  - `onCanvasClick` at `index.vue:1361-1390`
  - `TOOL_SHORTCUTS` at `index.vue:2430-2437`
  - toolbar tool-strip template: insert after the Move button (`index.vue:2767`) inside the tool-strip `<div>` that closes at `index.vue:2768`

**Interfaces:**
- Consumes: `SEQ_RADIUS` and `'sequence'` tool mode from Task 2; existing `pushAnnotationState`, `annotations`, `redrawCanvas`, `setToolMode`, `registerToolButton`.
- Produces: The placement behavior and toolbar entry; keyboard shortcut `'7'`.

- [ ] **Step 1: Place a sequence label on click**

In `onCanvasClick` (`app/pages/index.vue:1361`), insert a new branch between the existing `emoji` block (ends at line ~1380, before `if (toolMode.value === 'text')` at line 1382):

```ts
  if (toolMode.value === 'sequence') {
    pushAnnotationState()
    annotations.value = [...annotations.value, {
      type: 'sequence',
      x, y,
      radius: SEQ_RADIUS,
    }]
    redrawCanvas()
    return
  }
```

- [ ] **Step 2: Add the keyboard shortcut**

At `app/pages/index.vue:2430-2437`, change:

```ts
const TOOL_SHORTCUTS: Record<string, typeof toolMode.value> = {
  '1': 'pen',
  '2': 'arrow',
  '3': 'box',
  '4': 'emoji',
  '5': 'text',
  '6': 'move',
}
```

to:

```ts
const TOOL_SHORTCUTS: Record<string, typeof toolMode.value> = {
  '1': 'pen',
  '2': 'arrow',
  '3': 'box',
  '4': 'emoji',
  '5': 'text',
  '6': 'move',
  '7': 'sequence',
}
```

- [ ] **Step 3: Add the toolbar button**

Immediately after the Move `<button>` block (`app/pages/index.vue:2767`, before the tool-strip closing `</div>` at line 2768), insert:

```html
          <button
            type="button"
            :ref="(el) => registerToolButton('sequence', el)"
            :class="[toolMode === 'sequence' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
            class="relative z-10 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            :disabled="!hasImage"
            title="Sequence (7)"
            @click="setToolMode('sequence')"
          >
            <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'sequence' }" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text></svg>
            <span class="hidden sm:inline">Sequence</span>
          </button>
```

(The icon mirrors the existing "Labels" button SVG at `index.vue:2785`; the animated tool indicator picks this up automatically via `registerToolButton`/`updateToolIndicator`.)

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: add sequence tool placement, toolbar button, and shortcut"
```

---

### Task 4: Drag sequence annotations in Move mode

**Files:**
- Modify: `app/pages/index.vue` —
  - hit-test helpers: add `hitTestSequence` after `hitTestBox` (`index.vue:1521`)
  - `getAnnotationAt` at `index.vue:1580-1591`
  - `translateAnnotation` at `index.vue:1593-1611`

**Interfaces:**
- Consumes: `SequenceAnnotation` type (Task 2).
- Produces: `hitTestSequence(seq: SequenceAnnotation, x: number, y: number): boolean` (used by `getAnnotationAt`); `sequence` handling in `translateAnnotation`. Task 5 consumes these via the shared move-mode hit-test (`getHoveredAnnotationForMoveMode`).

- [ ] **Step 1: Add a circle hit-test helper**

Immediately after `hitTestBox` (currently `app/pages/index.vue:1517-1521`), add:

```ts
function hitTestSequence(seq: SequenceAnnotation, x: number, y: number): boolean {
  return Math.hypot(x - seq.x, y - seq.y) <= seq.radius
}
```

- [ ] **Step 2: Include sequence in the Move-tool hover hit-test**

In `getAnnotationAt` (`app/pages/index.vue:1580`), change:

```ts
    if (ann.type === 'pen' && hitTestPenStroke(ann, canvasX, canvasY)) return i
```

to:

```ts
    if (ann.type === 'pen' && hitTestPenStroke(ann, canvasX, canvasY)) return i
    if (ann.type === 'sequence' && hitTestSequence(ann, canvasX, canvasY)) return i
```

- [ ] **Step 3: Support dragging**

In `translateAnnotation` (`app/pages/index.vue:1593`), change:

```ts
  } else if (ann.type === 'pen') {
    next[index] = { ...ann, path: ann.path.map(p => ({ x: p.x + dx, y: p.y + dy })) }
  }
```

to:

```ts
  } else if (ann.type === 'pen') {
    next[index] = { ...ann, path: ann.path.map(p => ({ x: p.x + dx, y: p.y + dy })) }
  } else if (ann.type === 'sequence') {
    next[index] = { ...ann, x: ann.x + dx, y: ann.y + dy }
  }
```

(Resize handles intentionally do NOT apply to sequence labels: `getResizeHandlePosition` returns `null` for them by default, so `hitTestResizeHandle` stays false.)

- [ ] **Step 4: Verify typecheck and lint pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: support dragging sequence annotations in move mode"
```

---

### Task 5: Delete the hovered annotation with Delete/Backspace in Move mode

**Files:**
- Modify: `app/pages/index.vue` — `handleKeydown` at `index.vue:2439-2501` (insert after the `Escape` block ending at line 2482, before the modifier-key bail-out at line 2484)

**Interfaces:**
- Consumes: `hoveredAnnotationIndex`, `pushAnnotationState`, `annotations`, `selectedArrowIndex`, `redrawCanvas` (all existing); `isEditableTarget` guard already returns early at the top of `handleKeydown`.
- Produces: Delete/Backspace removes the hovered annotation in Move mode; renumbering of remaining sequence labels is automatic because numbers are derived from array order (Task 1 semantics).

- [ ] **Step 1: Add the delete handler**

In `handleKeydown` (`app/pages/index.vue:2439`), insert the following block immediately after the `Escape` block (which ends with `closeToolbarMenu(); return` around line 2481) and before the line `if (e.metaKey || e.ctrlKey || e.altKey) return`:

```ts
  if ((e.key === 'Delete' || e.key === 'Backspace') && toolMode.value === 'move') {
    const idx = hoveredAnnotationIndex.value
    if (idx !== null && idx < annotations.value.length) {
      e.preventDefault()
      pushAnnotationState()
      annotations.value = annotations.value.filter((_, i) => i !== idx)
      hoveredAnnotationIndex.value = null
      selectedArrowIndex.value = null
      redrawCanvas()
      return
    }
  }
```

Important: this insertion must stay **after** the `isEditableTarget(e.target)` early-return at `index.vue:2440`, so Backspace while typing in the text/label editor never deletes an annotation.

- [ ] **Step 2: Verify typecheck and lint pass**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat: allow deleting hovered annotation with Delete/Backspace in move mode"
```

---

### Task 6: Help content update and full verification

**Files:**
- Modify: `app/components/HelpContent.vue` — tool description paragraph at `HelpContent.vue:27`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing (documentation + verification gate).

- [ ] **Step 1: Mention the Sequence tool in help**

At `app/components/HelpContent.vue:27`, change the sentence (currently ends `...adds a label you can type directly on the canvas.`):

```html
      Pick a tool from the toolbar and draw on the image. <span class="font-semibold">Pen</span> is for freehand squiggles. <span class="font-semibold">Arrow</span> is for pointing at something specific. <span class="font-semibold">Box</span> draws a rectangle to highlight a region. <span class="font-semibold">Emoji</span> drops a reaction from a built-in picker. <span class="font-semibold">Text</span> adds a label you can type directly on the canvas. <span class="font-semibold">Sequence</span> adds numbered step markers (1, 2, 3…) that renumber themselves when you delete one.
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm run test`
Expected: ALL PASS (existing + new sequence tests).

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual smoke check**

Run: `npm run dev`, load an image, then:
1. Press `7` or click the **Sequence** button; click the canvas 5 times — labels 1..5 appear as white circles with black numbers.
2. Select **Move**, hover over a number (it highlights), press **Delete/Backspace** — the count drops by one and remaining labels renumber contiguously (e.g. delete the 3rd of 5 → 1,2,3,4).
3. In Move mode, drag a number elsewhere — it stays, numbering unchanged (array order unchanged).
4. Press `Ctrl+Z` after a delete — the label and its original number return.
5. Save the project, reload — numbers persist and recompute from array order.

- [ ] **Step 4: Commit**

```bash
git add app/components/HelpContent.vue
git commit -m "docs: mention sequence tool in help"
```

---

## Self-Review Notes

- **Spec coverage:** type + tool mode + rendering (Task 2), click placement + toolbar + shortcut 7 (Task 3), move/drag (Task 4), Delete/Backspace renumbering (Task 5 + Task 1 tests), persistence via plain annotations (inherited, no change needed), testing (Task 1), help polish (Task 6).
- **Type consistency:** `SequenceAnnotation`, `SEQ_RADIUS`, `assignSequenceNumbers`, `hitTestSequence`, tool literal `'sequence'` are named identically across all tasks.
