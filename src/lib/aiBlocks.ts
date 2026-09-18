import type { GeneratedBlockPayload } from './api'
import { uid } from './ids'
import type { Workout, WorkoutBlock } from '../types'

export function blocksFromAiPayload(payload: GeneratedBlockPayload[]): WorkoutBlock[] {
  return payload.map((block) => ({ ...block, id: uid() }) as WorkoutBlock)
}

export function workoutToAiContext(workout: Workout): {
  name: string
  description: string
  ftp: number
  blocks: GeneratedBlockPayload[]
} {
  return {
    name: workout.name,
    description: workout.description,
    ftp: workout.ftp,
    blocks: workout.blocks.map(stripBlockId),
  }
}

export function isFreshAiWorkout(workout: Workout): boolean {
  return (
    workout.blocks.length === 0 &&
    (!workout.name.trim() || workout.name === 'Untitled ride') &&
    !workout.description.trim()
  )
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
