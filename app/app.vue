<script setup lang="ts">
const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWrapperRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const hasImage = ref(false)
const copied = ref(false)
const isDrawing = ref(false)
const showEmojiPicker = ref(false)
const emojiSize = ref(32)
const textFontSize = ref(24)

// Tool mode: pen | arrow | box | emoji | text | move
const toolMode = ref<'pen' | 'arrow' | 'box' | 'emoji' | 'text' | 'move'>('pen')

// Move tool: drag an existing annotation
const moveDragging = ref(false)
const moveTargetIndex = ref<number | null>(null)
const moveStartPos = ref<{ x: number, y: number } | null>(null)

// Resize tool: drag from handle to resize (in move mode)
const resizeDragging = ref(false)
const resizeTargetIndex = ref<number | null>(null)
const resizeStartPos = ref<{ x: number, y: number } | null>(null)
const resizeStartValue = ref<{ length?: number, angle?: number, size?: number, fontSize?: number, width?: number, height?: number, path?: { x: number, y: number }[], center?: { x: number, y: number } } | null>(null)
const hoveredAnnotationIndex = ref<number | null>(null)

// Text tool: show overlay input at click position (canvas coords)
const textInputVisible = ref(false)
const textInputCanvasPos = ref<{ x: number, y: number } | null>(null)
const textInputValue = ref('')
const textInputRef = ref<HTMLTextAreaElement | null>(null)

// Arrow placement state
const arrowStart = ref<{ x: number, y: number } | null>(null)
const arrowPreview = ref<{ x: number, y: number } | null>(null)
const selectedArrowIndex = ref<number | null>(null)

// Box placement state
const boxStart = ref<{ x: number, y: number } | null>(null)
const boxPreview = ref<{ x: number, y: number } | null>(null)

// Drawing state
const strokeColor = ref('#ef4444')
const strokeWidth = ref(4)
const currentPath = ref<{ x: number, y: number }[]>([])
const originalImageData = ref<ImageData | null>(null)
const currentImageObjectUrl = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

type PenStroke = { type: 'pen', path: { x: number, y: number }[], color: string, lineWidth: number }
type ArrowAnnotation = { type: 'arrow', x1: number, y1: number, length: number, angle: number, color: string, lineWidth: number }
type BoxAnnotation = { type: 'box', x: number, y: number, width: number, height: number, color: string, lineWidth: number }
type EmojiAnnotation = { type: 'emoji', x: number, y: number, emoji: string, size: number }
type TextAnnotation = { type: 'text', x: number, y: number, text: string, fontSize: number, color: string }
type Annotation = PenStroke | ArrowAnnotation | BoxAnnotation | EmojiAnnotation | TextAnnotation

const annotations = ref<Annotation[]>([])
const annotationHistory = ref<Annotation[][]>([])

function pushAnnotationState() {
  annotationHistory.value.push(JSON.parse(JSON.stringify(annotations.value)))
}

function undo() {
  if (annotationHistory.value.length === 0) return
  const prev = annotationHistory.value.pop()!
  annotations.value = prev
  if (selectedArrowIndex.value != null && selectedArrowIndex.value >= prev.length) {
    selectedArrowIndex.value = null
  }
  redrawCanvas()
}

const canUndo = computed(() => annotationHistory.value.length > 0)

const colors = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Black', value: '#000000' }
]

const brushSizes = [2, 4, 8, 12]

