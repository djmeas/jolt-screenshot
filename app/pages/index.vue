<script setup lang="ts">
import logoImg from '~/assets/img/JoltSlashLogo.png'
import {
  type SavedProjectMeta,
  type SavedBaseImage,
  type SavedLayer,
  type SavedSettings,
  deleteSavedProject,
  estimateStorageUsage,
  formatBytes,
  getSavedProject,
  listSavedProjects,
  makeThumbnailFromCanvas,
  newProjectId,
  renameSavedProject,
  saveProject,
} from '~/composables/useProjectStorage'

const { isDark, setColorMode } = useColorMode()

const MAX_IMAGE_PIXELS = 16_000_000  // ~16 megapixels (e.g. 4000x4000)
const MAX_IMAGE_BYTES_ESTIMATE = 8_000_000  // ~8 MB PNG in localStorage

function formatPixels(w: number, h: number): string {
  const mp = (w * h) / 1_000_000
  return `${mp.toFixed(1)} MP`
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWrapperRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const hasImage = ref(false)
const copied = ref(false)
const isDrawing = ref(false)
const showEmojiPicker = ref(false)
const emojiSize = ref(32)
const textFontSize = ref(24)

// Zoom & pan state (view-only; never affects the exported image)
const ZOOM_STEP = 1.15
const ZOOM_MAX_SCALE = 8
const fitScale = ref(1)
const zoomFactor = ref(1)
const viewX = ref(0)
const viewY = ref(0)
const spacePanActive = ref(false)
const isPanning = ref(false)
const panStart = ref<{ x: number, y: number, viewX: number, viewY: number } | null>(null)

// Tool mode: pen | arrow | box | emoji | text | move
const toolMode = ref<'pen' | 'arrow' | 'box' | 'emoji' | 'text' | 'move' | 'sequence'>('pen')

// Move tool: drag an existing annotation
const moveDragging = ref(false)
const moveTargetIndex = ref<number | null>(null)
const moveStartPos = ref<{ x: number, y: number } | null>(null)

// Resize tool: drag from handle to resize (in move mode)
const resizeDragging = ref(false)
const resizeTargetIndex = ref<number | null>(null)
const resizeStartPos = ref<{ x: number, y: number } | null>(null)
const resizeStartValue = ref<{
  length?: number
  angle?: number
  size?: number
  fontSize?: number
  width?: number
  height?: number
  x?: number
  y?: number
  corner?: 'nw' | 'ne' | 'sw' | 'se'
  path?: { x: number, y: number }[]
  center?: { x: number, y: number }
} | null>(null)
const hoveredAnnotationIndex = ref<number | null>(null)
const hoveredLabelIndex = ref<number | null>(null)

// Text tool: show overlay input at click position (canvas coords)
const textInputVisible = ref(false)
const textInputCanvasPos = ref<{ x: number, y: number } | null>(null)
const textInputValue = ref('')
const textInputRef = ref<HTMLTextAreaElement | null>(null)
const labelEditorInputRef = ref<HTMLInputElement | null>(null)

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
const fileInputRef = ref<HTMLInputElement | null>(null)

type BaseImage = {
  objectUrl: string | null
  image: HTMLImageElement
}

const baseImage = ref<BaseImage | null>(null)
const imageElementCache = new Map<string, HTMLImageElement>()
const trackedObjectUrls = new Set<string>()
const showPasteDialog = ref(false)
const pendingPasteFile = ref<File | null>(null)
const showHelp = ref(false)
const helpButtonRef = ref<HTMLButtonElement | null>(null)
const helpCardRef = ref<HTMLDivElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null
let helpKeydownCleanup: (() => void) | null = null

// Append-to-right strip state
const STRIP_GAP = 8
const LABEL_MIN_FONT = 8
const LABEL_PILL_PADDING_RATIO = 0.5
const LABEL_FOCUS_RING_COLOR = '#6366f1'
const stripSegments = ref<{ x: number, width: number, labelText: string }[]>([])
const labelsEnabled = ref(true)
const sessionLabelDefault = ref(true)
const editingLabelIndex = ref<number | null>(null)
const editingLabelDraft = ref('')

function displayedLabelText(seg: { labelText: string }, i: number): string {
  return seg.labelText || String(i + 1)
}

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
}

function resetStripState() {
  editingLabelIndex.value = null
  editingLabelDraft.value = ''
  stripSegments.value = []
  labelsEnabled.value = sessionLabelDefault.value
}

const SEQ_RADIUS = 28
type SequenceAnnotation = { type: 'sequence', x: number, y: number, radius: number }
type PenStroke = { type: 'pen', path: { x: number, y: number }[], color: string, lineWidth: number }
type ArrowAnnotation = { type: 'arrow', x1: number, y1: number, length: number, angle: number, color: string, lineWidth: number }
type BoxAnnotation = { type: 'box', x: number, y: number, width: number, height: number, color: string, lineWidth: number }
type EmojiAnnotation = { type: 'emoji', x: number, y: number, emoji: string, size: number }
type TextAnnotation = { type: 'text', x: number, y: number, text: string, fontSize: number, color: string }
type ImageAnnotation = { type: 'image', id: string, objectUrl: string | null, x: number, y: number, width: number, height: number }
type Annotation = PenStroke | ArrowAnnotation | BoxAnnotation | EmojiAnnotation | TextAnnotation | ImageAnnotation | SequenceAnnotation

const annotations = ref<Annotation[]>([])
const annotationHistory = ref<Annotation[][]>([])

const showSavesPanel = ref(false)
const savedProjects = ref<SavedProjectMeta[]>([])
const storageBytes = ref(0)
const projectId = ref<string>(newProjectId())
const projectName = ref<string>('Untitled')
const projectCreatedAt = ref<number>(Date.now())
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const quotaError = ref<string | null>(null)
const pendingClearSaved = ref(false)

function pushAnnotationState() {
  const clone = JSON.parse(JSON.stringify(annotations.value))
  const total = snapshotSize(clone)
  if (total > MAX_UNDO_POINTS_PER_SNAPSHOT) {
    downsamplePenStrokesInPlace(clone, 1000)
  }
  pushWithCap(annotationHistory.value, clone, MAX_UNDO_DEPTH)
  scheduleAutoSave()
}

function snapshotSize(anns: Annotation[]): number {
  let n = 0
  for (const a of anns) {
    if (a.type === 'pen') n += a.path.length
    else n += 1
  }
  return n
}

function downsamplePenStrokesInPlace(anns: Annotation[], perStrokeMax: number): void {
  for (const a of anns) {
    if (a.type === 'pen' && a.path.length > perStrokeMax) {
      const stride = Math.ceil(a.path.length / perStrokeMax)
      a.path = a.path.filter((_, i) => i % stride === 0)
    }
  }
}

function pushWithCap<T>(stack: T[], item: T, cap: number): void {
  stack.push(item)
  while (stack.length > cap) stack.shift()
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

function toggleStripLabels() {
  labelsEnabled.value = !labelsEnabled.value
  if (!labelsEnabled.value) {
    editingLabelIndex.value = null
    editingLabelDraft.value = ''
  }
  redrawCanvas()
  scheduleAutoSave()
}

const canUndo = computed(() => annotationHistory.value.length > 0)
const hasClearableContent = computed(() => hasImage.value)

const colors = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#ffffff' },
]

const CUSTOM_COLOR_KEY = '__custom__'
const RAINBOW_GRADIENT = 'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)'

const customColor = ref<string | null>(null)
const showColorPicker = ref(false)
const colorPickerAnchor = ref<'toolbar' | 'menu' | null>(null)
const customSwatchRef = ref<HTMLButtonElement | null>(null)
const customMenuSwatchRef = ref<HTMLButtonElement | null>(null)
const colorPickerWrapRef = ref<HTMLDivElement | null>(null)

const customSwatchStyle = computed<Record<string, string>>(() => {
  if (!customColor.value) return { backgroundImage: RAINBOW_GRADIENT, backgroundColor: '#ffffff' }
  return colorOverCheckerStyle(customColor.value)
})

function toggleColorPicker(anchor: 'toolbar' | 'menu') {
  if (!hasImage.value) return
  if (showColorPicker.value && colorPickerAnchor.value === anchor) {
    closeColorPicker()
    return
  }
  colorPickerAnchor.value = anchor
  showColorPicker.value = true
}

function closeColorPicker() {
  showColorPicker.value = false
}

function onCustomColorUpdate(value: string) {
  if (!hasImage.value) return
  customColor.value = value
  strokeColor.value = value
  playColorPickEffect()
  updateAllColorIndicators()
}

function resolveColorButtonKey(color: string): string {
  return colors.some(c => c.value === color) ? color : CUSTOM_COLOR_KEY
}

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

const displayScale = computed(() => fitScale.value * zoomFactor.value)
const isZoomed = computed(() => zoomFactor.value > 1.001)
const zoomPercent = computed(() => Math.round(displayScale.value * 100))

function clampView() {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || canvas.width === 0 || canvas.height === 0) {
    viewX.value = 0
    viewY.value = 0
    return
  }
  const scale = displayScale.value
  if (scale <= 0) return
  const maxX = canvas.width - wrapper.clientWidth / scale
  const maxY = canvas.height - wrapper.clientHeight / scale
  viewX.value = maxX <= 0 ? 0 : Math.min(Math.max(viewX.value, 0), maxX)
  viewY.value = maxY <= 0 ? 0 : Math.min(Math.max(viewY.value, 0), maxY)
}

function applyZoomTransform() {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || canvas.width === 0 || canvas.height === 0) return

  const maxW = wrapper.clientWidth
  const maxH = wrapper.clientHeight
  if (maxW === 0 || maxH === 0) return

  fitScale.value = Math.min(maxW / canvas.width, maxH / canvas.height, 1)
  clampView()

  const scale = displayScale.value
  const displayW = Math.floor(canvas.width * scale)
  const displayH = Math.floor(canvas.height * scale)
  const baseLeft = displayW < maxW ? (maxW - displayW) / 2 : 0
  const baseTop = displayH < maxH ? (maxH - displayH) / 2 : 0

  canvas.style.width = `${displayW}px`
  canvas.style.height = `${displayH}px`
  canvas.style.left = `${baseLeft - viewX.value * scale}px`
  canvas.style.top = `${baseTop - viewY.value * scale}px`
}

function updateCanvasDisplaySize() {
  applyZoomTransform()
}

function resetZoom() {
  zoomFactor.value = 1
  viewX.value = 0
  viewY.value = 0
  spacePanActive.value = false
  isPanning.value = false
  panStart.value = null
}

function zoomBy(factor: number, anchorClient?: { x: number, y: number }) {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value) return

  const oldScale = displayScale.value
  const newScale = Math.min(Math.max(oldScale * factor, fitScale.value), ZOOM_MAX_SCALE)
  if (newScale === oldScale) return

  let ax = wrapper.clientWidth / 2
  let ay = wrapper.clientHeight / 2
  if (anchorClient) {
    const rect = wrapper.getBoundingClientRect()
    ax = anchorClient.x - rect.left
    ay = anchorClient.y - rect.top
  }

  const oldDisplayW = canvas.width * oldScale
  const oldDisplayH = canvas.height * oldScale
  const oldBaseLeft = oldDisplayW < wrapper.clientWidth ? (wrapper.clientWidth - oldDisplayW) / 2 : 0
  const oldBaseTop = oldDisplayH < wrapper.clientHeight ? (wrapper.clientHeight - oldDisplayH) / 2 : 0

  const imagePtX = viewX.value + (ax - oldBaseLeft) / oldScale
  const imagePtY = viewY.value + (ay - oldBaseTop) / oldScale

  zoomFactor.value = newScale / fitScale.value

  const newDisplayW = canvas.width * newScale
  const newDisplayH = canvas.height * newScale
  const newBaseLeft = newDisplayW < wrapper.clientWidth ? (wrapper.clientWidth - newDisplayW) / 2 : 0
  const newBaseTop = newDisplayH < wrapper.clientHeight ? (wrapper.clientHeight - newDisplayH) / 2 : 0

  viewX.value = imagePtX - (ax - newBaseLeft) / newScale
  viewY.value = imagePtY - (ay - newBaseTop) / newScale

  applyZoomTransform()
}

