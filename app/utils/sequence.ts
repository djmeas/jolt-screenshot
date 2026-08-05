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