const EMOJI_LIST = [
  // Popular smilies & skull first
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋',
  '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐',
  '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌',
  '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧',
  '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐',
  '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧',
  '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓',
  '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '💀', '☠️', '💩',
  '🤡', '👻', '👽', '👾', '🤖', '😈', '👿', '👹', '👺',
  // Gestures & hands
  '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘',
  '🤙', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋',
  '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🦿', '🦵', '🦶',
  '🙌', '👏', '🙏', '✍️', '💅', '🤳', '💪',
  // Hearts & emotion
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️',
  // Symbols & marks
  '✅', '❌', '❓', '❗', '‼️', '⁉️', '💯', '🔴', '🟠', '🟡',
  '🟢', '🔵', '🟣', '🟤', '⚫', '⚪', '🟥', '🟧', '🟨', '🟩',
  '🟦', '🟪', '🟫', '⬛', '⬜', '◼️', '◻️', '◾', '◽', '▪️', '▫️',
  '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️',
  '🔄', '↪️', '↩️', '⤴️', '⤵️', '🔃', '🔙', '🔛', '🔜', '🔝',
  '⭐', '🌟', '✨', '💫', '🔥', '💥', '⚡', '💢', '💦', '💨',
  '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '👋', '🔔',
  '🔕', '💡', '🔦', '📌', '📍', '🎯', '📝', '📎', '🔧', '🔨',
  '⚙️', '🔩', '📐', '✏️', '🖊️', '🖍️', '📁', '📂', '📅', '📆',
  '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '0️⃣',
  // Animals – mammal
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔',
  '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺',
  '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟',
  '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑',
  '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈',
  // Food & drink
  '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
  '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦',
  '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔',
  '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈',
  '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟',
  '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘',
  '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙',
  '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦',
  '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩',
  '🍪', '🌰', '🥜', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺',
  '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🥄', '🍴',
  '🍽️', '🥢', '🧂',
  // Activities & sports
  '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
  '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
  '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
  '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '⛹️', '🤾',
  '🏌️', '🏇', '⛹️', '🤺', '🤽', '🤽‍♀️', '🤽‍♂️', '🧘', '🏊', '🏊‍♀️',
  '🎯', '🎮', '🕹️', '🎲', '♠️', '♥️', '♦️', '♣️', '🃏', '🀄',
  '🎴', '🎭', '🖼️', '🎨', '🧵', '🪡', '🪢', '🧶', '📿', '🎪',
  '🎭', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺',
  '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🕹️',
  // Travel & places
  '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
  '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛺', '🚲', '🛵',
  '🏍️', '🛞', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟',
  '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚀', '🛸',
  '✈️', '🛫', '🛬', '🛶', '⛵', '🛥️', '🛳️', '⛴️', '🛟', '🚢',
  '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🏠', '🏡', '🏢', '🏣',
  '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯',
  '🏰', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋',
  '⛲', '⛺', '🌁', '🌃', '🌄', '🌅', '🌆', '🌇', '🌉', '♨️',
  '🎠', '🎡', '🎢', '💈', '🏁', '🇺🇸', '🇬🇧', '🇯🇵', '🇩🇪', '🇫🇷',
  // Objects
  '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️',
  '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥',
  '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⏲️', '⏰', '🕰️', '📡',
  '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🛢️', '💸', '💵', '💴',
  '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛',
  '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🗜️', '⛓️',
  '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬',
  '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭',
  '🔬', '🕳️', '🩻', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠',
  '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿',
  '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑',
  '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞',
  '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊',
  '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌',
  '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬', '📭', '📮',
  '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️',
  '🗃️', '📁', '📂', '🗂️', '🗄️', '📅', '📆', '🗓️', '🗑️', '📇',
  '📋', '📁', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️',
  '🗄️', '🗑️', '🔒', '🔓', '🔏', '🔐', '🔑', '🗝️',
  // Nature & plants
  '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱',
  '🪴', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁',
  '🍂', '🍃', '🪹', '🪺', '🍄', '🌰', '🦀', '🦞', '🦐', '🦑',
  '🌍', '🌎', '🌏', '🌐', '🗺️', '🧭', '🏔️', '⛰️', '🌋', '🗻',
  '🏕️', '🏖️', '🏜️', '🏝️', '🛤️', '🛣️', '🗾', '🏞️', '🌅', '🌄',
  '🌠', '🌌', '🌉', '🌁', '🌃', '🌆', '🌇', '🌊', '💧', '💦',
  '☔', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️',
  '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '🌪️', '🌫️', '🌊', '🔥',
]

function getCanvasContext() {
  if (!canvasRef.value) return null
  return canvasRef.value.getContext('2d')
}

function getCanvas() {
  return canvasRef.value
}

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

