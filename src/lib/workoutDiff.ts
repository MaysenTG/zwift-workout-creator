import { formatClock, formatMinutes } from './time'
import { BLOCK_LABELS, workoutDuration } from './workout'
import type { BlockType, Workout, WorkoutBlock } from '../types'

type WorkoutSnapshot = Pick<Workout, 'name' | 'description' | 'blocks'>

export function summarizeAiWorkoutChange(before: WorkoutSnapshot, after: WorkoutSnapshot): string[] {
  const lines: string[] = []

  if (before.blocks.length === 0) {
    lines.push(
      `Created ${after.blocks.length} block${after.blocks.length === 1 ? '' : 's'} (${formatClock(workoutDuration(after.blocks))} total).`,
    )
    appendTypeSummary(lines, emptyTypeCounts(), countTypes(after.blocks))
    if (after.name && after.name !== before.name) {
      lines.push(`Title set to “${after.name}”.`)
    }
    return lines
  }

  if (before.name !== after.name) {
    lines.push(`Renamed “${before.name || 'Untitled ride'}” → “${after.name || 'Untitled ride'}”.`)
  }
  if (before.description.trim() !== after.description.trim()) {
    lines.push('Updated workout description.')
  }

  const blockDelta = after.blocks.length - before.blocks.length
  if (blockDelta > 0) {
    lines.push(`Added ${blockDelta} block${blockDelta === 1 ? '' : 's'}.`)
  } else if (blockDelta < 0) {
    lines.push(`Removed ${Math.abs(blockDelta)} block${blockDelta === -1 ? '' : 's'}.`)
  }

  const durBefore = workoutDuration(before.blocks)
  const durAfter = workoutDuration(after.blocks)
  const durDelta = durAfter - durBefore
  if (durDelta !== 0) {
    const sign = durDelta > 0 ? '+' : '−'
    lines.push(
      `Total duration ${formatClock(durBefore)} → ${formatClock(durAfter)} (${sign}${formatMinutes(Math.abs(durDelta))}).`,
    )
  } else if (blockDelta !== 0 || !fingerprintsEqual(before.blocks, after.blocks)) {
    lines.push(`Total duration unchanged at ${formatClock(durAfter)}.`)
  }

  appendTypeSummary(lines, countTypes(before.blocks), countTypes(after.blocks))

  const modified: string[] = []
  const shared = Math.min(before.blocks.length, after.blocks.length)
  for (let i = 0; i < shared; i++) {
    const detail = describeBlockChange(before.blocks[i], after.blocks[i], i + 1)
    if (detail) modified.push(detail)
  }
  for (const detail of modified.slice(0, 5)) {
    lines.push(detail)
  }
  if (modified.length > 5) {
    lines.push(`…and ${modified.length - 5} more block tweak${modified.length - 5 === 1 ? '' : 's'}.`)
  }

  if (lines.length === 0) {
    lines.push('No structural changes detected (same blocks and timing).')
  }

  return lines
}

function appendTypeSummary(
  lines: string[],
  before: Record<BlockType, number>,
  after: Record<BlockType, number>,
): void {
  const types: BlockType[] = [
    'warmup',
    'steady',
    'ramp',
    'intervals',
    'freeride',
    'cooldown',
  ]
  for (const type of types) {
    const delta = (after[type] ?? 0) - (before[type] ?? 0)
    if (delta > 0) {
      lines.push(
        `${BLOCK_LABELS[type]}: ${before[type] ?? 0} → ${after[type]} (+${delta}).`,
      )
    } else if (delta < 0) {
      lines.push(
        `${BLOCK_LABELS[type]}: ${before[type] ?? 0} → ${after[type]} (${delta}).`,
      )
    }
  }
}

function emptyTypeCounts(): Record<BlockType, number> {
  return {
    steady: 0,
    ramp: 0,
    warmup: 0,
    cooldown: 0,
    intervals: 0,
    freeride: 0,
  }
}

function countTypes(blocks: WorkoutBlock[]): Record<BlockType, number> {
  const counts = emptyTypeCounts()
  for (const block of blocks) {
    counts[block.type] = (counts[block.type] ?? 0) + 1
  }
  return counts
}

function fingerprint(block: WorkoutBlock): string {
  return JSON.stringify(stripId(block))
}

function stripId(block: WorkoutBlock): Omit<WorkoutBlock, 'id'> {
  const { id: _id, ...rest } = block
  return rest as Omit<WorkoutBlock, 'id'>
}

function fingerprintsEqual(a: WorkoutBlock[], b: WorkoutBlock[]): boolean {
  if (a.length !== b.length) return false
  return a.every((block, i) => fingerprint(block) === fingerprint(b[i]))
}

function describeBlockChange(before: WorkoutBlock, after: WorkoutBlock, index: number): string | null {
  if (fingerprint(before) === fingerprint(after)) return null

  const label = BLOCK_LABELS[after.type]
  const pos = `#${index}`

  if (before.type !== after.type) {
    return `Block ${pos}: ${BLOCK_LABELS[before.type]} → ${label}.`
  }

  if (before.type === 'steady' && after.type === 'steady') {
    const parts: string[] = []
    if (before.durationSec !== after.durationSec) {
      parts.push(`duration ${formatMinutes(before.durationSec)} → ${formatMinutes(after.durationSec)}`)
    }
    if (before.powerPct !== after.powerPct) {
      parts.push(`power ${before.powerPct}% → ${after.powerPct}%`)
    }
    return parts.length ? `${label} ${pos}: ${parts.join(', ')}.` : null
  }

  if (before.type === 'intervals' && after.type === 'intervals') {
    const parts: string[] = []
    if (before.repeat !== after.repeat) parts.push(`repeats ${before.repeat} → ${after.repeat}`)
    if (before.onDurationSec !== after.onDurationSec) {
      parts.push(`on ${formatMinutes(before.onDurationSec)} → ${formatMinutes(after.onDurationSec)}`)
    }
    if (before.offDurationSec !== after.offDurationSec) {
      parts.push(
        `off ${formatMinutes(before.offDurationSec)} → ${formatMinutes(after.offDurationSec)}`,
      )
    }
    if (before.onPct !== after.onPct) parts.push(`on power ${before.onPct}% → ${after.onPct}%`)
    if (before.offPct !== after.offPct) parts.push(`off power ${before.offPct}% → ${after.offPct}%`)
    return parts.length ? `${label} ${pos}: ${parts.join(', ')}.` : null
  }

  if (before.type === 'freeride' && after.type === 'freeride') {
    if (before.durationSec !== after.durationSec) {
      return `${label} ${pos}: duration ${formatMinutes(before.durationSec)} → ${formatMinutes(after.durationSec)}.`
    }
    return null
  }

  if (
    (before.type === 'ramp' || before.type === 'warmup' || before.type === 'cooldown') &&
    before.type === after.type
  ) {
    const parts: string[] = []
    if (before.durationSec !== after.durationSec) {
      parts.push(`duration ${formatMinutes(before.durationSec)} → ${formatMinutes(after.durationSec)}`)
    }
    if (before.startPct !== after.startPct) {
      parts.push(`start ${before.startPct}% → ${after.startPct}%`)
    }
    if (before.endPct !== after.endPct) {
      parts.push(`end ${before.endPct}% → ${after.endPct}%`)
    }
    return parts.length ? `${label} ${pos}: ${parts.join(', ')}.` : null
  }

  return `${label} ${pos} updated.`
}
