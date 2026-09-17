import { uid } from './ids'
import type { BlockType, Workout, WorkoutBlock } from '../types'

export function createBlock(type: BlockType): WorkoutBlock {
  switch (type) {
    case 'steady':
      return { id: uid(), type: 'steady', durationSec: 300, powerPct: 70 }
    case 'ramp':
      return { id: uid(), type: 'ramp', durationSec: 300, startPct: 50, endPct: 90 }
    case 'warmup':
      return { id: uid(), type: 'warmup', durationSec: 600, startPct: 40, endPct: 70 }
    case 'cooldown':
      return { id: uid(), type: 'cooldown', durationSec: 480, startPct: 55, endPct: 35 }
    case 'intervals':
      return {
        id: uid(),
        type: 'intervals',
        repeat: 5,
        onDurationSec: 120,
        offDurationSec: 120,
        onPct: 110,
        offPct: 50,
      }
    case 'freeride':
      return { id: uid(), type: 'freeride', durationSec: 300 }
  }
}

export function createWorkout(partial?: Partial<Workout>): Workout {
  const now = Date.now()
  return {
    id: uid(),
    name: 'Untitled ride',
    author: '',
    description: '',
    ftp: 200,
    powerUnit: 'percent',
    blocks: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export function blockDuration(block: WorkoutBlock): number {
  if (block.type === 'intervals') {
    return block.repeat * (block.onDurationSec + block.offDurationSec)
  }
  return block.durationSec
}

export function workoutDuration(blocks: WorkoutBlock[]): number {
  return blocks.reduce((sum, block) => sum + blockDuration(block), 0)
}

export function maxPowerPct(blocks: WorkoutBlock[]): number {
  let max = 0
  for (const block of blocks) {
    if (block.type === 'steady') max = Math.max(max, block.powerPct)
    else if (block.type === 'intervals') max = Math.max(max, block.onPct, block.offPct)
    else if (block.type === 'freeride') max = Math.max(max, 55)
    else max = Math.max(max, block.startPct, block.endPct)
  }
  return max
}

export function wattsFromPct(pct: number, ftp: number): number {
  return Math.round((pct / 100) * ftp)
}

export function pctFromWatts(watts: number, ftp: number): number {
  if (!ftp) return 0
  return Math.round((watts / ftp) * 1000) / 10
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  steady: 'Steady',
  ramp: 'Ramp',
  warmup: 'Warmup',
  cooldown: 'Cooldown',
  intervals: 'Intervals',
  freeride: 'Free ride',
}