function drawArrowHead(ctx: CanvasRenderingContext2D, from: { x: number, y: number }, to: { x: number, y: number }, color: string, lineWidth: number) {
  const headLen = Math.max(12, lineWidth * 3)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  ctx.beginPath()
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6))
  ctx.moveTo(to.x, to.y)
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6))
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function drawArrow(ctx: CanvasRenderingContext2D, a: ArrowAnnotation) {
  const x2 = a.x1 + a.length * Math.cos(a.angle)
  const y2 = a.y1 + a.length * Math.sin(a.angle)
  ctx.strokeStyle = a.color
  ctx.lineWidth = a.lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(a.x1, a.y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  drawArrowHead(ctx, { x: a.x1, y: a.y1 }, { x: x2, y: y2 }, a.color, a.lineWidth)
}

function redrawCanvas() {
  const canvas = getCanvas()
  const ctx = getCanvasContext()
  const imgData = originalImageData.value
  if (!canvas || !ctx || !imgData) return

  ctx.putImageData(imgData, 0, 0)

  for (const ann of annotations.value) {
    if (ann.type === 'pen') {
      if (ann.path.length < 2) continue
      ctx.strokeStyle = ann.color
      ctx.lineWidth = ann.lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(ann.path[0].x, ann.path[0].y)
      for (let i = 1; i < ann.path.length; i++) {
        ctx.lineTo(ann.path[i].x, ann.path[i].y)
      }
      ctx.stroke()
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
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], ann.x, ann.y + i * lineHeight)
      }
    }
  }

  // Resize handle (move mode, hovered annotation)
  if (toolMode.value === 'move' && hoveredAnnotationIndex.value !== null && !moveDragging.value && !resizeDragging.value) {
    const ann = annotations.value[hoveredAnnotationIndex.value]
    if (ann) {
      const pos = getResizeHandlePosition(ann)
      if (pos) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, RESIZE_HANDLE_DRAW_RADIUS, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  // Preview: box being drawn
  if (boxStart.value && boxPreview.value) {
    const x = Math.min(boxStart.value.x, boxPreview.value.x)
    const y = Math.min(boxStart.value.y, boxPreview.value.y)
    const w = Math.abs(boxPreview.value.x - boxStart.value.x)
    const h = Math.abs(boxPreview.value.y - boxStart.value.y)
    ctx.strokeStyle = strokeColor.value
    ctx.lineWidth = strokeWidth.value
    ctx.strokeRect(x, y, w, h)
  }

  // Preview: arrow being drawn
  if (arrowStart.value && arrowPreview.value) {
    const dx = arrowPreview.value.x - arrowStart.value.x
    const dy = arrowPreview.value.y - arrowStart.value.y
    const length = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)
    const x2 = arrowStart.value.x + length * Math.cos(angle)
    const y2 = arrowStart.value.y + length * Math.sin(angle)
    ctx.strokeStyle = strokeColor.value
    ctx.lineWidth = strokeWidth.value
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(arrowStart.value.x, arrowStart.value.y)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    drawArrowHead(ctx, arrowStart.value, { x: x2, y: y2 }, strokeColor.value, strokeWidth.value)
  }
}

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
    annotations.value = []
    annotationHistory.value = []
    selectedArrowIndex.value = null
    boxStart.value = null
    boxPreview.value = null
    moveDragging.value = false
    moveTargetIndex.value = null
    moveStartPos.value = null
    resizeDragging.value = false
    resizeTargetIndex.value = null
    resizeStartPos.value = null
    resizeStartValue.value = null
    hoveredAnnotationIndex.value = null
    redrawCanvas()
  }
  img.src = url
}

function clearAnnotations() {
  annotations.value = []
  annotationHistory.value = []
  arrowStart.value = null
  arrowPreview.value = null
  boxStart.value = null
  boxPreview.value = null
  selectedArrowIndex.value = null
  moveDragging.value = false
  moveTargetIndex.value = null
  moveStartPos.value = null
  resizeDragging.value = false
  resizeTargetIndex.value = null
  resizeStartPos.value = null
  resizeStartValue.value = null
  hoveredAnnotationIndex.value = null
  redrawCanvas()
}

function startDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return
  const { x, y } = getCanvasCoords(e)

  if (toolMode.value === 'move') {
    const idx = getHoveredAnnotationForMoveMode(x, y)
    if (idx !== null) {
      if (hitTestResizeHandle(idx, x, y)) {
        pushAnnotationState()
        resizeTargetIndex.value = idx
        resizeStartPos.value = { x, y }
        const ann = annotations.value[idx]
        if (ann.type === 'arrow') {
          resizeStartValue.value = { length: ann.length, angle: ann.angle }
        } else if (ann.type === 'box') {
          resizeStartValue.value = { width: ann.width, height: ann.height }
        } else if (ann.type === 'emoji') {
          resizeStartValue.value = { size: ann.size }
        } else if (ann.type === 'text') {
          resizeStartValue.value = { fontSize: ann.fontSize }
        } else if (ann.type === 'pen') {
          const path = ann.path
          let minX = path[0].x, maxX = path[0].x, minY = path[0].y, maxY = path[0].y
          for (const p of path) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
          }
          resizeStartValue.value = { path: JSON.parse(JSON.stringify(path)), center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } }
        } else {
          resizeStartValue.value = {}
        }
        resizeDragging.value = true
      } else {
        pushAnnotationState()
        moveTargetIndex.value = idx
        moveStartPos.value = { x, y }
        moveDragging.value = true
      }
    }
    return
  }

  if (toolMode.value === 'pen') {
    isDrawing.value = true
    currentPath.value = [{ x, y }]
  } else if (toolMode.value === 'arrow') {
    for (let i = annotations.value.length - 1; i >= 0; i--) {
      const ann = annotations.value[i]
      if (ann.type === 'arrow' && hitTestArrow(ann, x, y)) {
        selectedArrowIndex.value = i
        return
      }
    }
    selectedArrowIndex.value = null
    arrowStart.value = { x, y }
    arrowPreview.value = { x, y }
  } else if (toolMode.value === 'box') {
    boxStart.value = { x, y }
    boxPreview.value = { x, y }
  } else if (toolMode.value === 'emoji') {
    // Emoji is placed on click via placeEmoji
  } else if (toolMode.value === 'text') {
    // Text is placed via text input overlay in onCanvasClick
  }
}