function zoomToFit() {
  if (!hasImage.value) return
  zoomFactor.value = 1
  viewX.value = 0
  viewY.value = 0
  applyZoomTransform()
}

function zoomToActual() {
  if (!hasImage.value || displayScale.value <= 0) return
  zoomBy(1 / displayScale.value)
}

function onCanvasWheel(e: WheelEvent) {
  if (!hasImage.value) return
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  zoomBy(ZOOM_STEP ** -Math.sign(e.deltaY), { x: e.clientX, y: e.clientY })
}

const navigatorViewport = computed(() => {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || displayScale.value <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  return {
    x: viewX.value,
    y: viewY.value,
    w: wrapper.clientWidth / displayScale.value,
    h: wrapper.clientHeight / displayScale.value,
  }
})

function drawNavigatorThumbnail(ctx: CanvasRenderingContext2D, _scale: number) {
  const base = baseImage.value
  const canvas = getCanvas()
  if (!base || !canvas) return
  ctx.drawImage(base.image, 0, 0, canvas.width, canvas.height)
  drawAnnotations(ctx)
}

function onNavigatorPan(imageX: number, imageY: number) {
  const canvas = getCanvas()
  const wrapper = canvasWrapperRef.value
  if (!canvas || !wrapper || !hasImage.value || displayScale.value <= 0) return
  viewX.value = imageX - wrapper.clientWidth / displayScale.value / 2
  viewY.value = imageY - wrapper.clientHeight / displayScale.value / 2
  applyZoomTransform()
}

function getCanvasCoords(e: MouseEvent | TouchEvent): { x: number, y: number } | null {
  const canvas = getCanvas()
  if (!canvas) return { x: 0, y: 0 }
  const pt = 'touches' in e ? e.touches[0] : e
  if (!pt) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (pt.clientX - rect.left) * scaleX,
    y: (pt.clientY - rect.top) * scaleY,
  }
}

function primaryTouch(e: MouseEvent | TouchEvent): { clientX: number, clientY: number } | null {
  if ('touches' in e) {
    return e.touches[0] ?? null
  }
  return e
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

function getLabelMetrics(
  seg: { x: number, width: number, labelText: string },
  i: number,
  radius: number,
  ctx: CanvasRenderingContext2D,
): { text: string, fontSize: number, isPill: boolean, rect: { x: number, y: number, w: number, h: number } } {
  const inset = radius * 0.75 + 6
  const cy = inset + radius
  const cx = seg.x + inset + radius
  let text = displayedLabelText(seg, i)
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
      text = truncated
      ctx.font = `bold ${fontSize}px sans-serif`
      textWidth = ctx.measureText(text).width
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

function redrawCanvas() {
  const canvas = getCanvas()
  const ctx = getCanvasContext()
  const base = baseImage.value
  if (!canvas || !ctx || !base) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(base.image, 0, 0, canvas.width, canvas.height)
  drawAnnotations(ctx)
  drawStripLabels(ctx)

  // Resize handles (move mode, hovered or actively resized annotation)
  const handleIndex = resizeDragging.value ? resizeTargetIndex.value : hoveredAnnotationIndex.value
  if (toolMode.value === 'move' && handleIndex !== null && !moveDragging.value) {
    const ann = annotations.value[handleIndex]
    if (ann) drawResizeHandles(ctx, ann)
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

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })
}

function computeLayerPlacement(naturalW: number, naturalH: number, canvasW: number, canvasH: number) {
  let width = naturalW
  let height = naturalH
  if (width > canvasW || height > canvasH) {
    const scale = Math.min(canvasW / width, canvasH / height)
    width = Math.floor(width * scale)
    height = Math.floor(height * scale)
  }
  return {
    x: Math.floor((canvasW - width) / 2),
    y: Math.floor((canvasH - height) / 2),
    width,
    height,
  }
}

function registerImageElement(id: string, img: HTMLImageElement, objectUrl: string | null) {
  imageElementCache.set(id, img)
  if (objectUrl) trackedObjectUrls.add(objectUrl)
}

function clearImageResources() {
  for (const url of trackedObjectUrls) URL.revokeObjectURL(url)
  trackedObjectUrls.clear()
  imageElementCache.clear()
  baseImage.value = null
}

function getImageCornerHandles(ann: ImageAnnotation) {
  return {
    nw: { x: ann.x, y: ann.y },
    ne: { x: ann.x + ann.width, y: ann.y },
    sw: { x: ann.x, y: ann.y + ann.height },
    se: { x: ann.x + ann.width, y: ann.y + ann.height },
  }
}

function hitTestImageCorner(ann: ImageAnnotation, canvasX: number, canvasY: number): 'nw' | 'ne' | 'sw' | 'se' | null {
  for (const [corner, pos] of Object.entries(getImageCornerHandles(ann)) as ['nw' | 'ne' | 'sw' | 'se', { x: number, y: number }][]) {
    if (Math.hypot(canvasX - pos.x, canvasY - pos.y) <= RESIZE_HANDLE_RADIUS) return corner
  }
  return null
}

function hitTestImage(ann: ImageAnnotation, x: number, y: number): boolean {
  const margin = 4
  return x >= ann.x - margin && x <= ann.x + ann.width + margin &&
    y >= ann.y - margin && y <= ann.y + ann.height + margin
}

function drawResizeHandles(ctx: CanvasRenderingContext2D, ann: Annotation) {
  if (ann.type === 'image') {
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(ann.x, ann.y, ann.width, ann.height)
    for (const pos of Object.values(getImageCornerHandles(ann))) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, RESIZE_HANDLE_DRAW_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    return
  }
  const pos = getResizeHandlePosition(ann)
  if (!pos) return
  ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(pos.x, pos.y, RESIZE_HANDLE_DRAW_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

function resetDrawingState() {
  annotations.value = []
  annotationHistory.value = []
  selectedArrowIndex.value = null
  arrowStart.value = null
  arrowPreview.value = null
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
  hoveredLabelIndex.value = null
  textInputVisible.value = false
  textInputCanvasPos.value = null
  textInputValue.value = ''
  pendingEmoji.value = null
  showEmojiPicker.value = false
}

async function replaceWithImage(fileOrUrl: File | string) {
  invalidateAutoSave()
  clearImageResources()
  resetStripState()
  const objectUrl = typeof fileOrUrl !== 'string' ? URL.createObjectURL(fileOrUrl) : null
  const url = objectUrl ?? fileOrUrl
  try {
    const img = await loadImageElement(url)
    if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      quotaError.value = `That image is ${formatPixels(img.naturalWidth, img.naturalHeight)} which is over the ${formatPixels(MAX_IMAGE_PIXELS, 1)} limit. Try a smaller crop or lower-DPI screenshot.`
      return
    }
    const canvas = getCanvas()
    const ctx = getCanvasContext()
    if (!canvas || !ctx) return
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    if (objectUrl) trackedObjectUrls.add(objectUrl)
    baseImage.value = { objectUrl, image: img }
    hasImage.value = true
    resetDrawingState()
    resetZoom()
    redrawCanvas()
    nextTick(() => {
      updateCanvasDisplaySize()
      playImageSlamEffect('full')
    })
    projectId.value = newProjectId()
    projectCreatedAt.value = Date.now()
    projectName.value = 'Untitled'
    scheduleAutoSave()
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    console.error('Failed to load image:', err)
  }
}

async function addImageAsLayer(file: File) {
  const canvas = getCanvas()
  if (!canvas || !hasImage.value) return
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
      URL.revokeObjectURL(objectUrl)
      quotaError.value = `That image is ${formatPixels(img.naturalWidth, img.naturalHeight)} which is over the ${formatPixels(MAX_IMAGE_PIXELS, 1)} limit.`
      return
    }
    const id = crypto.randomUUID()
    registerImageElement(id, img, objectUrl)
    const placement = computeLayerPlacement(img.naturalWidth, img.naturalHeight, canvas.width, canvas.height)
    pushAnnotationState()
    annotations.value = [...annotations.value, {
      type: 'image',
      id,
      objectUrl,
      ...placement,
    }]
    setToolMode('move')
    hoveredAnnotationIndex.value = annotations.value.length - 1
    redrawCanvas()
    const layer = annotations.value[annotations.value.length - 1]!
    nextTick(() => playImageSlamEffect('light', layer.type === 'image' ? layer : undefined))
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    console.error('Failed to add image layer:', err)
  }
}

async function appendImageToRight(file: File) {
  const canvas = getCanvas()
  const base = baseImage.value
  if (!canvas || !base || !hasImage.value) return
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
      URL.revokeObjectURL(objectUrl)
      quotaError.value = `That image is ${formatPixels(img.naturalWidth, img.naturalHeight)} which is over the ${formatPixels(MAX_IMAGE_PIXELS, 1)} limit.`
      return
    }
    const oldWidth = canvas.width
    const oldHeight = canvas.height
    const newWidth = oldWidth + STRIP_GAP + img.naturalWidth
    const newHeight = Math.max(oldHeight, img.naturalHeight)

    const composite = document.createElement('canvas')
    composite.width = newWidth
    composite.height = newHeight
    const cctx = composite.getContext('2d')
    if (!cctx) throw new Error('no-2d-context')
    cctx.fillStyle = '#ffffff'
    cctx.fillRect(0, 0, newWidth, newHeight)
    cctx.drawImage(base.image, 0, 0, oldWidth, oldHeight)
    cctx.drawImage(img, oldWidth + STRIP_GAP, 0)
    URL.revokeObjectURL(objectUrl)

    const compositeImg = await loadImageElement(composite.toDataURL('image/png'))
    if (base.objectUrl) {
      URL.revokeObjectURL(base.objectUrl)
      trackedObjectUrls.delete(base.objectUrl)
    }
    canvas.width = newWidth
    canvas.height = newHeight
    baseImage.value = { objectUrl: null, image: compositeImg }
    if (stripSegments.value.length === 0) {
      stripSegments.value = [{ x: 0, width: oldWidth, labelText: '' }]
    }
    stripSegments.value = [...stripSegments.value, { x: oldWidth + STRIP_GAP, width: img.naturalWidth, labelText: '' }]
    labelsEnabled.value = sessionLabelDefault.value
    resetZoom()
    redrawCanvas()
    nextTick(() => {
      updateCanvasDisplaySize()
      playImageSlamEffect('full')
    })
    scheduleAutoSave()
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    console.error('Failed to append image:', err)
  }
}

function queueImageImport(file: File) {
  if (hasImage.value) {
    pendingPasteFile.value = file
    showPasteDialog.value = true
  } else {
    replaceWithImage(file)
  }
}

function cancelPasteDialog() {
  showPasteDialog.value = false
  pendingPasteFile.value = null
}

async function confirmReplaceImage() {
  const file = pendingPasteFile.value
  if (!file) return
  cancelPasteDialog()
  await replaceWithImage(file)
}

async function confirmAddImageLayer() {
  const file = pendingPasteFile.value
  if (!file) return
  cancelPasteDialog()
  await addImageAsLayer(file)
}

async function confirmAppendImage() {
  const file = pendingPasteFile.value
  if (!file) return
  cancelPasteDialog()
  await appendImageToRight(file)
}

