import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatClock, formatMinutes } from '../lib/time'
import { BLOCK_LABELS, blockDuration, maxPowerPct, workoutDuration } from '../lib/workout'
import { mixZoneColor, zoneForPercent } from '../lib/zones'
import type { Workout, WorkoutBlock } from '../types'

interface Props {
  workout: Workout
  selectedId: string | null
  onSelect: (id: string) => void
  isGenerating?: boolean
  revealEpoch?: number
}

export function WorkoutChart({
  workout,
  selectedId,
  onSelect,
  isGenerating = false,
  revealEpoch = 0,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'chart-canvas' })
  const duration = workoutDuration(workout.blocks)
  const peak = Math.max(160, Math.ceil(maxPowerPct(workout.blocks) / 10) * 10)
  const ids = workout.blocks.map((block) => block.id)

  return (
    <section className={`chart-panel ${isGenerating ? 'is-generating' : ''}`}>
      <div className="chart-heading">
        <h2>Profile</h2>
        <p>
          {formatClock(duration)} total · {workout.blocks.length} blocks
        </p>
      </div>

      <div ref={setNodeRef} className={`chart ${isOver ? 'is-over' : ''}`}>
        <div className="chart-axis" aria-hidden>
          {[100, 75, 50, 25].map((mark) => (
            <span
              key={mark}
              style={{ bottom: `calc(48px + (100% - 66px) * ${mark / peak})` }}
            >
              {workout.powerUnit === 'watts' ? Math.round((mark / 100) * workout.ftp) : `${mark}%`}
            </span>
          ))}
        </div>

        <div className="chart-plot">
          {workout.blocks.length === 0 ? (
            <div className="chart-empty">
              Your profile will appear here after you generate or add blocks.
            </div>
          ) : (
            <div className="chart-stage">
              <div className="chart-grid" aria-hidden>
                {[25, 50, 75, 100].map((pct) => (
                  <i
                    key={pct}
                    className={pct === 100 ? 'ftp-line' : undefined}
                    style={{ bottom: `${(pct / peak) * 100}%` }}
                  />
                ))}
              </div>
              <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                <div className="chart-blocks">
                  {workout.blocks.map((block, index) => (
                    <ChartBlock
                      key={`${revealEpoch}-${block.id}`}
                      block={block}
                      peak={peak}
                      selected={block.id === selectedId}
                      flex={blockDuration(block)}
                      ftp={workout.ftp}
                      unit={workout.powerUnit}
                      onSelect={onSelect}
                      revealEpoch={revealEpoch}
                      revealIndex={index}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}
        </div>
      </div>

      {isGenerating ? (
        <div className="chart-generating-overlay" aria-hidden>
          <div className="ai-bars ai-bars-lg">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.07}s` }} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ChartBlock({
  block,
  peak,
  selected,
  flex,
  ftp,
  unit,
  onSelect,
  revealEpoch,
  revealIndex,
}: {
  block: WorkoutBlock
  peak: number
  selected: boolean
  flex: number
  ftp: number
  unit: Workout['powerUnit']
  onSelect: (id: string) => void
  revealEpoch: number
  revealIndex: number
}) {
  const isPreview = String(block.id).startsWith('palette:')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { from: 'chart', blockType: block.type },
  })

  const style = {
    flexGrow: Math.max(flex, 20),
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`chart-block ${selected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${isPreview ? 'is-preview' : ''} ${revealEpoch > 0 ? 'ai-reveal' : ''}`}
      style={{
        ...style,
        ...(revealEpoch > 0
          ? { animationDelay: `${Math.min(revealIndex * 0.05, 0.6)}s` }
          : {}),
      }}
      onClick={() => {
        if (!isPreview) onSelect(block.id)
      }}
      {...(isPreview ? {} : listeners)}
      {...attributes}
    >
      <span className="shape-wrap">
        <BlockShape block={block} peak={peak} />
      </span>
      <span className="chart-block-meta">
        <em>{BLOCK_LABELS[block.type]}</em>
        <small>{formatMinutes(blockDuration(block))}</small>
        <small>{powerCaption(block, ftp, unit)}</small>
      </span>
    </button>
  )
}

function BlockShape({ block, peak }: { block: WorkoutBlock; peak: number }) {
  if (block.type === 'steady') {
    const h = (block.powerPct / peak) * 100
    return (
      <span
        className="shape shape-steady"
        style={{ height: `${h}%`, background: zoneForPercent(block.powerPct).color }}
      />
    )
  }

  if (block.type === 'freeride') {
    return <span className="shape shape-free" style={{ height: `${(55 / peak) * 100}%` }} />
  }

  if (block.type === 'intervals') {
    const pieces = Array.from({ length: block.repeat }, (_, i) => i)
    return (
      <span className="shape shape-intervals">
        {pieces.map((i) => (
          <span key={i} className="interval-pair">
            <i
              style={{
                flexGrow: block.onDurationSec,
                height: `${(block.onPct / peak) * 100}%`,
                background: zoneForPercent(block.onPct).color,
              }}
            />
            <i
              style={{
                flexGrow: block.offDurationSec,
                height: `${(block.offPct / peak) * 100}%`,
                background: zoneForPercent(block.offPct).color,
              }}
            />
          </span>
        ))}
      </span>
    )
  }

  const startH = (block.startPct / peak) * 100
  const endH = (block.endPct / peak) * 100
  return (
    <svg className="shape shape-ramp" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon
        points={`0,${100 - startH} 100,${100 - endH} 100,100 0,100`}
        fill={mixZoneColor(block.startPct, block.endPct)}
      />
    </svg>
  )
}

function powerCaption(block: WorkoutBlock, ftp: number, unit: Workout['powerUnit']): string {
  const fmt = (pct: number) =>
    unit === 'watts' ? `${Math.round((pct / 100) * ftp)} W` : `${Math.round(pct)}%`

  if (block.type === 'steady') return fmt(block.powerPct)
  if (block.type === 'freeride') return 'Open'
  if (block.type === 'intervals') return `${fmt(block.onPct)} / ${fmt(block.offPct)}`
  return `${fmt(block.startPct)} → ${fmt(block.endPct)}`
}
