import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatClock, formatMinutes } from '../lib/time'
import { snapDuration, type DurationSnapSec } from '../lib/settings'
import { BLOCK_LABELS, blockDuration, blockTexts, maxPowerPct, workoutDuration } from '../lib/workout'
import { mixZoneColor, zoneForPercent } from '../lib/zones'
import type { Workout, WorkoutBlock } from '../types'

interface Props {
  workout: Workout
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChangeBlock?: (id: string, patch: Partial<WorkoutBlock>) => void
  durationSnapSec?: DurationSnapSec
  isGenerating?: boolean
  revealEpoch?: number
}

export function WorkoutChart({
  workout,
  selectedId,
  onSelect,
  onChangeBlock,
  durationSnapSec = 30,
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
          {formatClock(duration)} total · {workout.blocks.length}{' '}
          {workout.blocks.length === 1 ? 'block' : 'blocks'}
        </p>
      </div>

      <div
        ref={setNodeRef}
        className={`chart ${isOver ? 'is-over' : ''}`}
        onPointerDown={(event) => {
          // Empty chart chrome (not a block) clears selection.
          const target = event.target as Element | null
          if (target?.closest('.chart-block')) return
          if (selectedId) onSelect(null)
        }}
      >
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
                      totalDuration={duration}
                      ftp={workout.ftp}
                      unit={workout.powerUnit}
                      onSelect={onSelect}
                      onChangeBlock={onChangeBlock}
                      durationSnapSec={durationSnapSec}
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
  totalDuration,
  ftp,
  unit,
  onSelect,
  onChangeBlock,
  durationSnapSec,
  revealEpoch,
  revealIndex,
}: {
  block: WorkoutBlock
  peak: number
  selected: boolean
  flex: number
  totalDuration: number
  ftp: number
  unit: Workout['powerUnit']
  onSelect: (id: string | null) => void
  onChangeBlock?: (id: string, patch: Partial<WorkoutBlock>) => void
  durationSnapSec: DurationSnapSec
  revealEpoch: number
  revealIndex: number
}) {
  const isPreview = String(block.id).startsWith('palette:')
  const resizingRef = useRef(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { from: 'chart', blockType: block.type },
    disabled: isPreview,
  })

  const style = {
    flexGrow: Math.max(flex, 20),
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const canResize = selected && !isPreview && !!onChangeBlock

  function startPowerResize(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!onChangeBlock) return
    event.preventDefault()
    event.stopPropagation()
    resizingRef.current = true

    const stage = (event.currentTarget.closest('.chart-stage') as HTMLElement | null) ?? null
    if (!stage) return
    const rect = stage.getBoundingClientRect()

    const onMove = (moveEvent: PointerEvent) => {
      const y = moveEvent.clientY
      const ratio = 1 - (y - rect.top) / rect.height
      const pct = clamp(Math.round(ratio * peak * 2) / 2, 0, 300)
      onChangeBlock(block.id, powerPatch(block, pct))
    }

    const onUp = () => {
      resizingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startDurationResize(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!onChangeBlock) return
    event.preventDefault()
    event.stopPropagation()
    resizingRef.current = true

    const row = event.currentTarget.closest('.chart-blocks') as HTMLElement | null
    if (!row) return
    const rowWidth = row.getBoundingClientRect().width
    const startX = event.clientX
    const startDuration = blockDuration(block)
    const otherDuration = Math.max(1, totalDuration - startDuration)

    const onMove = (moveEvent: PointerEvent) => {
      const deltaPx = moveEvent.clientX - startX
      const secondsPerPx = totalDuration / Math.max(rowWidth, 1)
      const raw = startDuration + deltaPx * secondsPerPx
      const next = clamp(snapDuration(raw, durationSnapSec), 1, 3 * 60 * 60)
      onChangeBlock(block.id, durationPatch(block, next, durationSnapSec))
      void otherDuration
    }

    const onUp = () => {
      resizingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
        {blockTexts(block).map((alert) => {
          const maxDur = Math.max(blockDuration(block), 1)
          const left = `${(clamp(alert.timeOffsetSec, 0, maxDur) / maxDur) * 100}%`
          return (
            <span
              key={alert.id}
              className="chart-text-marker"
              style={{ left }}
              title={`${formatMinutes(alert.timeOffsetSec)} · ${alert.message || 'Text alert'}`}
            />
          )
        })}
        {canResize && block.type !== 'freeride' ? (
          <span
            className="chart-handle chart-handle-power"
            role="slider"
            aria-label="Adjust power"
            aria-valuemin={0}
            aria-valuemax={300}
            tabIndex={0}
            onPointerDown={startPowerResize}
          />
        ) : null}
        {canResize ? (
          <span
            className="chart-handle chart-handle-duration"
            role="slider"
            aria-label="Adjust duration"
            tabIndex={0}
            onPointerDown={startDurationResize}
          />
        ) : null}
      </span>
      <span className="chart-block-meta">
        <em>{BLOCK_LABELS[block.type]}</em>
        <small>{formatMinutes(blockDuration(block))}</small>
        <small>{powerCaption(block, ftp, unit)}</small>
        {cadenceCaption(block) ? <small>{cadenceCaption(block)}</small> : null}
      </span>
    </button>
  )
}

function cadenceCaption(block: WorkoutBlock): string | null {
  if (block.type === 'intervals') {
    if (block.cadence == null && block.cadenceResting == null) return null
    const on = block.cadence != null ? `${block.cadence}` : '—'
    const off = block.cadenceResting != null ? `${block.cadenceResting}` : '—'
    return `${on}/${off} rpm`
  }
  if (block.cadenceLow != null && block.cadenceHigh != null) {
    return `${block.cadenceLow}–${block.cadenceHigh} rpm`
  }
  if (block.cadence != null) return `${block.cadence} rpm`
  return null
}

function powerPatch(block: WorkoutBlock, pct: number): Partial<WorkoutBlock> {
  if (block.type === 'steady') return { powerPct: pct }
  if (block.type === 'intervals') return { onPct: pct }
  if (block.type === 'freeride') return {}
  const delta = pct - block.endPct
  return {
    startPct: clamp(block.startPct + delta, 0, 300),
    endPct: pct,
  }
}

function durationPatch(
  block: WorkoutBlock,
  nextSec: number,
  snapSec: DurationSnapSec,
): Partial<WorkoutBlock> {
  const snapped = snapDuration(nextSec, snapSec)
  if (block.type === 'intervals') {
    const cycle = block.onDurationSec + block.offDurationSec
    if (cycle <= 0) {
      const half = snapDuration(snapped / block.repeat / 2, snapSec)
      return { onDurationSec: half, offDurationSec: half }
    }
    const scale = snapped / (cycle * block.repeat)
    return {
      onDurationSec: snapDuration(block.onDurationSec * scale, snapSec),
      offDurationSec: snapDuration(block.offDurationSec * scale, snapSec),
    }
  }
  return { durationSec: snapped } as Partial<WorkoutBlock>
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
