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

const SEQ_AUTO_RATIO = 0.03
const SEQ_AUTO_MIN = 14
const SEQ_AUTO_MAX = 28
const SEQ_SIZE_MIN = 8
const SEQ_SIZE_MAX = 64

export function autoSequenceRadius(canvasHeight: number): number {
  return Math.min(SEQ_AUTO_MAX, Math.max(SEQ_AUTO_MIN, canvasHeight * SEQ_AUTO_RATIO))
}

export function resolveSequenceRadius(size: number | 'auto', canvasHeight: number): number {
  if (size === 'auto') return autoSequenceRadius(canvasHeight)
  return Math.min(SEQ_SIZE_MAX, Math.max(SEQ_SIZE_MIN, size))
}