function draw(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return
  const { x, y } = getCanvasCoords(e)

  if (toolMode.value === 'pen' && isDrawing.value) {
    currentPath.value = [...currentPath.value, { x, y }]
    const ctx = getCanvasContext()
    if (!ctx) return
    ctx.strokeStyle = strokeColor.value
    ctx.lineWidth = strokeWidth.value
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (currentPath.value.length >= 2) {
      const p = currentPath.value
      ctx.beginPath()
      ctx.moveTo(p[p.length - 2].x, p[p.length - 2].y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  } else if (toolMode.value === 'arrow' && arrowStart.value) {
    arrowPreview.value = { x, y }
    redrawCanvas()
  } else if (toolMode.value === 'box' && boxStart.value) {
    boxPreview.value = { x, y }
    redrawCanvas()
  } else if (toolMode.value === 'move' && moveDragging.value && moveTargetIndex.value !== null && moveStartPos.value) {
    const dx = x - moveStartPos.value.x
    const dy = y - moveStartPos.value.y
    translateAnnotation(moveTargetIndex.value, dx, dy)
    moveStartPos.value = { x, y }
    redrawCanvas()
  } else if (toolMode.value === 'move' && resizeDragging.value && resizeTargetIndex.value !== null) {
    resizeAnnotation(resizeTargetIndex.value, x, y)
    redrawCanvas()
  } else if (toolMode.value === 'move' && !moveDragging.value && !resizeDragging.value) {
    const newHover = getHoveredAnnotationForMoveMode(x, y)
    if (newHover !== hoveredAnnotationIndex.value) {
      hoveredAnnotationIndex.value = newHover
      redrawCanvas()
    }
  }
}

function stopDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (toolMode.value === 'pen' && isDrawing.value) {
    if (currentPath.value.length >= 2) {
      pushAnnotationState()
      annotations.value = [...annotations.value, {
        type: 'pen',
        path: [...currentPath.value],
        color: strokeColor.value,
        lineWidth: strokeWidth.value
      }]
    }
    isDrawing.value = false
    currentPath.value = []
    redrawCanvas()
  } else if (toolMode.value === 'arrow' && arrowStart.value && arrowPreview.value) {
    const dx = arrowPreview.value.x - arrowStart.value.x
    const dy = arrowPreview.value.y - arrowStart.value.y
    const length = Math.sqrt(dx * dx + dy * dy)
    if (length >= 8) {
      const angle = Math.atan2(dy, dx)
      pushAnnotationState()
      annotations.value = [...annotations.value, {
        type: 'arrow',
        x1: arrowStart.value.x,
        y1: arrowStart.value.y,
        length,
        angle,
        color: strokeColor.value,
        lineWidth: strokeWidth.value
      }]
    }
    arrowStart.value = null
    arrowPreview.value = null
    redrawCanvas()
  } else if (toolMode.value === 'box' && boxStart.value && boxPreview.value) {
    const x = Math.min(boxStart.value.x, boxPreview.value.x)
    const y = Math.min(boxStart.value.y, boxPreview.value.y)
    const width = Math.abs(boxPreview.value.x - boxStart.value.x)
    const height = Math.abs(boxPreview.value.y - boxStart.value.y)
    if (width >= 4 && height >= 4) {
      pushAnnotationState()
      annotations.value = [...annotations.value, {
        type: 'box',
        x, y, width, height,
        color: strokeColor.value,
        lineWidth: strokeWidth.value
      }]
    }
    boxStart.value = null
    boxPreview.value = null
    redrawCanvas()
  } else if (moveDragging.value) {
    moveDragging.value = false
    moveTargetIndex.value = null
    moveStartPos.value = null
    redrawCanvas()
  } else if (resizeDragging.value) {
    resizeDragging.value = false
    resizeTargetIndex.value = null
    resizeStartPos.value = null
    resizeStartValue.value = null
    redrawCanvas()
  }
}

function placeEmoji(emoji: string) {
  showEmojiPicker.value = false
  // Next click on canvas will place it; we need to temporarily store "pending emoji" and on next canvas click place it
  pendingEmoji.value = { emoji, size: emojiSize.value }
}

const pendingEmoji = ref<{ emoji: string, size: number } | null>(null)

function onCanvasClick(e: MouseEvent) {
  if (!hasImage.value) return
  if (toolMode.value === 'move') return
  const { x, y } = getCanvasCoords(e)

  if (toolMode.value === 'emoji' && pendingEmoji.value) {
    pushAnnotationState()
    annotations.value = [...annotations.value, {
      type: 'emoji',
      x, y,
      emoji: pendingEmoji.value.emoji,
      size: pendingEmoji.value.size
    }]
    pendingEmoji.value = null
    redrawCanvas()
    return
  }

  if (toolMode.value === 'text') {
    textInputCanvasPos.value = { x, y }
    textInputValue.value = ''
    textInputVisible.value = true
    nextTick(() => {
      textInputRef.value?.focus()
    })
  }
}

const textInputStyle = computed(() => {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  const pos = textInputCanvasPos.value
  if (!canvas || !wrapper || !pos) return {}
  const canvasRect = canvas.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  const left = canvasRect.left - wrapperRect.left + (pos.x / canvas.width) * canvasRect.width
  const top = canvasRect.top - wrapperRect.top + (pos.y / canvas.height) * canvasRect.height
  return {
    left: `${left}px`,
    top: `${top}px`,
    fontSize: `${textFontSize.value}px`,
    color: strokeColor.value
  }
})

function commitText() {
  const text = textInputValue.value.trim()
  const pos = textInputCanvasPos.value
  if (text && pos) {
    pushAnnotationState()
    annotations.value = [...annotations.value, {
      type: 'text',
      x: pos.x,
      y: pos.y,
      text,
      fontSize: textFontSize.value,
      color: strokeColor.value
    }]
    redrawCanvas()
  }
  textInputVisible.value = false
  textInputCanvasPos.value = null
  textInputValue.value = ''
}

function onTextInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    commitText()
  }
  if (e.key === 'Escape') {
    textInputVisible.value = false
    textInputCanvasPos.value = null
    textInputValue.value = ''
  }
}

