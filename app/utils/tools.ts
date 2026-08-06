import type { ToolMode } from '~/utils/annotations'

export type ToolDescriptor = {
  mode: ToolMode
  label: string
  hasPicker?: boolean
}

export const TOOLS: readonly ToolDescriptor[] = [
  { mode: 'pen', label: 'Pen' },
  { mode: 'arrow', label: 'Arrow' },
  { mode: 'box', label: 'Box' },
  { mode: 'emoji', label: 'Emoji', hasPicker: true },
  { mode: 'text', label: 'Text' },
  { mode: 'sequence', label: 'Sequence' },
  { mode: 'move', label: 'Move' },
  { mode: 'eraser', label: 'Eraser' },
]

export function buildToolShortcuts(modes: readonly string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (let i = 0; i < modes.length; i++) {
    map[String(i + 1)] = modes[i]!
  }
  return map
}
