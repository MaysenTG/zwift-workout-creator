import { useDraggable } from '@dnd-kit/core'
import { BLOCK_LABELS } from '../lib/workout'
import type { BlockType } from '../types'

const ITEMS: BlockType[] = ['warmup', 'steady', 'ramp', 'intervals', 'freeride', 'cooldown']

const HINTS: Record<BlockType, string> = {
  warmup: 'Ramp up at the start',
  steady: 'Constant power',
  ramp: 'Linear power change',
  intervals: 'Repeating on / off',
  freeride: 'No ERG target',
  cooldown: 'Ramp down at the end',
}

export function Palette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <section className="palette" aria-label="Block palette">
      <span className="palette-label">Add</span>
      <div className="palette-row">
        {ITEMS.map((type) => (
          <PaletteItem key={type} type={type} onAdd={() => onAdd(type)} />
        ))}
      </div>
    </section>
  )
}

function PaletteItem({ type, onAdd }: { type: BlockType; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { from: 'palette', blockType: type },
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`palette-chip type-${type} ${isDragging ? 'is-dragging' : ''}`}
      title={HINTS[type]}
      onClick={onAdd}
      {...listeners}
      {...attributes}
    >
      {BLOCK_LABELS[type]}
    </button>
  )
}