function getArrowTip(a: ArrowAnnotation) {
  return {
    x: a.x1 + a.length * Math.cos(a.angle),
    y: a.y1 + a.length * Math.sin(a.angle)
  }
}

function hitTestArrow(arrow: ArrowAnnotation, x: number, y: number): boolean {
  const tip = getArrowTip(arrow)
  const dist = Math.hypot(x - tip.x, y - tip.y)
  const distTail = Math.hypot(x - arrow.x1, y - arrow.y1)
  const threshold = 20
  return dist < threshold || distTail < threshold || (Math.abs((x - arrow.x1) * Math.sin(arrow.angle) - (y - arrow.y1) * Math.cos(arrow.angle)) < threshold && (x - arrow.x1) * Math.cos(arrow.angle) + (y - arrow.y1) * Math.sin(arrow.angle) >= 0 && (x - arrow.x1) * Math.cos(arrow.angle) + (y - arrow.y1) * Math.sin(arrow.angle) <= arrow.length)
}

function hitTestEmoji(emoji: EmojiAnnotation, x: number, y: number): boolean {
  const r = Math.max(emoji.size * 0.6, 16)
  return Math.hypot(x - emoji.x, y - emoji.y) <= r
}

function hitTestText(text: TextAnnotation, x: number, y: number): boolean {
  const padding = Math.max(text.fontSize, 20)
  const lines = text.text.split('\n')
  const lineHeight = text.fontSize * 1.2
  const height = lines.length * lineHeight
  return x >= text.x - padding && x <= text.x + 300 && y >= text.y - padding && y <= text.y + height + padding
}

function hitTestPenStroke(pen: PenStroke, x: number, y: number): boolean {
  if (pen.path.length < 2) return false
  const margin = pen.lineWidth * 2 + 8
  let minX = pen.path[0].x, maxX = pen.path[0].x, minY = pen.path[0].y, maxY = pen.path[0].y
  for (const p of pen.path) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return x >= minX - margin && x <= maxX + margin && y >= minY - margin && y <= maxY + margin
}

function hitTestBox(box: BoxAnnotation, x: number, y: number): boolean {
  const margin = Math.max(box.lineWidth * 2, 12)
  return x >= box.x - margin && x <= box.x + box.width + margin &&
    y >= box.y - margin && y <= box.y + box.height + margin
}

const RESIZE_HANDLE_RADIUS = 24
const RESIZE_HANDLE_DRAW_RADIUS = 12

function getAnnotationIndexByResizeHandle(canvasX: number, canvasY: number): number | null {
  for (let i = annotations.value.length - 1; i >= 0; i--) {
    if (hitTestResizeHandle(i, canvasX, canvasY)) return i
  }
  return null
}

function getHoveredAnnotationForMoveMode(canvasX: number, canvasY: number): number | null {
  const overBody = getAnnotationAt(canvasX, canvasY)
  if (overBody !== null) return overBody
  return getAnnotationIndexByResizeHandle(canvasX, canvasY)
}

