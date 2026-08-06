export type SequenceAnnotation = { type: 'sequence', x: number, y: number }
export type PenStroke = { type: 'pen', path: { x: number, y: number }[], color: string, lineWidth: number }
export type ArrowAnnotation = { type: 'arrow', x1: number, y1: number, length: number, angle: number, color: string, lineWidth: number }
export type BoxAnnotation = { type: 'box', x: number, y: number, width: number, height: number, color: string, lineWidth: number }
export type EmojiAnnotation = { type: 'emoji', x: number, y: number, emoji: string, size: number }
export type TextAnnotation = { type: 'text', x: number, y: number, text: string, fontSize: number, color: string }
export type ImageAnnotation = { type: 'image', id: string, objectUrl: string | null, x: number, y: number, width: number, height: number }
export type BlurAnnotation = { type: 'blur', x: number, y: number, width: number, height: number }
export type Annotation = PenStroke | ArrowAnnotation | BoxAnnotation | EmojiAnnotation | TextAnnotation | ImageAnnotation | SequenceAnnotation | BlurAnnotation
export type ToolMode = 'pen' | 'arrow' | 'box' | 'emoji' | 'text' | 'move' | 'sequence' | 'eraser' | 'blur'

const BLUR_RADIUS_RATIO = 0.015
const BLUR_RADIUS_MIN = 32
const BLUR_RADIUS_MAX = 64

export function blurRadiusForCanvas(canvasWidth: number): number {
  return Math.min(BLUR_RADIUS_MAX, Math.max(BLUR_RADIUS_MIN, Math.round(canvasWidth * BLUR_RADIUS_RATIO)))
}

export function blurRadiusForRegion(canvasWidth: number, regionWidth: number, regionHeight: number): number {
  const base = blurRadiusForCanvas(canvasWidth)
  const regionRadius = Math.round(Math.min(regionWidth, regionHeight) / 2)
  return Math.min(BLUR_RADIUS_MAX, Math.max(base, regionRadius))
}

export function getArrowTip(a: ArrowAnnotation) {
  return {
    x: a.x1 + a.length * Math.cos(a.angle),
    y: a.y1 + a.length * Math.sin(a.angle),
  }
}

export function hitTestArrow(arrow: ArrowAnnotation, x: number, y: number): boolean {
  const tip = getArrowTip(arrow)
  const dist = Math.hypot(x - tip.x, y - tip.y)
  const distTail = Math.hypot(x - arrow.x1, y - arrow.y1)
  const threshold = 20
  return dist < threshold || distTail < threshold || (Math.abs((x - arrow.x1) * Math.sin(arrow.angle) - (y - arrow.y1) * Math.cos(arrow.angle)) < threshold && (x - arrow.x1) * Math.cos(arrow.angle) + (y - arrow.y1) * Math.sin(arrow.angle) >= 0 && (x - arrow.x1) * Math.cos(arrow.angle) + (y - arrow.y1) * Math.sin(arrow.angle) <= arrow.length)
}

export function hitTestEmoji(emoji: EmojiAnnotation, x: number, y: number): boolean {
  const r = Math.max(emoji.size * 0.6, 16)
  return Math.hypot(x - emoji.x, y - emoji.y) <= r
}

export function hitTestText(text: TextAnnotation, x: number, y: number): boolean {
  const padding = Math.max(text.fontSize, 20)
  const lines = text.text.split('\n')
  const lineHeight = text.fontSize * 1.2
  const height = lines.length * lineHeight
  return x >= text.x - padding && x <= text.x + 300 && y >= text.y - padding && y <= text.y + height + padding
}

export function hitTestPenStroke(pen: PenStroke, x: number, y: number): boolean {
  if (pen.path.length < 2) return false
  const margin = pen.lineWidth * 2 + 8
  let minX = pen.path[0]!.x, maxX = pen.path[0]!.x, minY = pen.path[0]!.y, maxY = pen.path[0]!.y
  for (const p of pen.path) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return x >= minX - margin && x <= maxX + margin && y >= minY - margin && y <= maxY + margin
}

export function hitTestBox(box: BoxAnnotation, x: number, y: number): boolean {
  const margin = Math.max(box.lineWidth * 2, 12)
  return x >= box.x - margin && x <= box.x + box.width + margin &&
    y >= box.y - margin && y <= box.y + box.height + margin
}

export function hitTestBlur(blur: BlurAnnotation, x: number, y: number): boolean {
  const margin = 8
  return x >= blur.x - margin && x <= blur.x + blur.width + margin &&
    y >= blur.y - margin && y <= blur.y + blur.height + margin
}

export function hitTestImage(ann: ImageAnnotation, x: number, y: number): boolean {
  const margin = 4
  return x >= ann.x - margin && x <= ann.x + ann.width + margin &&
    y >= ann.y - margin && y <= ann.y + ann.height + margin
}

export function hitTestSequence(seq: SequenceAnnotation, x: number, y: number, radius: number): boolean {
  return Math.hypot(x - seq.x, y - seq.y) <= radius
}

export function annotationIndexAt(anns: readonly Annotation[], x: number, y: number, sequenceRadius: number): number | null {
  for (let i = anns.length - 1; i >= 0; i--) {
    const ann = anns[i]!
    if (ann.type === 'image' && hitTestImage(ann, x, y)) return i
    if (ann.type === 'arrow' && hitTestArrow(ann, x, y)) return i
    if (ann.type === 'box' && hitTestBox(ann, x, y)) return i
    if (ann.type === 'emoji' && hitTestEmoji(ann, x, y)) return i
    if (ann.type === 'text' && hitTestText(ann, x, y)) return i
    if (ann.type === 'pen' && hitTestPenStroke(ann, x, y)) return i
    if (ann.type === 'sequence' && hitTestSequence(ann, x, y, sequenceRadius)) return i
    if (ann.type === 'blur' && hitTestBlur(ann, x, y)) return i
  }
  return null
}

export function eraseAnnotationAt(
  anns: readonly Annotation[],
  x: number,
  y: number,
  sequenceRadius: number,
): { annotations: Annotation[], removedIndex: number } | null {
  const idx = annotationIndexAt(anns, x, y, sequenceRadius)
  if (idx === null) return null
  return { annotations: anns.filter((_, i) => i !== idx), removedIndex: idx }
}