function clearAnnotations({ keepSaved = false, resetProject = true }: { keepSaved?: boolean, resetProject?: boolean } = {}) {
  cancelPasteDialog()
  closeToolbarMenu()
  clearImageResources()
  resetDrawingState()
  resetStripState()
  hasImage.value = false
  const canvas = getCanvas()
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
    canvas.style.width = ''
    canvas.style.height = ''
    canvas.style.left = ''
    canvas.style.top = ''
  }
  resetZoom()
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  if (!keepSaved) {
    deleteSavedProject(projectId.value)
    refreshSavedList()
  }
  if (resetProject) {
    invalidateAutoSave()
    projectId.value = newProjectId()
    projectCreatedAt.value = Date.now()
    projectName.value = 'Untitled'
  }
  saveStatus.value = 'idle'
}

function startDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (!hasImage.value) return

  if (spacePanActive.value) {
    const touch = primaryTouch(e)
    if (!touch) return
    panStart.value = { x: touch.clientX, y: touch.clientY, viewX: viewX.value, viewY: viewY.value }
    isPanning.value = true
    return
  }

  const coords = getCanvasCoords(e)
  if (!coords) return
  const { x, y } = coords
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

  if (toolMode.value === 'move') {
    const idx = getHoveredAnnotationForMoveMode(x, y)
    if (idx !== null) {
      const ann = annotations.value[idx]
      const imageCorner = ann.type === 'image' ? hitTestImageCorner(ann, x, y) : null
      const onResizeHandle = imageCorner != null || hitTestResizeHandle(idx, x, y)
      if (onResizeHandle) {
        pushAnnotationState()
        resizeTargetIndex.value = idx
        resizeStartPos.value = { x, y }
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
        } else if (ann.type === 'image' && imageCorner) {
          resizeStartValue.value = { x: ann.x, y: ann.y, width: ann.width, height: ann.height, corner: imageCorner }
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

  if (isPanning.value && panStart.value) {
    const touch = primaryTouch(e)
    if (!touch) return
    viewX.value = panStart.value.viewX - (touch.clientX - panStart.value.x) / displayScale.value
    viewY.value = panStart.value.viewY - (touch.clientY - panStart.value.y) / displayScale.value
    applyZoomTransform()
    return
  }

  const coords = getCanvasCoords(e)
  if (!coords) return
  const { x, y } = coords

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
    resizeAnnotation(resizeTargetIndex.value, x, y, e.shiftKey)
    redrawCanvas()
  } else if (toolMode.value === 'move' && !moveDragging.value && !resizeDragging.value) {
    const newHover = getHoveredAnnotationForMoveMode(x, y)
    if (newHover !== hoveredAnnotationIndex.value) {
      hoveredAnnotationIndex.value = newHover
      redrawCanvas()
    }
  }

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
}

function stopDrawing(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  if (isPanning.value) {
    isPanning.value = false
    panStart.value = null
    return
  }
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
  if (spacePanActive.value) return
  if (toolMode.value === 'move') return
  const coords = getCanvasCoords(e)
  if (!coords) return
  const { x, y } = coords

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
  // Size the editor overlay to the current draft so the input grows as the user types,
  // matching the pill rect that will be rendered on commit.
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

watch(editingLabelIndex, async (idx) => {
  if (idx == null) return
  await nextTick()
  labelEditorInputRef.value?.focus()
  labelEditorInputRef.value?.select()
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

function hitTestSequence(seq: SequenceAnnotation, x: number, y: number): boolean {
  return Math.hypot(x - seq.x, y - seq.y) <= seq.radius
}

const RESIZE_HANDLE_RADIUS = 24
const RESIZE_HANDLE_DRAW_RADIUS = 12
const MAX_UNDO_DEPTH = 100
const MAX_UNDO_POINTS_PER_SNAPSHOT = 50_000

function getAnnotationIndexByResizeHandle(canvasX: number, canvasY: number): number | null {
  for (let i = annotations.value.length - 1; i >= 0; i--) {
    const ann = annotations.value[i]
    if (ann.type === 'image') {
      if (hitTestImageCorner(ann, canvasX, canvasY)) return i
    } else if (hitTestResizeHandle(i, canvasX, canvasY)) {
      return i
    }
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
  if (!ann || ann.type === 'image') return false
  const pos = getResizeHandlePosition(ann)
  if (!pos) return false
  return Math.hypot(canvasX - pos.x, canvasY - pos.y) <= RESIZE_HANDLE_RADIUS
}

function getAnnotationAt(canvasX: number, canvasY: number): number | null {
  for (let i = annotations.value.length - 1; i >= 0; i--) {
    const ann = annotations.value[i]
    if (ann.type === 'image' && hitTestImage(ann, canvasX, canvasY)) return i
    if (ann.type === 'arrow' && hitTestArrow(ann, canvasX, canvasY)) return i
    if (ann.type === 'box' && hitTestBox(ann, canvasX, canvasY)) return i
    if (ann.type === 'emoji' && hitTestEmoji(ann, canvasX, canvasY)) return i
    if (ann.type === 'text' && hitTestText(ann, canvasX, canvasY)) return i
    if (ann.type === 'pen' && hitTestPenStroke(ann, canvasX, canvasY)) return i
    if (ann.type === 'sequence' && hitTestSequence(ann, canvasX, canvasY)) return i
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
  } else if (ann.type === 'image') {
    next[index] = { ...ann, x: ann.x + dx, y: ann.y + dy }
  } else if (ann.type === 'pen') {
    next[index] = { ...ann, path: ann.path.map(p => ({ x: p.x + dx, y: p.y + dy })) }
  } else if (ann.type === 'sequence') {
    next[index] = { ...ann, x: ann.x + dx, y: ann.y + dy }
  }
  annotations.value = next
}

function resizeAnnotation(index: number, canvasX: number, canvasY: number, preserveAspect = false) {
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
    const minSize = 8
    let newWidth = Math.max(minSize, canvasX - ann.x)
    let newHeight = Math.max(minSize, canvasY - ann.y)
    if (preserveAspect && startVal.width > 0 && startVal.height > 0) {
      const scale = Math.max(newWidth / startVal.width, newHeight / startVal.height)
      newWidth = Math.max(minSize, startVal.width * scale)
      newHeight = Math.max(minSize, startVal.height * scale)
    }
    next[index] = { ...ann, width: newWidth, height: newHeight }
  } else if (ann.type === 'image' && startVal.x != null && startVal.y != null && startVal.width != null && startVal.height != null && startVal.corner) {
    const minSize = 8
    let { x, y, width, height } = { x: startVal.x, y: startVal.y, width: startVal.width, height: startVal.height }
    if (startVal.corner === 'se') {
      width = Math.max(minSize, canvasX - x)
      height = Math.max(minSize, canvasY - y)
    } else if (startVal.corner === 'nw') {
      const right = x + width
      const bottom = y + height
      x = Math.min(canvasX, right - minSize)
      y = Math.min(canvasY, bottom - minSize)
      width = right - x
      height = bottom - y
    } else if (startVal.corner === 'ne') {
      const bottom = y + height
      y = Math.min(canvasY, bottom - minSize)
      width = Math.max(minSize, canvasX - x)
      height = bottom - y
    } else if (startVal.corner === 'sw') {
      const right = x + width
      x = Math.min(canvasX, right - minSize)
      width = right - x
      height = Math.max(minSize, canvasY - y)
    }
    if (preserveAspect && startVal.width > 0 && startVal.height > 0) {
      const scale = Math.max(width / startVal.width, height / startVal.height)
      const newW = Math.max(minSize, startVal.width * scale)
      const newH = Math.max(minSize, startVal.height * scale)
      // Re-anchor so the opposite edge stays fixed for each corner.
      if (startVal.corner === 'se') {
        width = newW
        height = newH
      } else if (startVal.corner === 'nw') {
        const right = startVal.x + startVal.width
        const bottom = startVal.y + startVal.height
        x = right - newW
        y = bottom - newH
        width = newW
        height = newH
      } else if (startVal.corner === 'ne') {
        const bottom = startVal.y + startVal.height
        y = bottom - newH
        width = newW
        height = newH
      } else if (startVal.corner === 'sw') {
        const right = startVal.x + startVal.width
        x = right - newW
        width = newW
        height = newH
      }
    }
    next[index] = { ...ann, x, y, width, height }
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

async function blobToDataUrl(blobOrUrl: Blob | string): Promise<string | null> {
  try {
    if (typeof blobOrUrl === 'string') {
      const res = await fetch(blobOrUrl)
      const blob = await res.blob()
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blobOrUrl)
    })
  } catch {
    return null
  }
}

function buildSavedBaseImage(): Promise<SavedBaseImage | null> {
  const base = baseImage.value
  if (!base) return Promise.resolve(null)
  return blobToDataUrl(base.objectUrl ?? base.image.src).then((dataUrl) => {
    if (!dataUrl) return null
    return {
      dataUrl,
      naturalWidth: base.image.naturalWidth,
      naturalHeight: base.image.naturalHeight,
    }
  })
}

async function buildSavedLayers(): Promise<SavedLayer[]> {
  const result: SavedLayer[] = []
  for (const ann of annotations.value) {
    if (ann.type !== 'image') continue
    const dataUrl = await blobToDataUrl(ann.objectUrl ?? '')
    if (!dataUrl) continue
    result.push({
      id: ann.id,
      dataUrl,
      naturalWidth: imageElementCache.get(ann.id)?.naturalWidth ?? ann.width,
      naturalHeight: imageElementCache.get(ann.id)?.naturalHeight ?? ann.height,
    })
  }
  return result
}

function buildSavedSettings(): SavedSettings {
  return {
    strokeColor: strokeColor.value,
    strokeWidth: strokeWidth.value,
    textFontSize: textFontSize.value,
    emojiSize: emojiSize.value,
  }
}

async function performSave(opts: { silent?: boolean } = {}): Promise<boolean> {
  const canvas = getCanvas()
  if (!canvas || !hasImage.value) return false
  const generationAtStart = autoSaveGeneration
  const idAtStart = projectId.value
  saveStatus.value = 'saving'
  try {
    const baseImageData = await buildSavedBaseImage()
    if (!baseImageData) {
      saveStatus.value = 'error'
      quotaError.value = 'Could not read the current image.'
      return false
    }
    const layers = await buildSavedLayers()
    if (generationAtStart !== autoSaveGeneration) return false
    const result = saveProject({
      id: idAtStart,
      name: projectName.value || 'Untitled',
      createdAt: projectCreatedAt.value,
      width: canvas.width,
      height: canvas.height,
      baseImage: baseImageData,
      layers,
      annotations: JSON.parse(JSON.stringify(annotations.value)),
      strip: stripSegments.value.length > 1
        ? { segments: stripSegments.value.map(s => ({ x: s.x, width: s.width, labelText: s.labelText })), labelsEnabled: labelsEnabled.value }
        : undefined,
      settings: buildSavedSettings(),
      thumbDataUrl: makeThumbnailFromCanvas(canvas),
    })
    if (!result.ok) {
      saveStatus.value = 'error'
      if (result.reason === 'quota') {
        quotaError.value = `Browser storage is full (${formatBytes(estimateStorageUsage())} used). Delete a saved project to free space, or try a smaller image.`
      } else {
        quotaError.value = 'Could not save project.'
      }
      return false
    }
    saveStatus.value = 'saved'
    quotaError.value = null
    refreshSavedList()
    if (!opts.silent) {
      setTimeout(() => {
        if (saveStatus.value === 'saved') saveStatus.value = 'idle'
      }, 1500)
    }
    return true
  } catch (err) {
    console.error('Save failed:', err)
    saveStatus.value = 'error'
    quotaError.value = 'Could not save project.'
    return false
  }
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let autoSaveGeneration = 0

function invalidateAutoSave() {
  autoSaveGeneration++
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
  saveStatus.value = 'idle'
}

function scheduleAutoSave() {
  if (!hasImage.value) return
  const generation = autoSaveGeneration
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  saveStatus.value = 'saving'
  autoSaveTimer = setTimeout(async () => {
    if (generation !== autoSaveGeneration) return
    autoSaveTimer = null
    await performSave({ silent: true })
  }, 1000)
}

function refreshSavedList() {
  if (!import.meta.client) return
  savedProjects.value = listSavedProjects()
  storageBytes.value = estimateStorageUsage()
}

async function loadSavedProjectIntoCanvas(id: string) {
  invalidateAutoSave()
  const saved = getSavedProject(id)
  if (!saved) return
  clearImageResources()
  resetDrawingState()
  hasImage.value = false
  resetStripState()
  const canvas = getCanvas()
  const ctx = getCanvasContext()
  if (!canvas || !ctx) return

  showSavesPanel.value = false

  try {
    const img = await loadImageElement(saved.baseImage.dataUrl)
    canvas.width = saved.width
    canvas.height = saved.height
    const objectUrl = URL.createObjectURL(await (await fetch(saved.baseImage.dataUrl)).blob())
    trackedObjectUrls.add(objectUrl)
    baseImage.value = { objectUrl, image: img }
    hasImage.value = true
    resetZoom()

    for (const layer of saved.layers) {
      try {
        const layerImg = await loadImageElement(layer.dataUrl)
        const layerObjectUrl = URL.createObjectURL(await (await fetch(layer.dataUrl)).blob())
        trackedObjectUrls.add(layerObjectUrl)
        const placement = computeLayerPlacement(layer.naturalWidth, layer.naturalHeight, canvas.width, canvas.height)
        annotations.value = [...annotations.value, {
          type: 'image',
          id: layer.id,
          objectUrl: layerObjectUrl,
          ...placement,
        }]
        registerImageElement(layer.id, layerImg, layerObjectUrl)
      } catch (err) {
        console.error('Failed to restore layer:', err)
      }
    }

    annotations.value = [...annotations.value, ...(saved.annotations as Annotation[])]
    annotationHistory.value = []
    strokeColor.value = saved.settings.strokeColor
    strokeWidth.value = saved.settings.strokeWidth
    textFontSize.value = saved.settings.textFontSize
    emojiSize.value = saved.settings.emojiSize

    if (saved.strip && saved.strip.segments.length > 1) {
      stripSegments.value = saved.strip.segments.map(s => ({ x: s.x, width: s.width, labelText: s.labelText ?? '' }))
      labelsEnabled.value = saved.strip.labelsEnabled
    }

    projectId.value = saved.id
    projectName.value = saved.name
    projectCreatedAt.value = saved.createdAt

    nextTick(() => {
      updateCanvasDisplaySize()
      redrawCanvas()
    })
  } catch (err) {
    console.error('Failed to load saved project:', err)
    for (const url of [...trackedObjectUrls]) {
      if (!url.startsWith('blob:')) continue
      URL.revokeObjectURL(url)
      trackedObjectUrls.delete(url)
    }
    quotaError.value = 'Could not load saved project.'
  }
}

function handleDeleteSaved(id: string) {
  if (id === projectId.value) {
    invalidateAutoSave()
    projectId.value = newProjectId()
    projectCreatedAt.value = Date.now()
    projectName.value = 'Untitled'
  }
  deleteSavedProject(id)
  refreshSavedList()
}

function handleRenameSaved(payload: { id: string, name: string }) {
  renameSavedProject(payload.id, payload.name)
  if (payload.id === projectId.value) projectName.value = payload.name
  refreshSavedList()
}

function startNewProject() {
  invalidateAutoSave()
  projectId.value = newProjectId()
  projectCreatedAt.value = Date.now()
  projectName.value = 'Untitled'
  clearAnnotations()
}

function toggleSavesPanel() {
  showSavesPanel.value = !showSavesPanel.value
  if (showSavesPanel.value) refreshSavedList()
}

function confirmClearWithSave() {
  if (!hasImage.value) {
    clearAnnotations()
    return
  }
  pendingClearSaved.value = true
}

function performClearKeepSaved() {
  pendingClearSaved.value = false
  clearAnnotations({ keepSaved: true })
}

function performClearAndRemove() {
  pendingClearSaved.value = false
  clearAnnotations({ keepSaved: false })
}

function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (file) queueImageImport(file)
      break
    }
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file && file.type.startsWith('image/')) {
    queueImageImport(file)
  }
  input.value = ''
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function onCanvasMouseLeave() {
  hoveredAnnotationIndex.value = null
  hoveredLabelIndex.value = null
  if (toolMode.value === 'move' && !moveDragging.value && !resizeDragging.value) redrawCanvas()
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function setToolMode(mode: typeof toolMode.value) {
  if (!hasImage.value) return
  const prevMode = toolMode.value

  toolMode.value = mode
  boxStart.value = null
  boxPreview.value = null
  showEmojiPicker.value = false
  pendingEmoji.value = null
  selectedArrowIndex.value = null
  moveDragging.value = false
  moveTargetIndex.value = null
  moveStartPos.value = null
  resizeDragging.value = false
  resizeTargetIndex.value = null
  resizeStartPos.value = null
  resizeStartValue.value = null
  hoveredAnnotationIndex.value = null
  hoveredLabelIndex.value = null

  if (textInputVisible.value && mode !== 'text') {
    textInputVisible.value = false
    textInputCanvasPos.value = null
    textInputValue.value = ''
  }

  if (mode === 'move') redrawCanvas()

  if (prevMode !== mode) {
    playToolSwitchEffect()
    updateToolIndicator()
  }
}

const toolStripRef = ref<HTMLElement | null>(null)
const toolButtonEls = new Map<typeof toolMode.value, HTMLButtonElement>()
const toolIndicatorStyle = ref({ left: '0px', width: '0px', opacity: '0' })
const toolSwitchAnim = ref(false)
let toolSwitchAnimTimer: ReturnType<typeof setTimeout> | null = null

function registerToolButton(mode: typeof toolMode.value, el: unknown) {
  if (el instanceof HTMLButtonElement) toolButtonEls.set(mode, el)
  else toolButtonEls.delete(mode)
}

function updateToolIndicator() {
  nextTick(() => {
    const strip = toolStripRef.value
    const btn = toolButtonEls.get(toolMode.value)
    if (!strip || !btn) return
    const stripRect = strip.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    toolIndicatorStyle.value = {
      left: `${btnRect.left - stripRect.left}px`,
      width: `${btnRect.width}px`,
      opacity: '1',
    }
  })
}

const colorStripRef = ref<HTMLElement | null>(null)
const colorMenuStripRef = ref<HTMLElement | null>(null)
const colorButtonEls = new Map<string, HTMLButtonElement>()
const colorMenuButtonEls = new Map<string, HTMLButtonElement>()
const colorIndicatorStyle = ref({ left: '0px', top: '0px', width: '0px', height: '0px', opacity: '0' })
const colorMenuIndicatorStyle = ref({ left: '0px', top: '0px', width: '0px', height: '0px', opacity: '0' })

const strokeStripRef = ref<HTMLElement | null>(null)
const strokeMenuStripRef = ref<HTMLElement | null>(null)
const strokeButtonEls = new Map<number, HTMLButtonElement>()
const strokeMenuButtonEls = new Map<number, HTMLButtonElement>()
const strokeIndicatorStyle = ref({ left: '0px', width: '0px', opacity: '0' })
const strokeMenuIndicatorStyle = ref({ left: '0px', width: '0px', opacity: '0' })

const colorPickAnim = ref(false)
const strokePickAnim = ref(false)
let colorPickAnimTimer: ReturnType<typeof setTimeout> | null = null
let strokePickAnimTimer: ReturnType<typeof setTimeout> | null = null

function registerColorButton(value: string, el: unknown, menu = false) {
  const map = menu ? colorMenuButtonEls : colorButtonEls
  if (el instanceof HTMLButtonElement) map.set(value, el)
  else map.delete(value)
}

function registerCustomSwatchButton(el: unknown, menu = false) {
  registerColorButton(CUSTOM_COLOR_KEY, el, menu)
  const target = menu ? customMenuSwatchRef : customSwatchRef
  target.value = el instanceof HTMLButtonElement ? el : null
}

function registerStrokeButton(size: number, el: unknown, menu = false) {
  const map = menu ? strokeMenuButtonEls : strokeButtonEls
  if (el instanceof HTMLButtonElement) map.set(size, el)
  else map.delete(size)
}

function updateColorIndicator(
  stripRef: typeof colorStripRef,
  buttonMap: Map<string, HTMLButtonElement>,
  styleRef: typeof colorIndicatorStyle,
) {
  nextTick(() => {
    const strip = stripRef.value
    const btn = buttonMap.get(resolveColorButtonKey(strokeColor.value))
    if (!strip || !btn) return
    const stripRect = strip.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    styleRef.value = {
      left: `${btnRect.left - stripRect.left}px`,
      top: `${btnRect.top - stripRect.top}px`,
      width: `${btnRect.width}px`,
      height: `${btnRect.height}px`,
      opacity: '1',
    }
  })
}

function updateStrokeIndicator(
  stripRef: typeof strokeStripRef,
  buttonMap: Map<number, HTMLButtonElement>,
  styleRef: typeof strokeIndicatorStyle,
) {
  nextTick(() => {
    const strip = stripRef.value
    const btn = buttonMap.get(strokeWidth.value)
    if (!strip || !btn) return
    const stripRect = strip.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    styleRef.value = {
      left: `${btnRect.left - stripRect.left}px`,
      width: `${btnRect.width}px`,
      opacity: '1',
    }
  })
}

function updateAllColorIndicators() {
  updateColorIndicator(colorStripRef, colorButtonEls, colorIndicatorStyle)
  updateColorIndicator(colorMenuStripRef, colorMenuButtonEls, colorMenuIndicatorStyle)
}

function updateAllStrokeIndicators() {
  updateStrokeIndicator(strokeStripRef, strokeButtonEls, strokeIndicatorStyle)
  updateStrokeIndicator(strokeMenuStripRef, strokeMenuButtonEls, strokeMenuIndicatorStyle)
}

function updateAllPickerIndicators() {
  updateToolIndicator()
  updateAllColorIndicators()
  updateAllStrokeIndicators()
}

function playColorPickEffect() {
  if (colorPickAnimTimer) clearTimeout(colorPickAnimTimer)
  colorPickAnim.value = false
  nextTick(() => {
    colorPickAnim.value = true
    colorPickAnimTimer = setTimeout(() => {
      colorPickAnim.value = false
    }, 400)
  })
}

function playStrokePickEffect() {
  if (strokePickAnimTimer) clearTimeout(strokePickAnimTimer)
  strokePickAnim.value = false
  nextTick(() => {
    strokePickAnim.value = true
    strokePickAnimTimer = setTimeout(() => {
      strokePickAnim.value = false
    }, 400)
  })
}

function selectStrokeColor(value: string) {
  if (!hasImage.value || strokeColor.value === value) return
  strokeColor.value = value
  playColorPickEffect()
  updateAllColorIndicators()
  scheduleAutoSave()
}

function selectStrokeWidth(size: number) {
  if (!hasImage.value || strokeWidth.value === size) return
  strokeWidth.value = size
  playStrokePickEffect()
  updateAllStrokeIndicators()
  scheduleAutoSave()
}

function playToolSwitchEffect() {
  if (toolSwitchAnimTimer) clearTimeout(toolSwitchAnimTimer)
  toolSwitchAnim.value = false
  nextTick(() => {
    toolSwitchAnim.value = true
    toolSwitchAnimTimer = setTimeout(() => {
      toolSwitchAnim.value = false
    }, 450)
  })
}

const imageSlamActive = ref(false)
const imageSlamIntensity = ref<'full' | 'light'>('full')
const slamEffectTarget = ref({
  centerX: 0,
  centerY: 0,
  radius: 160,
  particleDistance: 140,
})
let imageSlamTimer: ReturnType<typeof setTimeout> | null = null

const SLAM_RING_BASE_SIZE = 24

function prefersReducedMotion() {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function measureSlamTargetFromCanvas(): typeof slamEffectTarget.value | null {
  const canvas = getCanvas()
  if (!canvas) return null

  const canvasRect = canvas.getBoundingClientRect()
  if (canvasRect.width === 0 || canvasRect.height === 0) return null

  const centerX = canvasRect.left + canvasRect.width / 2
  const centerY = canvasRect.top + canvasRect.height / 2
  const radius = (Math.hypot(canvasRect.width, canvasRect.height) / 2)
  return { centerX, centerY, radius, particleDistance: radius * 0.88 }
}

function measureSlamTargetFromLayer(layer: ImageAnnotation): typeof slamEffectTarget.value | null {
  const canvas = getCanvas()
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null

  const canvasRect = canvas.getBoundingClientRect()
  const scaleX = canvasRect.width / canvas.width
  const scaleY = canvasRect.height / canvas.height

  const displayW = layer.width * scaleX
  const displayH = layer.height * scaleY
  const layerLeft = canvasRect.left + layer.x * scaleX
  const layerTop = canvasRect.top + layer.y * scaleY
  const centerX = layerLeft + displayW / 2
  const centerY = layerTop + displayH / 2
  const radius = Math.hypot(displayW, displayH) / 2
  return { centerX, centerY, radius, particleDistance: radius * 0.88 }
}

function playImageSlamEffect(intensity: 'full' | 'light' = 'full', layer?: ImageAnnotation) {
  if (prefersReducedMotion()) return
  if (imageSlamTimer) clearTimeout(imageSlamTimer)

  const measured = layer ? measureSlamTargetFromLayer(layer) : measureSlamTargetFromCanvas()
  if (measured) {
    const sizeMultiplier = intensity === 'full' ? 1.35 : 1.2
    measured.radius *= sizeMultiplier
    measured.particleDistance = measured.radius * 0.9
    slamEffectTarget.value = measured
  }

  imageSlamActive.value = false
  imageSlamIntensity.value = intensity
  nextTick(() => {
    imageSlamActive.value = true
    imageSlamTimer = setTimeout(() => {
      imageSlamActive.value = false
    }, intensity === 'full' ? 1080 : 980)
  })
}

const slamImpactDelay = computed(() => (imageSlamIntensity.value === 'full' ? 0.24 : 0.2))

function slamRingStyle(ringIndex: number) {
  const target = slamEffectTarget.value
  const endScale = (target.radius * 2) / SLAM_RING_BASE_SIZE
  return {
    left: `${target.centerX}px`,
    top: `${target.centerY}px`,
    '--slam-ring-end-scale': `${endScale}`,
    animationDelay: `${slamImpactDelay.value + (ringIndex - 1) * 0.075}s`,
  }
}

function slamParticleStyle(index: number) {
  const target = slamEffectTarget.value
  const angle = (index / 12) * Math.PI * 2 + (index % 3) * 0.35
  const distance = target.particleDistance * (0.55 + (index % 5) * 0.11)
  const size = imageSlamIntensity.value === 'full' ? 3 + (index % 4) : 2 + (index % 3)
  return {
    left: `${target.centerX}px`,
    top: `${target.centerY}px`,
    '--slam-angle': `${angle}rad`,
    '--slam-distance': `${distance}px`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${slamImpactDelay.value + (index % 5) * 0.025}s`,
  }
}

function slamFlashStyle() {
  const target = slamEffectTarget.value
  const size = target.radius * 2.2
  return {
    left: `${target.centerX}px`,
    top: `${target.centerY}px`,
    width: `${size}px`,
    height: `${size}px`,
    animationDelay: `${slamImpactDelay.value}s`,
  }
}

function slamHandStyle() {
  const target = slamEffectTarget.value
  const width = Math.min(Math.max(target.radius * 1.5, 96), 340)
  return {
    left: `${target.centerX}px`,
    top: `${target.centerY}px`,
    width: `${width}px`,
  }
}

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
    sequence: 'cursor-crosshair',
  }
  return cursors[toolMode.value]
})

const showToolbarMenu = ref(false)
const toolbarMenuRef = ref<HTMLDivElement | null>(null)
const toolbarMenuButtonRef = ref<HTMLButtonElement | null>(null)

function closeToolbarMenu() {
  showToolbarMenu.value = false
}

function toggleToolbarMenu() {
  showToolbarMenu.value = !showToolbarMenu.value
}

function toggleEmojiTool() {
  if (!hasImage.value) return
  if (toolMode.value === 'emoji' && showEmojiPicker.value) {
    showEmojiPicker.value = false
    return
  }
  setToolMode('emoji')
  showEmojiPicker.value = true
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as Node
  if (showColorPicker.value) {
    const inside = colorPickerWrapRef.value?.contains(target)
      || customSwatchRef.value?.contains(target)
      || customMenuSwatchRef.value?.contains(target)
    if (!inside) closeColorPicker()
  }
  if (!showToolbarMenu.value) return
  if (toolbarMenuRef.value?.contains(target) || toolbarMenuButtonRef.value?.contains(target)) return
  closeToolbarMenu()
}

const TOOL_SHORTCUTS: Record<string, typeof toolMode.value> = {
  '1': 'pen',
  '2': 'arrow',
  '3': 'box',
  '4': 'emoji',
  '5': 'text',
  '6': 'move',
  '7': 'sequence',
}

function handleKeydown(e: KeyboardEvent) {
  if (isEditableTarget(e.target)) return

  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault()
    undo()
    return
  }

  if ((e.metaKey || e.ctrlKey) && hasImage.value) {
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      zoomBy(ZOOM_STEP)
      return
    }
    if (e.key === '-') {
      e.preventDefault()
      zoomBy(1 / ZOOM_STEP)
      return
    }
    if (e.key === '0') {
      e.preventDefault()
      zoomToFit()
      return
    }
    if (e.key === '1') {
      e.preventDefault()
      zoomToActual()
      return
    }
  }

  if (e.key === 'Escape') {
    if (showPasteDialog.value) {
      cancelPasteDialog()
      return
    }
    if (showColorPicker.value) {
      closeColorPicker()
      return
    }
    closeToolbarMenu()
    return
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && toolMode.value === 'move') {
    e.preventDefault()
    if (moveDragging.value || resizeDragging.value) return
    const idx = hoveredAnnotationIndex.value
    if (idx !== null && idx < annotations.value.length) {
      pushAnnotationState()
      annotations.value = annotations.value.filter((_, i) => i !== idx)
      hoveredAnnotationIndex.value = null
      selectedArrowIndex.value = null
      redrawCanvas()
      return
    }
  }

  if (e.metaKey || e.ctrlKey || e.altKey) return

  if (e.key === ' ' && hasImage.value && isZoomed.value && !spacePanActive.value) {
    e.preventDefault()
    spacePanActive.value = true
    return
  }

  const mode = TOOL_SHORTCUTS[e.key]
  if (mode) {
    e.preventDefault()
    if (mode === 'emoji') {
      toggleEmojiTool()
    } else {
      setToolMode(mode)
    }
  }
}

function handleKeyup(e: KeyboardEvent) {
  if (e.key === ' ') {
    spacePanActive.value = false
    isPanning.value = false
    panStart.value = null
  }
}

let canvasResizeObserver: ResizeObserver | null = null
let touchAbortController: AbortController | null = null

function attachCanvasTouchListeners(target: HTMLCanvasElement, signal: AbortSignal) {
  target.addEventListener('touchstart', startDrawing, { passive: false, signal })
  target.addEventListener('touchmove', draw, { passive: false, signal })
  target.addEventListener('touchend', stopDrawing, { passive: false, signal })
  target.addEventListener('touchcancel', stopDrawing, { passive: false, signal })
}

onMounted(() => {
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('resize', updateAllPickerIndicators)
  canvasWrapperRef.value?.addEventListener('wheel', onCanvasWheel, { passive: false })

  touchAbortController = new AbortController()
  if (canvasRef.value) {
    attachCanvasTouchListeners(canvasRef.value, touchAbortController.signal)
  }

  canvasResizeObserver = new ResizeObserver(() => {
    updateCanvasDisplaySize()
    updateAllPickerIndicators()
  })
  if (canvasWrapperRef.value) canvasResizeObserver.observe(canvasWrapperRef.value)

  refreshSavedList()
  updateAllPickerIndicators()
})

watch(hasImage, (loaded) => {
  if (loaded) updateAllPickerIndicators()
})

watch(showToolbarMenu, (open) => {
  if (open) nextTick(updateAllPickerIndicators)
  if (!open && colorPickerAnchor.value === 'menu') closeColorPicker()
})

watch(showSavesPanel, (open) => {
  if (open) nextTick(refreshSavedList)
})

watch([textFontSize, emojiSize], () => {
  scheduleAutoSave()
})

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('keyup', handleKeyup)
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('resize', updateAllPickerIndicators)
  canvasWrapperRef.value?.removeEventListener('wheel', onCanvasWheel)
  if (toolSwitchAnimTimer) clearTimeout(toolSwitchAnimTimer)
  if (colorPickAnimTimer) clearTimeout(colorPickAnimTimer)
  if (strokePickAnimTimer) clearTimeout(strokePickAnimTimer)
  if (imageSlamTimer) clearTimeout(imageSlamTimer)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  touchAbortController?.abort()
  touchAbortController = null
  canvasResizeObserver?.disconnect()
  clearImageResources()
})

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
</script>

<template>
  <div
    ref="containerRef"
    class="h-screen w-screen flex flex-col overflow-hidden transition-colors duration-200"
    :class="[isDark ? 'bg-zinc-950' : 'bg-slate-100']"
  >
    <div class="w-full flex-1 flex flex-col min-h-0 p-3 gap-2">
      <!-- Toolbar -->
      <div
        class="relative z-10 flex flex-col rounded-xl border shadow-xl min-w-0 px-2 sm:px-3 py-2 transition-colors duration-200"
        :class="[isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200']"
      >
        <!-- Row 1: brand, theme, Saves, tool strip, Undo/Clear/Copy -->
        <div class="flex flex-wrap items-center gap-1">

        <!-- App brand -->
        <div class="flex shrink-0 items-center mr-1 sm:mr-2">
          <img
            :src="logoImg"
            alt="JoltShot"
            class="h-6 sm:h-7 w-auto transition-[filter] duration-200"
            :class="[isDark ? '' : 'invert']"
          />
        </div>

        <!-- Theme toggle -->
        <button
          type="button"
          class="flex shrink-0 items-center justify-center w-8 h-8 rounded-lg transition-colors"
          :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="setColorMode(!isDark)"
        >
          <svg v-if="isDark" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
        </button>

        <!-- Saves (desktop) -->
        <button
          ref="savesButtonRef"
          type="button"
          class="hidden xl:flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
          :class="[
            showSavesPanel
              ? (isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-slate-100 text-slate-900')
              : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'),
          ]"
          :title="`Saved projects (${savedProjects.length})`"
          @click="toggleSavesPanel"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.75h3.375M12 11.25v3.375m-3.375 0h7.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
          <span>Saves</span>
          <span v-if="savedProjects.length" class="text-[10px] tabular-nums px-1.5 rounded-full" :class="[isDark ? 'bg-zinc-700 text-zinc-300' : 'bg-slate-200 text-slate-700']">{{ savedProjects.length }}</span>
          <span v-if="saveStatus === 'saving'" class="ml-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <svg v-else-if="saveStatus === 'saved'" class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
          <svg v-else-if="saveStatus === 'error'" class="w-3 h-3 text-red-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
        </button>

        <div class="hidden sm:block w-px h-5 mx-0.5 sm:mx-1.5 shrink-0" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />

        <!-- Tool buttons group -->
        <div ref="toolStripRef" class="relative flex shrink-0 items-center gap-0.5 p-0.5 rounded-lg" :class="[isDark ? 'bg-zinc-800' : 'bg-slate-200']">
          <div
            class="tool-indicator absolute top-0.5 bottom-0.5 rounded-md pointer-events-none shadow-sm"
            :class="[isDark ? 'bg-zinc-600' : 'bg-slate-700']"
            :style="toolIndicatorStyle"
          />
          <button
            type="button"
            :ref="(el) => registerToolButton('pen', el)"
            :class="[toolMode === 'pen' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
            class="relative z-10 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            :disabled="!hasImage"
            title="Pen (1)"
            @click="setToolMode('pen')"
          >
            <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'pen' }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            <span class="hidden sm:inline">Pen</span>
          </button>
          <button
            type="button"
            :ref="(el) => registerToolButton('arrow', el)"
            :class="[toolMode === 'arrow' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
            class="relative z-10 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            :disabled="!hasImage"
            title="Arrow (2)"
            @click="setToolMode('arrow')"
          >
            <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'arrow' }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            <span class="hidden sm:inline">Arrow</span>
          </button>
          <button
            type="button"
            :ref="(el) => registerToolButton('box', el)"
            :class="[toolMode === 'box' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
            class="relative z-10 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            :disabled="!hasImage"
            title="Box (3)"
            @click="setToolMode('box')"
          >
            <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'box' }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
            <span class="hidden sm:inline">Box</span>
          </button>
          <div class="relative z-10">
            <button
              type="button"
              :ref="(el) => registerToolButton('emoji', el)"
              :class="[toolMode === 'emoji' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
              class="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
              :disabled="!hasImage"
              title="Emoji (4)"
              @click="toggleEmojiTool"
            >
              <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'emoji' }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3" stroke-linecap="round" /><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3" stroke-linecap="round" /></svg>
              <span class="hidden sm:inline">Emoji</span>
            </button>
            <div
              v-if="showEmojiPicker"
              class="absolute top-full left-0 mt-2 z-20 rounded-xl shadow-2xl p-3 w-64 max-h-64 overflow-y-auto border"
              :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">Size</span>
                <input v-model.number="emojiSize" type="range" min="16" max="64" class="w-24 h-1.5 accent-indigo-500" />
                <span class="text-xs w-8 text-right" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ emojiSize }}px</span>
              </div>
              <div class="grid grid-cols-5 gap-1">
                <button
                  v-for="em in EMOJI_LIST"
                  :key="em"
                  type="button"
                  class="text-2xl p-1 rounded-lg transition-colors"
                  :class="[isDark ? 'hover:bg-zinc-800' : 'hover:bg-slate-100']"
                  @click="placeEmoji(em)"
                >{{ em }}</button>
              </div>
            </div>
          </div>
          <button
            type="button"
            :ref="(el) => registerToolButton('text', el)"
            :class="[toolMode === 'text' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
            class="relative z-10 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            :disabled="!hasImage"
            title="Text (5)"
            @click="setToolMode('text')"
          >
            <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'text' }" fill="currentColor" viewBox="0 0 24 24"><path d="M3 7V5h18v2h-7v14h-4V7H3z" /></svg>
            <span class="hidden sm:inline">Text</span>
          </button>
          <button
            type="button"
            :ref="(el) => registerToolButton('move', el)"
            :class="[toolMode === 'move' ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
            class="relative z-10 flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
            :disabled="!hasImage"
            title="Move (6)"
            @click="setToolMode('move')"
          >
            <svg class="w-3.5 h-3.5 shrink-0" :class="{ 'tool-icon-pop': toolSwitchAnim && toolMode === 'move' }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            <span class="hidden sm:inline">Move</span>
          </button>
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
        </div>

        <div class="hidden xl:block flex-1 min-w-2" />

        <!-- Undo / Clear / Copy (desktop) -->
        <div class="hidden xl:flex items-center gap-1 shrink-0">
          <button
            v-if="stripSegments.length > 1"
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            :class="[labelsEnabled
              ? (isDark ? 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200')
              : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100')]"
            :disabled="!hasImage"
            title="Toggle numbered labels"
            @click="toggleStripLabels"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text></svg>
            Labels
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100']"
            :disabled="!hasImage || !canUndo"
            title="Undo (⌘Z / Ctrl+Z)"
            @click="undo"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            Undo
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            :class="[isDark ? 'text-zinc-400' : 'text-slate-600']"
            title="Clear all and start over"
            :disabled="!hasClearableContent"
            @click="confirmClearWithSave"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Clear
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            :class="[copied ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white']"
            :disabled="!hasImage"
            @click="copyToClipboard"
          >
            <svg v-if="!copied" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            {{ copied ? 'Copied!' : 'Copy to Clipboard' }}
          </button>
        </div>

        </div>

        <!-- Row 2: color, stroke, conditional text size, conditional arrow pivot -->
        <div
          class="hidden xl:flex flex-wrap items-center gap-1 mt-1.5 pt-1.5 border-t"
          :class="[isDark ? 'border-zinc-800' : 'border-slate-200']"
        >
        <!-- Colors (desktop) -->
        <div class="hidden xl:flex items-center gap-2 shrink-0">
          <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Color</span>
          <div ref="colorStripRef" class="relative flex gap-2">
            <div
              class="color-indicator absolute rounded-full pointer-events-none ring-2 ring-offset-2"
              :class="[isDark ? 'ring-white ring-offset-zinc-900' : 'ring-slate-800 ring-offset-white']"
              :style="colorIndicatorStyle"
            />
            <button
              :ref="(el) => registerCustomSwatchButton(el)"
              type="button"
              class="relative z-10 w-6 h-6 rounded-full transition-transform hover:scale-110 ring-1 disabled:opacity-30"
              :class="[
                resolveColorButtonKey(strokeColor) !== CUSTOM_COLOR_KEY ? (isDark ? 'ring-white/10 ring-offset-zinc-900' : 'ring-slate-300 ring-offset-white') : 'ring-transparent',
                colorPickAnim && resolveColorButtonKey(strokeColor) === CUSTOM_COLOR_KEY ? 'color-swatch-pop' : '',
              ]"
              :style="customSwatchStyle"
              title="Custom color"
              :disabled="!hasImage"
              @click="toggleColorPicker('toolbar')"
            />
            <button
              v-for="color in colors"
              :key="color.value"
              :ref="(el) => registerColorButton(color.value, el)"
              type="button"
              class="relative z-10 w-6 h-6 rounded-full transition-transform hover:scale-110 ring-1 disabled:opacity-30"
              :class="[
                strokeColor !== color.value ? (isDark ? 'ring-white/10 ring-offset-zinc-900' : 'ring-slate-300 ring-offset-white') : 'ring-transparent',
                colorPickAnim && strokeColor === color.value ? 'color-swatch-pop' : '',
              ]"
              :style="{ backgroundColor: color.value }"
              :title="color.name"
              :disabled="!hasImage"
              @click="selectStrokeColor(color.value)"
            />
            <div
              v-if="showColorPicker && colorPickerAnchor === 'toolbar'"
              ref="colorPickerWrapRef"
              class="absolute top-full left-0 mt-2 z-50"
            >
              <ColorPickerPopover
                :model-value="strokeColor"
                :is-dark="isDark"
                @update:model-value="onCustomColorUpdate"
                @close="closeColorPicker"
              />
            </div>
          </div>
        </div>

        <div class="hidden xl:block w-px h-5 mx-1.5 shrink-0" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />

        <!-- Stroke sizes (desktop) -->
        <div class="hidden xl:flex items-center gap-2 shrink-0">
          <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Stroke</span>
          <div ref="strokeStripRef" class="relative flex items-center gap-0.5 p-0.5 rounded-lg" :class="[isDark ? 'bg-zinc-800' : 'bg-slate-200']">
            <div
              class="stroke-indicator absolute top-0.5 bottom-0.5 rounded-md pointer-events-none shadow-sm"
              :class="[isDark ? 'bg-zinc-600' : 'bg-slate-700']"
              :style="strokeIndicatorStyle"
            />
            <button
              v-for="size in brushSizes"
              :key="size"
              :ref="(el) => registerStrokeButton(size, el)"
              type="button"
              class="relative z-10 flex items-center justify-center w-8 h-7 rounded-md transition-colors"
              :class="[strokeWidth === size ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
              :disabled="!hasImage"
              :title="`${size}px`"
              @click="selectStrokeWidth(size)"
            >
              <div
                class="rounded-full bg-current"
                :class="{ 'stroke-dot-pop': strokePickAnim && strokeWidth === size }"
                :style="{ width: `${Math.min(size * 2.5, 14)}px`, height: `${Math.min(size * 2.5, 14)}px` }"
              />
            </button>
          </div>
        </div>

        <!-- Text font size (desktop, text tool only) -->
        <template v-if="toolMode === 'text'">
          <div class="hidden xl:block w-px h-5 mx-1.5 shrink-0" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />
          <div class="hidden xl:flex items-center gap-2 shrink-0">
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Size</span>
            <input v-model.number="textFontSize" type="range" min="12" max="48" class="w-20 h-1.5 accent-indigo-500" />
            <span class="text-xs tabular-nums" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ textFontSize }}px</span>
          </div>
        </template>

        <!-- Arrow pivot (desktop, when arrow selected) -->
        <template v-if="selectedArrow != null">
          <div class="hidden xl:block w-px h-5 mx-1.5 shrink-0" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />
          <div class="hidden xl:flex items-center gap-2 shrink-0">
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Pivot</span>
            <input
              type="range"
              min="-180"
              max="180"
              :value="selectedArrowAngleDeg"
              class="w-24 h-1.5 accent-indigo-500"
              @input="updateSelectedArrowAngle(Number(($event.target as HTMLInputElement).value))"
            />
            <span class="text-xs tabular-nums w-8" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ selectedArrowAngleDeg }}°</span>
          </div>
        </template>

        <!-- Help button (desktop, row 2 right-aligned) -->
        <button
          ref="helpButtonRef"
          type="button"
          class="hidden xl:flex items-center justify-center w-8 h-8 rounded-lg text-base font-semibold transition-colors ml-auto"
          :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']"
          title="Help"
          aria-label="Open help"
          @click="showHelp = true"
        >?</button>
        </div>

        <!-- Compact actions + overflow menu (mobile / tablet) -->
        <div class="flex xl:hidden items-center gap-1 ml-auto shrink-0">
          <button
            type="button"
            class="flex items-center justify-center w-8 h-8 rounded-lg transition-colors relative"
            :class="[
              showSavesPanel
                ? (isDark ? 'bg-zinc-800 text-zinc-100' : 'bg-slate-100 text-slate-900')
                : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100')
            ]"
            title="Saved projects"
            aria-label="Saved projects"
            @click="toggleSavesPanel"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3.75h3.375M12 11.25v3.375m-3.375 0h7.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            <span v-if="savedProjects.length" class="absolute -top-0.5 -right-0.5 text-[9px] font-bold tabular-nums min-w-[14px] h-[14px] px-1 rounded-full flex items-center justify-center" :class="[isDark ? 'bg-indigo-500 text-white' : 'bg-indigo-600 text-white']">{{ savedProjects.length }}</span>
            <span v-if="saveStatus === 'saving'" class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            :class="[copied ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white']"
            :disabled="!hasImage"
            :title="copied ? 'Copied!' : 'Copy to Clipboard'"
            @click="copyToClipboard"
          >
            <svg v-if="!copied" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            <span class="hidden sm:inline">{{ copied ? 'Copied!' : 'Copy' }}</span>
          </button>
          <button
            ref="toolbarMenuButtonRef"
            type="button"
            class="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            :class="[
              showToolbarMenu
                ? (isDark ? 'bg-zinc-700 text-zinc-200' : 'bg-slate-200 text-slate-800')
                : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100')
            ]"
            title="More options"
            aria-label="More options"
            :aria-expanded="showToolbarMenu"
            @click.stop="toggleToolbarMenu"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" /></svg>
          </button>
        </div>

        <!-- Overflow menu panel -->
        <div
          v-if="showToolbarMenu"
          ref="toolbarMenuRef"
          class="absolute top-full right-2 sm:right-3 mt-2 z-30 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl shadow-2xl border p-3 space-y-3 xl:hidden"
          :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
          @click.stop
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              :disabled="!hasImage"
              @click="performSave(); closeToolbarMenu()"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Save now
            </button>
            <div class="flex items-center gap-1 text-[11px]" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">
              <span v-if="saveStatus === 'saving'" class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <svg v-else-if="saveStatus === 'saved'" class="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              <svg v-else-if="saveStatus === 'error'" class="w-3 h-3 text-red-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              <span>{{ saveStatus === 'saving' ? 'Saving' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : '' }}</span>
            </div>
          </div>
          <div>
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Color</span>
            <div ref="colorMenuStripRef" class="relative flex flex-wrap gap-2 mt-2">
              <div
                class="color-indicator absolute rounded-full pointer-events-none ring-2 ring-offset-2"
                :class="[isDark ? 'ring-white ring-offset-zinc-900' : 'ring-slate-800 ring-offset-white']"
                :style="colorMenuIndicatorStyle"
              />
              <button
                :ref="(el) => registerCustomSwatchButton(el, true)"
                type="button"
                class="relative z-10 w-7 h-7 rounded-full transition-transform hover:scale-110 ring-1 disabled:opacity-30"
                :class="[
                  resolveColorButtonKey(strokeColor) !== CUSTOM_COLOR_KEY ? (isDark ? 'ring-white/10 ring-offset-zinc-900' : 'ring-slate-300 ring-offset-white') : 'ring-transparent',
                  colorPickAnim && resolveColorButtonKey(strokeColor) === CUSTOM_COLOR_KEY ? 'color-swatch-pop' : '',
                ]"
                :style="customSwatchStyle"
                title="Custom color"
                :disabled="!hasImage"
                @click="toggleColorPicker('menu')"
              />
              <button
                v-for="color in colors"
                :key="`menu-${color.value}`"
                :ref="(el) => registerColorButton(color.value, el, true)"
                type="button"
                class="relative z-10 w-7 h-7 rounded-full transition-transform hover:scale-110 ring-1 disabled:opacity-30"
                :class="[
                  strokeColor !== color.value ? (isDark ? 'ring-white/10 ring-offset-zinc-900' : 'ring-slate-300 ring-offset-white') : 'ring-transparent',
                  colorPickAnim && strokeColor === color.value ? 'color-swatch-pop' : '',
                ]"
                :style="{ backgroundColor: color.value }"
                :title="color.name"
                :disabled="!hasImage"
                @click="selectStrokeColor(color.value)"
              />
              <div
                v-if="showColorPicker && colorPickerAnchor === 'menu'"
                ref="colorPickerWrapRef"
                class="absolute top-full left-0 mt-2 z-50"
              >
                <ColorPickerPopover
                  :model-value="strokeColor"
                  :is-dark="isDark"
                  @update:model-value="onCustomColorUpdate"
                  @close="closeColorPicker"
                />
              </div>
            </div>
          </div>

          <div>
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Stroke</span>
            <div ref="strokeMenuStripRef" class="relative flex items-center gap-0.5 p-0.5 rounded-lg mt-2 w-fit" :class="[isDark ? 'bg-zinc-800' : 'bg-slate-200']">
              <div
                class="stroke-indicator absolute top-0.5 bottom-0.5 rounded-md pointer-events-none shadow-sm"
                :class="[isDark ? 'bg-zinc-600' : 'bg-slate-700']"
                :style="strokeMenuIndicatorStyle"
              />
              <button
                v-for="size in brushSizes"
                :key="`menu-${size}`"
                :ref="(el) => registerStrokeButton(size, el, true)"
                type="button"
                class="relative z-10 flex items-center justify-center w-9 h-8 rounded-md transition-colors"
                :class="[strokeWidth === size ? 'text-white' : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-300/60')]"
                :disabled="!hasImage"
                :title="`${size}px`"
                @click="selectStrokeWidth(size)"
              >
                <div
                  class="rounded-full bg-current"
                  :class="{ 'stroke-dot-pop': strokePickAnim && strokeWidth === size }"
                  :style="{ width: `${Math.min(size * 2.5, 14)}px`, height: `${Math.min(size * 2.5, 14)}px` }"
                />
              </button>
            </div>
          </div>

          <div v-if="toolMode === 'text'">
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Text size</span>
            <div class="flex items-center gap-2 mt-2">
              <input v-model.number="textFontSize" type="range" min="12" max="48" class="flex-1 h-1.5 accent-indigo-500" />
              <span class="text-xs tabular-nums w-10 text-right" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ textFontSize }}px</span>
            </div>
          </div>

          <div v-if="selectedArrow != null">
            <span class="text-xs font-medium uppercase tracking-wider" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']">Pivot</span>
            <div class="flex items-center gap-2 mt-2">
              <input
                type="range"
                min="-180"
                max="180"
                :value="selectedArrowAngleDeg"
                class="flex-1 h-1.5 accent-indigo-500"
                @input="updateSelectedArrowAngle(Number(($event.target as HTMLInputElement).value))"
              />
              <span class="text-xs tabular-nums w-10 text-right" :class="[isDark ? 'text-zinc-400' : 'text-slate-500']">{{ selectedArrowAngleDeg }}°</span>
            </div>
          </div>

          <button
            v-if="stripSegments.length > 1"
            type="button"
            class="flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            :class="[labelsEnabled
              ? (isDark ? 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200')
              : (isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100')]"
            :disabled="!hasImage"
            @click="toggleStripLabels(); closeToolbarMenu()"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" /><text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="bold" fill="currentColor">1</text></svg>
            {{ labelsEnabled ? 'Hide labels' : 'Show labels' }}
          </button>
          <div class="flex gap-2 pt-1 border-t" :class="[isDark ? 'border-zinc-800' : 'border-slate-200']">
            <button
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100']"
              :disabled="!hasImage || !canUndo"
              @click="undo(); closeToolbarMenu()"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
              Undo
            </button>
            <button
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium hover:text-red-500 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              :class="[isDark ? 'text-zinc-400' : 'text-slate-600']"
              title="Clear all and start over"
              :disabled="!hasClearableContent"
              @click="confirmClearWithSave()"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Clear
            </button>
          </div>
        </div>

        <SavesPanel
          v-if="showSavesPanel"
          :projects="savedProjects"
          :storage-bytes="storageBytes"
          :is-dark="isDark"
          :active-id="projectId"
          @load="loadSavedProjectIntoCanvas"
          @rename="handleRenameSaved"
          @delete="handleDeleteSaved"
          @refresh="refreshSavedList"
          @close="showSavesPanel = false"
        />
      </div>

      <!-- Canvas / Placeholder -->
      <div
        ref="canvasWrapperRef"
        class="relative flex-1 min-h-0 border rounded-xl shadow-sm overflow-hidden flex items-center justify-center transition-colors duration-200"
        :class="[
          isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200',
          imageSlamActive && imageSlamIntensity === 'full' ? 'canvas-jolt' : '',
        ]"
        :style="imageSlamActive && imageSlamIntensity === 'full' ? { animationDelay: `${slamImpactDelay}s` } : undefined"
      >
        <!-- Empty state -->
        <div v-if="!hasImage" class="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-8">
          <div
            class="border-2 border-dashed rounded-2xl px-16 py-12 flex flex-col items-center gap-4 transition-colors cursor-default"
            :class="[isDark ? 'border-zinc-700 hover:border-zinc-600' : 'border-slate-300 hover:border-slate-400']"
          >
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center" :class="[isDark ? 'bg-zinc-800' : 'bg-slate-100']">
              <svg class="w-7 h-7" :class="[isDark ? 'text-zinc-500' : 'text-slate-500']" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <p class="text-base font-medium" :class="[isDark ? 'text-zinc-300' : 'text-slate-700']">Paste or upload an image to get started</p>
              <p class="text-sm mt-1" :class="[isDark ? 'text-zinc-600' : 'text-slate-500']">Cmd+V / Ctrl+V to paste from clipboard</p>
            </div>
            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileSelect" />
            <button
              type="button"
              class="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              @click="triggerFileInput"
            >
              Upload image
            </button>
          </div>
        </div>

        <canvas
          v-show="hasImage"
          ref="canvasRef"
          class="absolute block origin-center"
          :class="[
            canvasCursorClass,
            imageSlamActive
              ? (imageSlamIntensity === 'full' ? 'canvas-slam-enter' : 'canvas-slam-enter-light')
              : '',
          ]"
          @mousedown="startDrawing"
          @mousemove="draw"
          @mouseup="stopDrawing"
          @mouseleave="(e) => { onCanvasMouseLeave(); stopDrawing(e); }"
          @click="onCanvasClick"
        />

        <!-- Text input overlay -->
        <textarea
          v-if="hasImage && textInputVisible"
          ref="textInputRef"
          v-model="textInputValue"
          class="absolute min-w-[120px] max-w-[280px] min-h-[2em] px-2 py-1 border-2 border-indigo-500 rounded shadow-xl outline-none resize-y"
          :class="[isDark ? 'bg-zinc-900/95 text-white' : 'bg-white/95 text-slate-900']"
          :style="textInputStyle"
          placeholder="Type here... (Shift+Enter for new line)"
          rows="3"
          @blur="commitText"
          @keydown="onTextInputKeydown"
        />

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

        <!-- Contextual hints -->
        <div
          v-if="hasImage && toolMode === 'emoji' && pendingEmoji"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg pointer-events-none border"
          :class="[isDark ? 'text-zinc-400 bg-zinc-900/90 border-zinc-800' : 'text-slate-600 bg-white/90 border-slate-200']"
        >
          Click to place {{ pendingEmoji.emoji }}
        </div>
        <div
          v-if="hasImage && toolMode === 'text' && !textInputVisible"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg pointer-events-none border"
          :class="[isDark ? 'text-zinc-400 bg-zinc-900/90 border-zinc-800' : 'text-slate-600 bg-white/90 border-slate-200']"
        >
          Click on canvas to add text
        </div>
        <div
          v-if="hasImage && toolMode === 'move'"
          class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg pointer-events-none border"
          :class="[isDark ? 'text-zinc-400 bg-zinc-900/90 border-zinc-800' : 'text-slate-600 bg-white/90 border-slate-200']"
        >
          Drag to move · drag corners to resize layers · drag handle to resize
        </div>

        <!-- Zoom controls -->
        <div
          v-if="hasImage"
          class="absolute bottom-4 left-4 z-10 flex items-center gap-1 backdrop-blur-sm px-2 py-1 rounded-full shadow-lg border"
          :class="[isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-slate-200']"
        >
          <button
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md text-sm font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Zoom out (⌘-)"
            @click="zoomBy(1 / ZOOM_STEP)"
          >−</button>
          <span
            class="text-xs tabular-nums text-center min-w-[3.5rem] select-none"
            :class="[isDark ? 'text-zinc-400' : 'text-slate-500']"
          >{{ zoomPercent }}%</span>
          <button
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-md text-sm font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Zoom in (⌘+)"
            @click="zoomBy(ZOOM_STEP)"
          >+</button>
          <div class="w-px h-4 mx-0.5" :class="[isDark ? 'bg-zinc-700' : 'bg-slate-300']" />
          <button
            type="button"
            class="flex items-center justify-center px-2 h-7 rounded-md text-xs font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Fit to window (⌘0)"
            @click="zoomToFit"
          >Fit</button>
          <button
            type="button"
            class="flex items-center justify-center px-2 h-7 rounded-md text-xs font-medium transition-colors"
            :class="[isDark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-slate-600 hover:bg-slate-100']"
            title="Actual size (⌘1)"
            @click="zoomToActual"
          >1:1</button>
        </div>

        <!-- Navigator (zoomed-in overview) -->
        <ZoomNavigator
          v-if="isZoomed && baseImage"
          :image="baseImage.image"
          :annotations="annotations"
          :is-dark="isDark"
          :viewport="navigatorViewport"
          :draw-thumbnail="drawNavigatorThumbnail"
          @pan="onNavigatorPan"
        />
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="imageSlamActive"
        class="fixed inset-0 z-[55] overflow-visible pointer-events-none"
        aria-hidden="true"
      >
        <div
          v-for="ring in 3"
          :key="`slam-ring-${ring}`"
          class="slam-dust-ring"
          :class="[isDark ? 'slam-dust-ring-dark' : 'slam-dust-ring-light']"
          :style="slamRingStyle(ring)"
        />
        <div
          v-for="particle in (imageSlamIntensity === 'full' ? 14 : 8)"
          :key="`slam-particle-${particle}`"
          class="slam-dust-particle"
          :class="[isDark ? 'bg-zinc-400/70' : 'bg-slate-500/60']"
          :style="slamParticleStyle(particle)"
        />
        <div
          class="slam-impact-flash"
          :class="[
            isDark ? 'slam-impact-flash-dark' : 'slam-impact-flash-light',
            imageSlamIntensity === 'light' ? 'slam-impact-flash-sm' : '',
          ]"
          :style="slamFlashStyle()"
        />
        <div
          class="slam-hand"
          :class="[imageSlamIntensity === 'full' ? 'slam-hand-full' : 'slam-hand-light']"
          :style="slamHandStyle()"
        >
          <svg viewBox="0 0 150 184" class="w-full h-auto drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]">
            <!-- Black outline layer: shapes drawn larger via wide black stroke -->
            <g fill="#161616" stroke="#161616" stroke-width="9" stroke-linejoin="round">
              <rect x="32" y="14" width="86" height="40" rx="14" />
              <rect x="33" y="40" width="84" height="62" rx="26" />
              <rect x="38" y="92" width="20" height="74" rx="10" />
              <rect x="59" y="94" width="20" height="84" rx="10" />
              <rect x="80" y="94" width="20" height="82" rx="10" />
              <rect x="101" y="92" width="20" height="70" rx="10" />
              <g transform="rotate(34 30 74)">
                <rect x="13" y="56" width="21" height="52" rx="10" />
              </g>
            </g>
            <!-- White glove fill: same shapes, original size, no stroke -->
            <g fill="#ffffff">
              <rect x="32" y="14" width="86" height="40" rx="14" />
              <rect x="33" y="40" width="84" height="62" rx="26" />
              <rect x="38" y="92" width="20" height="74" rx="10" />
              <rect x="59" y="94" width="20" height="84" rx="10" />
              <rect x="80" y="94" width="20" height="82" rx="10" />
              <rect x="101" y="92" width="20" height="70" rx="10" />
              <g transform="rotate(34 30 74)">
                <rect x="13" y="56" width="21" height="52" rx="10" />
              </g>
            </g>
            <!-- Cuff seam + back-of-hand darts -->
            <g fill="none" stroke="#161616" stroke-width="4" stroke-linecap="round">
              <path d="M34 52 q41 14 82 0" />
              <path d="M60 60 l-3 26" />
              <path d="M75 62 l0 26" />
              <path d="M90 60 l3 26" />
            </g>
          </svg>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showPasteDialog"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-dialog-title"
      >
        <div class="absolute inset-0 bg-black/50" @click="cancelPasteDialog" />
        <div
          class="relative w-full max-w-lg rounded-xl border p-5 shadow-2xl"
          :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
        >
          <h2
            id="paste-dialog-title"
            class="text-base font-semibold"
            :class="[isDark ? 'text-zinc-100' : 'text-slate-900']"
          >
            Add image
          </h2>
          <p class="mt-2 text-sm" :class="[isDark ? 'text-zinc-400' : 'text-slate-600']">
            An image is already loaded. Replace it, append it to the right as a sequence, or add it as a layer on top?
          </p>
          <label class="mt-4 flex items-center gap-2 text-sm cursor-pointer select-none" :class="[isDark ? 'text-zinc-300' : 'text-slate-700']">
            <input v-model="sessionLabelDefault" type="checkbox" class="w-4 h-4 rounded accent-indigo-600" />
            Add numbered labels (1, 2, 3…)
          </label>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              class="flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="confirmReplaceImage"
            >
              Replace
            </button>
            <button
              type="button"
              class="flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              @click="confirmAppendImage"
            >
              Append to right
            </button>
            <button
              type="button"
              class="flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="confirmAddImageLayer"
            >
              Add as layer
            </button>
            <button
              type="button"
              class="flex-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100']"
              @click="cancelPasteDialog"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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
          tabindex="-1"
          class="relative w-full max-w-2xl rounded-xl border shadow-2xl outline-none"
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

    <Teleport to="body">
      <div
        v-if="pendingClearSaved && hasImage"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-saved-title"
      >
        <div class="absolute inset-0 bg-black/50" @click="pendingClearSaved = false" />
        <div
          class="relative w-full max-w-sm rounded-xl border p-5 shadow-2xl"
          :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
        >
          <h2 id="clear-saved-title" class="text-base font-semibold" :class="[isDark ? 'text-zinc-100' : 'text-slate-900']">
            Clear canvas?
          </h2>
          <p class="mt-2 text-sm" :class="[isDark ? 'text-zinc-400' : 'text-slate-600']">
            What should we do with the auto-saved version of this project?
          </p>
          <div class="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="pendingClearSaved = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800']"
              @click="performClearKeepSaved"
            >
              Keep saved
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
              @click="performClearAndRemove"
            >
              Delete saved
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="quotaError"
        class="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border p-4 shadow-2xl flex items-start gap-3"
        :class="[isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-slate-200']"
        role="alert"
      >
        <svg class="w-5 h-5 mt-0.5 shrink-0 text-red-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div class="flex-1 text-sm" :class="[isDark ? 'text-zinc-200' : 'text-slate-800']">
          {{ quotaError }}
        </div>
        <button
          type="button"
          class="flex items-center justify-center w-6 h-6 rounded-md transition-colors shrink-0"
          :class="[isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100']"
          @click="quotaError = null"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tool-indicator,
.color-indicator,
.stroke-indicator {
  transition:
    left 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
    top 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
    width 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
    height 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
    opacity 0.15s ease;
}

.tool-icon-pop {
  animation: tool-icon-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.color-swatch-pop {
  animation: color-swatch-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.stroke-dot-pop {
  animation: stroke-dot-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes tool-icon-pop {
  0% { transform: scale(1) rotate(0deg); }
  35% { transform: scale(1.35) rotate(-12deg); }
  70% { transform: scale(0.92) rotate(4deg); }
  100% { transform: scale(1) rotate(0deg); }
}

@keyframes color-swatch-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.28); }
  100% { transform: scale(1); }
}

@keyframes stroke-dot-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.5); }
  100% { transform: scale(1); }
}

.canvas-jolt {
  animation: canvas-jolt 0.48s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes canvas-jolt {
  0%, 100% { transform: translate(0, 0); }
  12% { transform: translate(-4px, 3px); }
  24% { transform: translate(5px, -3px); }
  36% { transform: translate(-3px, -4px); }
  48% { transform: translate(3px, 2px); }
  60% { transform: translate(-2px, 1px); }
}

.canvas-slam-enter {
  animation: canvas-slam 0.52s cubic-bezier(0.22, 1, 0.36, 1);
}

.canvas-slam-enter-light {
  animation: canvas-slam-light 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes canvas-slam {
  0% {
    transform: scale(1.12) translateY(-36px);
    opacity: 0.65;
    filter: blur(3px);
  }
  50% {
    transform: scale(0.97) translateY(6px);
    opacity: 1;
    filter: blur(0);
  }
  72% {
    transform: scale(1.015) translateY(-3px);
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

@keyframes canvas-slam-light {
  0% {
    transform: scale(1.06) translateY(-14px);
    opacity: 0.85;
  }
  55% {
    transform: scale(0.99) translateY(3px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

.slam-dust-ring {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.08);
  animation: slam-ring 0.72s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.slam-dust-ring-light {
  border-color: rgb(148 163 184 / 0.55);
}

.slam-dust-ring-dark {
  border-color: rgb(161 161 170 / 0.5);
}

@keyframes slam-ring {
  0% {
    transform: translate(-50%, -50%) scale(0.08);
    opacity: 0.85;
  }
  100% {
    transform: translate(-50%, -50%) scale(var(--slam-ring-end-scale, 12));
    opacity: 0;
  }
}

.slam-dust-particle {
  position: absolute;
  border-radius: 9999px;
  opacity: 0;
  animation: slam-particle 0.58s ease-out forwards;
}

@keyframes slam-particle {
  0% {
    transform: translate(-50%, -50%) rotate(var(--slam-angle)) translateX(0) scale(1);
    opacity: 0.85;
  }
  100% {
    transform: translate(-50%, -50%) rotate(var(--slam-angle)) translateX(var(--slam-distance)) scale(0.2);
    opacity: 0;
  }
}

.slam-impact-flash {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  opacity: 0;
  animation: slam-flash 0.38s ease-out forwards;
}

.slam-impact-flash-light {
  background: radial-gradient(circle at center, rgb(255 255 255 / 0.45) 0%, transparent 62%);
}

.slam-impact-flash-dark {
  background: radial-gradient(circle at center, rgb(255 255 255 / 0.18) 0%, transparent 62%);
}

.slam-impact-flash-sm {
  animation-duration: 0.28s;
}

@keyframes slam-flash {
  0% { opacity: 0; }
  18% { opacity: 1; }
  100% { opacity: 0; }
}

/* Cartoon glove anchored bottom-center over the image; animated Y added in keyframes */
.slam-hand {
  position: absolute;
  transform-origin: center bottom;
  will-change: transform, opacity;
}

.slam-hand-full {
  animation: slam-hand-full 0.72s cubic-bezier(0.33, 0, 0.2, 1) forwards;
}

.slam-hand-light {
  animation: slam-hand-light 0.52s cubic-bezier(0.33, 0, 0.2, 1) forwards;
}

@keyframes slam-hand-full {
  0% {
    transform: translate(-50%, -240%) rotate(-9deg) scale(1.06);
    opacity: 0;
  }
  16% { opacity: 1; }
  36% {
    transform: translate(-50%, -100%) rotate(0deg) scale(1);
    opacity: 1;
  }
  46% {
    transform: translate(-50%, -108%) rotate(0deg) scale(1);
    opacity: 1;
  }
  60% {
    transform: translate(-50%, -100%) rotate(2deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -250%) rotate(8deg) scale(1.04);
    opacity: 0;
  }
}

@keyframes slam-hand-light {
  0% {
    transform: translate(-50%, -220%) rotate(-7deg) scale(1.04);
    opacity: 0;
  }
  20% { opacity: 1; }
  42% {
    transform: translate(-50%, -100%) rotate(0deg) scale(1);
    opacity: 1;
  }
  60% {
    transform: translate(-50%, -106%) rotate(1deg) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -230%) rotate(6deg) scale(1.02);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-indicator,
  .color-indicator,
  .stroke-indicator {
    transition: none;
  }

  .tool-icon-pop,
  .color-swatch-pop,
  .stroke-dot-pop,
  .canvas-jolt,
  .canvas-slam-enter,
  .canvas-slam-enter-light,
  .slam-dust-ring,
  .slam-dust-particle,
  .slam-impact-flash,
  .slam-hand-full,
  .slam-hand-light {
    animation: none !important;
  }
}
</style>
