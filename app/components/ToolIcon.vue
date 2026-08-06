<script setup lang="ts">
defineProps<{
  mode: string
  pop: boolean
}>()
</script>

<template>
  <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': pop }" viewBox="0 0 24 24">
    <!-- Pen -->
    <g v-if="mode === 'pen'" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </g>
    <!-- Arrow -->
    <g v-else-if="mode === 'arrow'" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </g>
    <!-- Box -->
    <rect v-else-if="mode === 'box'" x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
    <!-- Emoji -->
    <g v-else-if="mode === 'emoji'" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" />
      <path stroke-linecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3" stroke-linecap="round" />
      <line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3" stroke-linecap="round" />
    </g>
    <!-- Text -->
    <path v-else-if="mode === 'text'" fill="currentColor" d="M3 7V5h18v2h-7v14h-4V7H3z" />
    <!-- Sequence -->
    <g v-else-if="mode === 'sequence'">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
      <text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text>
    </g>
    <!-- Move -->
    <g v-else-if="mode === 'move'" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </g>
    <!-- Eraser -->
    <g v-else-if="mode === 'eraser'" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.24 3.76a2 2 0 012.83 0l3.17 3.17a2 2 0 010 2.83L13 19H7l-4.24-4.24a2 2 0 010-2.83l9.48-8.17zM7 19h14" />
    </g>
  </svg>
</template>
