<script setup lang="ts">
const { isDark } = useColorMode()
</script>

<template>
  <div :class="[isDark ? 'bg-zinc-950' : 'bg-slate-100']" class="min-h-screen transition-colors duration-200">
    <NuxtPage />
  </div>
</template>