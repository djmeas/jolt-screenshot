<script setup lang="ts">
import { SAVES_ENABLED } from '~/utils/config'

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
      If you have an image file you'd rather upload, drop it onto the page or use the upload button at the top. Once an image is loaded, pasting or uploading another one will ask whether to replace it, append it to any edge as a new image in a sequence, or add it as a movable layer on top.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Mark it up
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      Pick a tool from the toolbar and draw on the image. <span class="font-semibold">Pen</span> is for freehand squiggles. <span class="font-semibold">Arrow</span> is for pointing at something specific. <span class="font-semibold">Box</span> draws a rectangle to highlight a region. <span class="font-semibold">Emoji</span> drops a reaction from a built-in picker. <span class="font-semibold">Text</span> adds a label you can type directly on the canvas. <span class="font-semibold">Sequence</span> adds numbered step markers (1, 2, 3…) that renumber themselves when you delete one. Each tool has a number key shortcut — press <span class="font-semibold">1–8</span> to switch instantly (the number is shown on the button).
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      To remove an annotation entirely, switch to the <span class="font-semibold">Eraser</span> and click it (or drag across several). To move an annotation or change its size, switch to the <span class="font-semibold">Move</span> tool, click the annotation, and drag. The handles around the edges let you resize.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      Made a mistake? <span class="font-semibold">Cmd+Z</span> / <span class="font-semibold">Ctrl+Z</span> (or the Undo button) steps back. The Clear button starts over with the same image.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Stitch multiple screenshots
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      To show a sequence — a before/after, a step-by-step, a bug repro — paste a second screenshot and choose <span class="font-semibold">Append to image</span>, then pick an edge: top, bottom, left, or right. JoltShot glues the two images together along that edge into one strip, with a small white gap between them. Paste a third and it joins the chain. The canvas grows automatically.
    </p>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
      Each image in the strip gets a small numbered circle in the top-left corner. Click any of them to rename it — for example "Step 1", "Before", or "A". The circle turns into a pill that grows to fit the text. Clear the field and it reverts to the auto-number.
    </p>

    <h3 :class="[isDark ? 'text-zinc-100' : 'text-slate-900']" class="text-base font-semibold mt-5 mb-1.5">
      Save and copy
    </h3>
    <p :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed">
      When your screenshot looks right, click <span class="font-semibold">Copy</span>. JoltShot puts the marked-up image on your clipboard as a PNG, ready to paste into a chat, a doc, an issue tracker, anywhere. Prefer a file? The <span class="font-semibold">Export</span> menu can save the image to disk as a PNG, or export a video of your work being built up — appended screenshots and annotations appear one at a time, at the pace you pick (adjust the "annotations per second" slider before exporting).
    </p>
    <p v-if="SAVES_ENABLED" :class="[isDark ? 'text-zinc-300' : 'text-zinc-700']" class="text-sm leading-relaxed mt-3">
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