function getResizeHandlePosition(ann: Annotation): { x: number, y: number } | null {
  if (ann.type === 'arrow') return getArrowTip(ann)
  if (ann.type === 'box') return { x: ann.x + ann.width, y: ann.y + ann.height }
  if (ann.type === 'emoji') return { x: ann.x + ann.size / 2, y: ann.y + ann.size / 2 }
  if (ann.type === 'text') {
    const ctx = getCanvasContext()
    const lines = ann.text.split('\n')
    const lineHeight = ann.fontSize * 1.2
    const height = lines.length * lineHeight
    if (!ctx) return { x: ann.x + 100, y: ann.y + height }
    ctx.font = `${ann.fontSize}px sans-serif`
    let w = 0
    for (const line of lines) w = Math.max(w, ctx.measureText(line).width)
    return { x: ann.x + w, y: ann.y + height }
  }
  if (ann.type === 'pen' && ann.path.length >= 2) {
    let maxX = ann.path[0].x, maxY = ann.path[0].y
    for (const p of ann.path) {
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    return { x: maxX, y: maxY }
  }
  return null
}

function hitTestResizeHandle(index: number, canvasX: number, canvasY: number): boolean {
  const ann = annotations.value[index]
  if (!ann) return false
  const pos = getResizeHandlePosition(ann)
  if (!pos) return false
  return Math.hypot(canvasX - pos.x, canvasY - pos.y) <= RESIZE_HANDLE_RADIUS
}

function getAnnotationAt(canvasX: number, canvasY: number): number | null {
  for (let i = annotations.value.length - 1; i >= 0; i--) {
    const ann = annotations.value[i]
    if (ann.type === 'arrow' && hitTestArrow(ann, canvasX, canvasY)) return i
    if (ann.type === 'box' && hitTestBox(ann, canvasX, canvasY)) return i
    if (ann.type === 'emoji' && hitTestEmoji(ann, canvasX, canvasY)) return i
    if (ann.type === 'text' && hitTestText(ann, canvasX, canvasY)) return i
    if (ann.type === 'pen' && hitTestPenStroke(ann, canvasX, canvasY)) return i
  }
  return null
}

function translateAnnotation(index: number, dx: number, dy: number) {
  const ann = annotations.value[index]
  if (!ann) return
  const next = [...annotations.value]
  if (ann.type === 'arrow') {
    next[index] = { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy }
  } else if (ann.type === 'box') {
    next[index] = { ...ann, x: ann.x + dx, y: ann.y + dy }
  } else if (ann.type === 'emoji') {
    next[index] = { ...ann, x: ann.x + dx, y: ann.y + dy }
  } else if (ann.type === 'text') {
    next[index] = { ...ann, x: ann.x + dx, y: ann.y + dy }
  } else if (ann.type === 'pen') {
    next[index] = { ...ann, path: ann.path.map(p => ({ x: p.x + dx, y: p.y + dy })) }
  }
  annotations.value = next
}

function resizeAnnotation(index: number, canvasX: number, canvasY: number) {
  const ann = annotations.value[index]
  const start = resizeStartPos.value
  const startVal = resizeStartValue.value
  if (!ann || !start || !startVal) return
  const next = [...annotations.value]
  if (ann.type === 'arrow') {
    const dx = canvasX - ann.x1
    const dy = canvasY - ann.y1
    const length = Math.sqrt(dx * dx + dy * dy) || 1
    const angle = Math.atan2(dy, dx)
    next[index] = { ...ann, length, angle }
  } else if (ann.type === 'box' && startVal.width != null && startVal.height != null) {
    const newWidth = Math.max(8, canvasX - ann.x)
    const newHeight = Math.max(8, canvasY - ann.y)
    next[index] = { ...ann, width: newWidth, height: newHeight }
  } else if (ann.type === 'emoji' && startVal.size != null) {
    const dy = canvasY - start.y
    const newSize = Math.max(12, Math.min(500, startVal.size + dy))
    next[index] = { ...ann, size: newSize }
  } else if (ann.type === 'text' && startVal.fontSize != null) {
    const dy = canvasY - start.y
    const newFontSize = Math.max(10, Math.min(500, startVal.fontSize + dy))
    next[index] = { ...ann, fontSize: newFontSize }
  } else if (ann.type === 'pen' && startVal.path && startVal.center) {
    const cx = startVal.center.x
    const cy = startVal.center.y
    const startDist = Math.hypot(start.x - cx, start.y - cy) || 0.001
    const currDist = Math.hypot(canvasX - cx, canvasY - cy) || 0.001
    const scale = currDist / startDist
    next[index] = {
      ...ann,
      path: startVal.path.map(p => ({
        x: cx + (p.x - cx) * scale,
        y: cy + (p.y - cy) * scale
      }))
    }
  }
  annotations.value = next
}

function updateSelectedArrowAngle(deg: number) {
  const i = selectedArrowIndex.value
  if (i == null) return
  const ann = annotations.value[i]
  if (ann.type !== 'arrow') return
  pushAnnotationState()
  const next = [...annotations.value]
  next[i] = { ...ann, angle: (deg * Math.PI) / 180 }
  annotations.value = next
  redrawCanvas()
}

const selectedArrow = computed(() => {
  const i = selectedArrowIndex.value
  if (i == null) return null
  const a = annotations.value[i]
  return a?.type === 'arrow' ? a : null
})

const selectedArrowAngleDeg = computed(() => {
  const a = selectedArrow.value
  return a ? Math.round((a.angle * 180) / Math.PI) : 0
})

async function copyToClipboard() {
  const canvas = getCanvas()
  if (!canvas || !hasImage.value) return
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('Failed to create blob')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function loadImageFromFileOrUrl(fileOrUrl: File | string) {
  if (currentImageObjectUrl.value) {
    URL.revokeObjectURL(currentImageObjectUrl.value)
    currentImageObjectUrl.value = null
  }
  const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl)
  if (typeof fileOrUrl !== 'string') currentImageObjectUrl.value = url
  loadImageToCanvas(url)
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) loadImageFromFileOrUrl(file)
      break
    }
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file && file.type.startsWith('image/')) {
    loadImageFromFileOrUrl(file)
  }
  input.value = ''
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onCanvasMouseLeave() {
  hoveredAnnotationIndex.value = null
  if (toolMode.value === 'move' && !moveDragging.value && !resizeDragging.value) redrawCanvas()
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    e.preventDefault()
    undo()
  }
}

