import type { GeneratedBlockPayload } from './api'
import { uid } from './ids'
import type { Workout, WorkoutBlock } from '../types'

export function blocksFromAiPayload(payload: GeneratedBlockPayload[]): WorkoutBlock[] {
  return payload.map((block) => ({ ...block, id: uid() }) as WorkoutBlock)
}

export function workoutToAiContext(workout: Workout): {
  name: string
  description: string
  blocks: GeneratedBlockPayload[]
} {
  return {
    name: workout.name,
    description: workout.description,
    blocks: workout.blocks.map(stripBlockId),
  }
}

function stripBlockId(block: WorkoutBlock): GeneratedBlockPayload {
  if (block.type === 'steady') {
    return { type: 'steady', durationSec: block.durationSec, powerPct: block.powerPct }
  }
  if (block.type === 'intervals') {
    return {
      type: 'intervals',
      repeat: block.repeat,
      onDurationSec: block.onDurationSec,
      offDurationSec: block.offDurationSec,
      onPct: block.onPct,
      offPct: block.offPct,
    }
  }
  if (block.type === 'freeride') {
    return { type: 'freeride', durationSec: block.durationSec }
  }
  return {
    type: block.type,
    durationSec: block.durationSec,
    startPct: block.startPct,
    endPct: block.endPct,
  }
}
