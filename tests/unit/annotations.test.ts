import { describe, expect, it } from 'vitest'
import {
  annotationIndexAt,
  blurRadiusForCanvas,
  blurRadiusForRegion,
  eraseAnnotationAt,
  getArrowTip,
  hitTestArrow,
  hitTestBlur,
  hitTestBox,
  hitTestEmoji,
  hitTestImage,
  hitTestPenStroke,
  hitTestSequence,
  hitTestText,
  type Annotation,
} from '~/utils/annotations'

const pen = (): Annotation => ({
  type: 'pen',
  path: [{ x: 10, y: 10 }, { x: 100, y: 100 }],
  color: '#000',
  lineWidth: 4,
})
const arrow = (): Annotation => ({ type: 'arrow', x1: 0, y1: 0, length: 100, angle: 0, color: '#000', lineWidth: 4 })
const box = (): Annotation => ({ type: 'box', x: 50, y: 50, width: 100, height: 80, color: '#000', lineWidth: 4 })
const emoji = (): Annotation => ({ type: 'emoji', x: 200, y: 200, emoji: '😀', size: 32 })
const text = (): Annotation => ({ type: 'text', x: 300, y: 300, text: 'hello', fontSize: 24, color: '#000' })
const image = (): Annotation => ({ type: 'image', id: 'a', objectUrl: null, x: 400, y: 400, width: 100, height: 100 })
const seq = (): Annotation => ({ type: 'sequence', x: 500, y: 500 })
const blur = (): Annotation => ({ type: 'blur', x: 600, y: 600, width: 120, height: 60 })

describe('getArrowTip', () => {
  it('returns the endpoint from length and angle', () => {
    expect(getArrowTip({ type: 'arrow', x1: 10, y1: 10, length: 100, angle: 0, color: '', lineWidth: 1 })).toEqual({ x: 110, y: 10 })
  })
})

describe('hit tests', () => {
  it('hitTestArrow hits near the tip and tail', () => {
    expect(hitTestArrow(arrow() as Extract<Annotation, { type: 'arrow' }>, 100, 0)).toBe(true)
    expect(hitTestArrow(arrow() as Extract<Annotation, { type: 'arrow' }>, 0, 0)).toBe(true)
    expect(hitTestArrow(arrow() as Extract<Annotation, { type: 'arrow' }>, 50, 100)).toBe(false)
  })

  it('hitTestBox hits inside with margin, misses far outside', () => {
    const b = box() as Extract<Annotation, { type: 'box' }>
    expect(hitTestBox(b, 100, 90)).toBe(true)
    expect(hitTestBox(b, 46, 50)).toBe(true)
    expect(hitTestBox(b, 10, 10)).toBe(false)
  })

  it('hitTestEmoji hits within the radius', () => {
    const e = emoji() as Extract<Annotation, { type: 'emoji' }>
    expect(hitTestEmoji(e, 210, 200)).toBe(true)
    expect(hitTestEmoji(e, 100, 100)).toBe(false)
  })

  it('hitTestText hits within padded bounds', () => {
    const t = text() as Extract<Annotation, { type: 'text' }>
    expect(hitTestText(t, 310, 310)).toBe(true)
    expect(hitTestText(t, 10, 10)).toBe(false)
  })

  it('hitTestPenStroke hits within the path bounding box plus margin', () => {
    const p = pen() as Extract<Annotation, { type: 'pen' }>
    expect(hitTestPenStroke(p, 50, 50)).toBe(true)
    expect(hitTestPenStroke(p, 500, 500)).toBe(false)
  })

  it('hitTestSequence hits within the given radius', () => {
    const s = seq() as Extract<Annotation, { type: 'sequence' }>
    expect(hitTestSequence(s, 505, 500, 20)).toBe(true)
    expect(hitTestSequence(s, 550, 500, 20)).toBe(false)
  })

  it('hitTestImage hits within the rect', () => {
    const i = image() as Extract<Annotation, { type: 'image' }>
    expect(hitTestImage(i, 450, 450)).toBe(true)
    expect(hitTestImage(i, 600, 600)).toBe(false)
  })

  it('hitTestBlur hits within the rect plus margin', () => {
    const b = blur() as Extract<Annotation, { type: 'blur' }>
    expect(hitTestBlur(b, 660, 630)).toBe(true)
    expect(hitTestBlur(b, 596, 600)).toBe(true)
    expect(hitTestBlur(b, 10, 10)).toBe(false)
  })
})

describe('blurRadiusForCanvas', () => {
  it('scales at 1.5% of the canvas width', () => {
    expect(blurRadiusForCanvas(3000)).toBe(45)
  })

  it('clamps to the 32px floor on small canvases', () => {
    expect(blurRadiusForCanvas(500)).toBe(32)
  })

  it('caps at 64px on large canvases', () => {
    expect(blurRadiusForCanvas(6000)).toBe(64)
  })
})

describe('blurRadiusForRegion', () => {
  it('caps at the maximum radius for large regions', () => {
    expect(blurRadiusForRegion(2000, 400, 300)).toBe(64)
  })

  it('scales up for small regions so they are fully blurred', () => {
    expect(blurRadiusForRegion(2000, 40, 30)).toBe(32)
    expect(blurRadiusForRegion(2000, 200, 100)).toBe(50)
  })

  it('never drops below the canvas-based floor', () => {
    expect(blurRadiusForRegion(500, 20, 20)).toBe(32)
  })

  it('caps at the maximum radius', () => {
    expect(blurRadiusForRegion(6000, 50, 50)).toBe(64)
  })
})

describe('annotationIndexAt', () => {
  it('returns null when nothing is hit', () => {
    expect(annotationIndexAt([pen()], 999, 999, 20)).toBeNull()
  })

  it('returns the topmost (last) annotation when multiple overlap', () => {
    const overlappingBox: Annotation = { type: 'box', x: 0, y: 0, width: 200, height: 200, color: '#000', lineWidth: 4 }
    const anns: Annotation[] = [pen(), overlappingBox]
    expect(annotationIndexAt(anns, 55, 55, 20)).toBe(1)
  })

  it('hits blur annotations', () => {
    expect(annotationIndexAt([blur()], 660, 630, 20)).toBe(0)
  })
})

describe('eraseAnnotationAt', () => {
  it('returns null when nothing is hit', () => {
    expect(eraseAnnotationAt([pen()], 999, 999, 20)).toBeNull()
  })

  it('removes the topmost hit annotation and reports its index', () => {
    const anns: Annotation[] = [pen(), box(), seq()]
    const result = eraseAnnotationAt(anns, 100, 90, 20)
    expect(result).not.toBeNull()
    expect(result!.removedIndex).toBe(1)
    expect(result!.annotations).toHaveLength(2)
    expect(result!.annotations.some(a => a.type === 'box')).toBe(false)
  })

  it('does not mutate the input array', () => {
    const anns: Annotation[] = [pen(), box()]
    eraseAnnotationAt(anns, 100, 90, 20)
    expect(anns).toHaveLength(2)
  })
})
