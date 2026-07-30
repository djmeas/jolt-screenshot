<script setup lang="ts">
const props = defineProps<{
  image: HTMLImageElement
  annotations: unknown[]
  isDark: boolean
  viewport: { x: number, y: number, w: number, h: number }
  drawThumbnail: (ctx: CanvasRenderingContext2D, scale: number) => void
}>()

const emit = defineEmits<{
  pan: [imageX: number, imageY: number]
}>()

const NAV_MAX = 180
const navRef = ref<HTMLCanvasElement | null>(null)

const navScale = computed(() =>
  Math.min(NAV_MAX / props.image.naturalWidth, NAV_MAX / props.image.naturalHeight)
)
const navW = computed(() => Math.max(1, Math.round(props.image.naturalWidth * navScale.value)))
const navH = computed(() => Math.max(1, Math.round(props.image.naturalHeight * navScale.value)))

let raf = 0

function render() {
  const canvas = navRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, navW.value, navH.value)
  ctx.save()
  ctx.scale(navScale.value, navScale.value)
  props.drawThumbnail(ctx, navScale.value)
  ctx.restore()

  const rx = props.viewport.x * navScale.value
  const ry = props.viewport.y * navScale.value
  const rw = props.viewport.w * navScale.value
  const rh = props.viewport.h * navScale.value
  ctx.fillStyle = 'rgba(99, 102, 241, 0.15)'
  ctx.fillRect(rx, ry, rw, rh)
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 1.5
  ctx.strokeRect(rx, ry, rw, rh)
}

function scheduleRender() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    render()
  })
}

watch(
  () => [props.viewport.x, props.viewport.y, props.viewport.w, props.viewport.h],
  scheduleRender
)
watch(() => props.annotations, scheduleRender, { deep: true })
watch(() => props.isDark, scheduleRender)

onMounted(render)
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

let dragging = false

function toImageCoords(e: PointerEvent) {
  const canvas = navRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * props.image.naturalWidth,
    y: ((e.clientY - rect.top) / rect.height) * props.image.naturalHeight,
  }
}

function onPointerDown(e: PointerEvent) {
  dragging = true
  navRef.value?.setPointerCapture(e.pointerId)
  const p = toImageCoords(e)
  emit('pan', p.x, p.y)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const p = toImageCoords(e)
  emit('pan', p.x, p.y)
}

function onPointerUp(e: PointerEvent) {
  dragging = false
  navRef.value?.releasePointerCapture(e.pointerId)
}
</script>

<template>
  <div
    class="absolute bottom-4 right-4 z-10 rounded-lg shadow-lg border overflow-hidden backdrop-blur-sm"
    :class="[isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-slate-200']"
  >
    <canvas
      ref="navRef"
      :width="navW"
      :height="navH"
      class="block cursor-crosshair"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    />
  </div>
</template>
