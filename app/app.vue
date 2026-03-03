<script setup lang="ts">
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const hasImage = ref(false)
const copied = ref(false)
const isDrawing = ref(false)

// Drawing state
const strokeColor = ref('#ef4444') // red
const strokeWidth = ref(4)
const originalImageData = ref<ImageData | null>(null)
const pastedImageUrl = ref<string | null>(null)

const colors = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Black', value: '#000000' }
]

const brushSizes = [2, 4, 8, 12]

// Get canvas context and dimensions
function getCanvasContext() {
  if (!canvasRef.value) return null
  return canvasRef.value.getContext('2d')
}

function getCanvas() {
  return canvasRef.value
}

// Load image from URL and render to canvas
function loadImageToCanvas(url: string) {
  const img = new Image()
  img.onload = () => {
    const canvas = getCanvas()
    const ctx = getCanvasContext()
    if (!canvas || !ctx) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight

    ctx.drawImage(img, 0, 0)
    originalImageData.value = ctx.getImageData(0, 0, canvas.width, canvas.height)
    hasImage.value = true
  }
  img.src = url
}

// Restore original image (clear annotations)
function clearAnnotations() {
  const canvas = getCanvas()
  const ctx = getCanvasContext()
  const imgData = originalImageData.value
  if (!canvas || !ctx || !imgData) return

  ctx.putImageData(imgData, 0, 0)
}

// Drawing helpers
function getCanvasCoords(e: MouseEvent | TouchEvent) {
  const canvas = getCanvas()
  if (!canvas) return { x: 0, y: 0 }

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  if ('touches' in e) {
    return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY
    }
  }
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
}

function startDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return
  isDrawing.value = true
  const ctx = getCanvasContext()
  if (!ctx) return
  const { x, y } = getCanvasCoords(e)
  ctx.beginPath()
  ctx.moveTo(x, y)
}

function draw(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!isDrawing.value || !hasImage.value) return
  const ctx = getCanvasContext()
  if (!ctx) return

  ctx.strokeStyle = strokeColor.value
  ctx.lineWidth = strokeWidth.value
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const { x, y } = getCanvasCoords(e)
  ctx.lineTo(x, y)
  ctx.stroke()
}

function stopDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  isDrawing.value = false
}

// Copy to clipboard
async function copyToClipboard() {
  const canvas = getCanvas()
  if (!canvas || !hasImage.value) return

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('Failed to create blob')

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ])
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// Paste handler
function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) {
        const url = URL.createObjectURL(file)
        pastedImageUrl.value = url
        loadImageToCanvas(url)
      }
      break
    }
  }
}

onMounted(() => {
  window.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
  if (pastedImageUrl.value) {
    URL.revokeObjectURL(pastedImageUrl.value)
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6"
  >
    <div class="w-full max-w-4xl">
      <!-- Toolbar -->
      <div
        class="flex flex-wrap items-center gap-4 p-4 bg-white rounded-t-xl border border-slate-200 border-b-0 shadow-sm"
      >
        <!-- Colors -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Color</span>
          <div class="flex gap-1">
            <button
              v-for="color in colors"
              :key="color.value"
              type="button"
              class="w-8 h-8 rounded-full border-2 transition-all"
              :class="[
                strokeColor === color.value
                  ? 'border-slate-800 scale-110'
                  : 'border-slate-200 hover:border-slate-400'
              ]"
              :style="{ backgroundColor: color.value }"
              :disabled="!hasImage"
              @click="strokeColor = color.value"
            />
          </div>
        </div>

        <!-- Brush Size -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Brush</span>
          <div class="flex gap-1">
            <button
              v-for="size in brushSizes"
              :key="size"
              type="button"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="[
                strokeWidth === size
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              ]"
              :disabled="!hasImage"
              @click="strokeWidth = size"
            >
              {{ size }}px
            </button>
          </div>
        </div>

        <div class="flex-1" />

        <!-- Clear -->
        <button
          type="button"
          class="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          :disabled="!hasImage"
          @click="clearAnnotations"
        >
          Clear Annotations
        </button>

        <!-- Copy -->
        <button
          type="button"
          class="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          :disabled="!hasImage"
          @click="copyToClipboard"
        >
          {{ copied ? 'Copied!' : 'Copy to Clipboard' }}
        </button>
      </div>

      <!-- Canvas / Placeholder -->
      <div
        class="relative bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden flex items-center justify-center min-h-[400px]"
      >
        <div
          v-if="!hasImage"
          class="absolute inset-0 flex items-center justify-center text-slate-500 text-center px-8"
        >
          <p class="text-lg">
            Paste an image from your clipboard (Cmd+V / Ctrl+V) to begin.
          </p>
        </div>
        <canvas
          v-show="hasImage"
          ref="canvasRef"
          class="max-w-full h-auto block cursor-crosshair"
          @mousedown="startDrawing"
          @mousemove="draw"
          @mouseup="stopDrawing"
          @mouseleave="stopDrawing"
          @touchstart="startDrawing"
          @touchmove="draw"
          @touchend="stopDrawing"
        />
      </div>
    </div>
  </div>
</template>
