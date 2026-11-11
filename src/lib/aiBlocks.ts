import type { GeneratedBlockPayload, GeneratedTextAlertPayload } from './api'
import { uid } from './ids'
import type { TextAlert, Workout, WorkoutBlock } from '../types'
import { blockTexts } from './workout'

function textsFromAi(raw: GeneratedTextAlertPayload[] | undefined): TextAlert[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw
    .filter((t) => typeof t?.message === 'string' && t.message.trim())
    .map((t) => {
      const alert: TextAlert = {
        id: uid(),
        timeOffsetSec: Math.max(0, Math.round(Number(t.timeOffsetSec) || 0)),
        message: t.message.trim().slice(0, 160),
      }
      if (t.durationSec != null && Number.isFinite(t.durationSec) && t.durationSec >= 1) {
        alert.durationSec = Math.min(300, Math.round(t.durationSec))
      }
      return alert
    })
}

function textsToAi(block: WorkoutBlock): GeneratedTextAlertPayload[] {
  return blockTexts(block).map((t) => ({
    timeOffsetSec: t.timeOffsetSec,
    message: t.message,
    ...(t.durationSec != null ? { durationSec: t.durationSec } : {}),
  }))
}

export function blocksFromAiPayload(payload: GeneratedBlockPayload[]): WorkoutBlock[] {
  return payload.map((block) => {
    const texts = textsFromAi(block.texts)
    const textPatch = texts.length > 0 ? { texts } : { texts: [] as TextAlert[] }

    if (block.type === 'intervals') {
      return {
        type: 'intervals',
        id: uid(),
        repeat: block.repeat,
        onDurationSec: block.onDurationSec,
        offDurationSec: block.offDurationSec,
        onPct: block.onPct,
        offPct: block.offPct,
        ...textPatch,
        ...(block.cadence != null ? { cadence: block.cadence } : {}),
        ...(block.cadenceResting != null ? { cadenceResting: block.cadenceResting } : {}),
      }
    }
    if (block.type === 'steady') {
      return {
        type: 'steady',
        id: uid(),
        durationSec: block.durationSec,
        powerPct: block.powerPct,
        ...textPatch,
        ...(block.cadence != null ? { cadence: block.cadence } : {}),
      }
    }
    if (block.type === 'freeride') {
      return {
        type: 'freeride',
        id: uid(),
        durationSec: block.durationSec,
        ...textPatch,
        ...(block.cadence != null ? { cadence: block.cadence } : {}),
      }
    }
    return {
      type: block.type,
      id: uid(),
      durationSec: block.durationSec,
      startPct: block.startPct,
      endPct: block.endPct,
      ...textPatch,
      ...(block.cadence != null ? { cadence: block.cadence } : {}),
    }
  })
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
  const texts = textsToAi(block)
  const textPatch = texts.length > 0 ? { texts } : { texts: [] as GeneratedTextAlertPayload[] }

  if (block.type === 'steady') {
    return {
      type: 'steady',
      durationSec: block.durationSec,
      powerPct: block.powerPct,
      ...textPatch,
      ...(block.cadence != null ? { cadence: block.cadence } : {}),
    }
  }
  if (block.type === 'intervals') {
    return {
      type: 'intervals',
      repeat: block.repeat,
      onDurationSec: block.onDurationSec,
      offDurationSec: block.offDurationSec,
      onPct: block.onPct,
      offPct: block.offPct,
      ...textPatch,
      ...(block.cadence != null ? { cadence: block.cadence } : {}),
      ...(block.cadenceResting != null ? { cadenceResting: block.cadenceResting } : {}),
    }
  }
  if (block.type === 'freeride') {
    return {
      type: 'freeride',
      durationSec: block.durationSec,
      ...textPatch,
      ...(block.cadence != null ? { cadence: block.cadence } : {}),
    }
  }
  return {
    type: block.type,
    durationSec: block.durationSec,
    startPct: block.startPct,
    endPct: block.endPct,
    ...textPatch,
    ...(block.cadence != null ? { cadence: block.cadence } : {}),
  }
}