onMounted(() => {
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handleKeydown)
  if (currentImageObjectUrl.value) URL.revokeObjectURL(currentImageObjectUrl.value)
})
</script>

<template>
  <div
    ref="containerRef"
    class="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden"
  >
    <div class="w-full h-full flex flex-col min-h-0">
      <!-- Toolbar -->
      <div
        class="flex flex-wrap items-center gap-4 p-4 bg-white rounded-t-xl border border-slate-200 border-b-0 shadow-sm"
      >
        <!-- Tool mode -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Tool</span>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            :class="[toolMode === 'pen' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
            :disabled="!hasImage"
            @click="toolMode = 'pen'; boxStart = null; boxPreview = null; showEmojiPicker = false; pendingEmoji = null; moveDragging = false; moveTargetIndex = null; moveStartPos = null; resizeDragging = false; resizeTargetIndex = null; hoveredAnnotationIndex = null"
          >
            Pen
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            :class="[toolMode === 'arrow' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
            :disabled="!hasImage"
            @click="toolMode = 'arrow'; selectedArrowIndex = null; boxStart = null; boxPreview = null; showEmojiPicker = false; pendingEmoji = null; moveDragging = false; moveTargetIndex = null; moveStartPos = null; resizeDragging = false; resizeTargetIndex = null; hoveredAnnotationIndex = null"
          >
            Arrow
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            :class="[toolMode === 'box' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
            :disabled="!hasImage"
            @click="toolMode = 'box'; boxStart = null; boxPreview = null; selectedArrowIndex = null; showEmojiPicker = false; pendingEmoji = null; moveDragging = false; moveTargetIndex = null; moveStartPos = null; resizeDragging = false; resizeTargetIndex = null; hoveredAnnotationIndex = null"
          >
            Box
          </button>
          <div class="relative flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="[toolMode === 'emoji' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
              :disabled="!hasImage"
              @click="toolMode = 'emoji'; boxStart = null; boxPreview = null; showEmojiPicker = !showEmojiPicker; moveDragging = false; moveTargetIndex = null; moveStartPos = null; resizeDragging = false; resizeTargetIndex = null; hoveredAnnotationIndex = null"
            >
              Emoji
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="[toolMode === 'text' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
              :disabled="!hasImage"
              @click="toolMode = 'text'; boxStart = null; boxPreview = null; showEmojiPicker = false; pendingEmoji = null; moveDragging = false; moveTargetIndex = null; moveStartPos = null; resizeDragging = false; resizeTargetIndex = null; hoveredAnnotationIndex = null"
            >
              Text
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="[toolMode === 'move' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
              :disabled="!hasImage"
              @click="toolMode = 'move'; boxStart = null; boxPreview = null; showEmojiPicker = false; pendingEmoji = null; selectedArrowIndex = null; resizeDragging = false; resizeTargetIndex = null"
            >
              Move
            </button>
            <div
              v-if="showEmojiPicker"
              class="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-64 max-h-64 overflow-y-auto"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-slate-500">Size</span>
                <input
                  v-model.number="emojiSize"
                  type="range"
                  min="16"
                  max="64"
                  class="w-24 h-2"
                />
                <span class="text-xs text-slate-500">{{ emojiSize }}px</span>
              </div>
              <div class="grid grid-cols-5 gap-1">
                <button
                  v-for="em in EMOJI_LIST"
                  :key="em"
                  type="button"
                  class="text-2xl p-1 rounded hover:bg-slate-100"
                  @click="placeEmoji(em)"
                >
                  {{ em }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Colors -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Color</span>
          <div class="flex gap-1">
            <button
              v-for="color in colors"
              :key="color.value"
              type="button"
              class="w-8 h-8 rounded-full border-2 transition-all"
              :class="[strokeColor === color.value ? 'border-slate-800 scale-110' : 'border-slate-200 hover:border-slate-400']"
              :style="{ backgroundColor: color.value }"
              :disabled="!hasImage"
              @click="strokeColor = color.value"
            />
          </div>
        </div>

        <!-- Brush Size (for pen & arrow) -->
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Stroke</span>
          <div class="flex gap-1">
            <button
              v-for="size in brushSizes"
              :key="size"
              type="button"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="[strokeWidth === size ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200']"
              :disabled="!hasImage"
              @click="strokeWidth = size"
            >
              {{ size }}px
            </button>
          </div>
        </div>

        <!-- Text font size (when text tool active) -->
        <div v-if="toolMode === 'text'" class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Size</span>
          <input
            v-model.number="textFontSize"
            type="range"
            min="12"
            max="48"
            class="w-20 h-2"
          />
          <span class="text-xs text-slate-500">{{ textFontSize }}px</span>
        </div>

        <!-- Arrow rotation (when one selected) -->
        <div v-if="selectedArrow != null" class="flex items-center gap-2">
          <span class="text-sm font-medium text-slate-600">Pivot</span>
          <input
            type="range"
            min="-180"
            max="180"
            :value="selectedArrowAngleDeg"
            class="w-24"
            @input="updateSelectedArrowAngle(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="text-xs text-slate-500">{{ selectedArrowAngleDeg }}°</span>
        </div>

        <div class="flex-1" />

        <!-- Undo -->
        <button
          type="button"
          class="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          :disabled="!hasImage || !canUndo"
          title="Undo (⌘Z / Ctrl+Z)"
          @click="undo"
        >
          Undo
        </button>

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
        ref="canvasWrapperRef"
        class="relative flex-1 min-h-0 bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden flex items-center justify-center"
      >
        <div
          v-if="!hasImage"
          class="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-500 text-center px-8"
        >
          <p class="text-lg">
            Paste an image (Cmd+V / Ctrl+V) or upload one to begin.
          </p>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileSelect"
          />
          <button
            type="button"
            class="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            @click="triggerFileInput"
          >
            Upload image
          </button>
        </div>
        <canvas
          v-show="hasImage"
          ref="canvasRef"
          class="max-w-full h-auto block cursor-crosshair"
          @mousedown="startDrawing"
          @mousemove="draw"
          @mouseup="stopDrawing"
          @mouseleave="(e) => { onCanvasMouseLeave(); stopDrawing(e); }"
          @click="onCanvasClick"
          @touchstart="startDrawing"
          @touchmove="draw"
          @touchend="stopDrawing"
        />
        <!-- Text input overlay (positioned at click point on canvas) -->
        <textarea
          v-if="hasImage && textInputVisible"
          ref="textInputRef"
          v-model="textInputValue"
          class="absolute min-w-[120px] max-w-[280px] min-h-[2em] px-2 py-1 border-2 border-indigo-500 rounded bg-white/95 shadow-lg outline-none resize-y"
          :style="textInputStyle"
          placeholder="Type here... (Shift+Enter for new line)"
          rows="3"
          @blur="commitText"
          @keydown="onTextInputKeydown"
        />
        <p
          v-if="hasImage && toolMode === 'emoji' && pendingEmoji"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-slate-500 bg-white/90 px-3 py-1 rounded"
        >
          Click on canvas to place {{ pendingEmoji.emoji }}
        </p>
        <p
          v-if="hasImage && toolMode === 'text' && !textInputVisible"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-slate-500 bg-white/90 px-3 py-1 rounded"
        >
          Click on canvas to add text
        </p>
        <p
          v-if="hasImage && toolMode === 'move'"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-slate-500 bg-white/90 px-3 py-1 rounded"
        >
          Drag to move; drag the blue handle to resize
        </p>
      </div>
    </div>
  </div>
</template>
