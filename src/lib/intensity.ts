import type { Workout, WorkoutBlock } from '../types'
import { blockDuration } from './workout'

export const INTENSITY_LEVELS = [
  { id: 'easy', label: 'Easy', short: 'Easy' },
  { id: 'moderate', label: 'Moderate', short: 'Mod' },
  { id: 'challenging', label: 'Challenging', short: 'Chall' },
  { id: 'hard', label: 'Hard', short: 'Hard' },
  { id: 'brutal', label: 'Brutal', short: 'Brutal' },
] as const

export type IntensityLevelId = (typeof INTENSITY_LEVELS)[number]['id']

export type WorkoutIntensity = {
  level: IntensityLevelId
  label: string
  /** 0–4 continuous score from Decisions (or heuristic). */
  score: number
  /** 0–1 confidence when from Decisions; 0.4 for heuristic. */
  confidence: number
  source: 'decisions' | 'heuristic'
  fingerprint: string
}

export function intensityFingerprint(workout: Pick<Workout, 'ftp' | 'blocks'>): string {
  return JSON.stringify({
    ftp: workout.ftp,
    blocks: workout.blocks.map(stripForFingerprint),
  })
}

function stripForFingerprint(block: WorkoutBlock): unknown {
  if (block.type === 'steady') {
    return { type: block.type, durationSec: block.durationSec, powerPct: block.powerPct }
  }
  if (block.type === 'intervals') {
    return {
      type: block.type,
      repeat: block.repeat,
      onDurationSec: block.onDurationSec,
      offDurationSec: block.offDurationSec,
      onPct: block.onPct,
      offPct: block.offPct,
    }
  }
  if (block.type === 'freeride') {
    return { type: block.type, durationSec: block.durationSec }
  }
  return {
    type: block.type,
    durationSec: block.durationSec,
    startPct: block.startPct,
    endPct: block.endPct,
  }
}

export function levelFromScore(score: number): (typeof INTENSITY_LEVELS)[number] {
  const clamped = Math.max(0, Math.min(INTENSITY_LEVELS.length - 1, score))
  const index = Math.round(clamped)
  return INTENSITY_LEVELS[index]!
}

/** Local fallback when Decisions is unavailable. */
export function heuristicIntensity(workout: Pick<Workout, 'ftp' | 'blocks'>): WorkoutIntensity {
  const totalSec = workout.blocks.reduce((sum, b) => sum + blockDuration(b), 0)
  if (totalSec <= 0 || workout.blocks.length === 0) {
    return {
      level: 'easy',
      label: 'Easy',
      score: 0,
      confidence: 0.4,
      source: 'heuristic',
      fingerprint: intensityFingerprint(workout),
    }
  }

  let load = 0
  let hardSec = 0
  for (const block of workout.blocks) {
    const dur = blockDuration(block)
    if (block.type === 'steady') {
      load += (block.powerPct / 100) ** 2 * dur
      if (block.powerPct >= 95) hardSec += dur
    } else if (block.type === 'intervals') {
      const cycle = block.onDurationSec + block.offDurationSec
      load +=
        block.repeat *
        (((block.onPct / 100) ** 2 * block.onDurationSec +
          (block.offPct / 100) ** 2 * block.offDurationSec) /
          Math.max(cycle, 1)) *
        cycle
      if (block.onPct >= 95) hardSec += block.repeat * block.onDurationSec
    } else if (block.type === 'freeride') {
      load += 0.45 ** 2 * dur
    } else {
      const avg = (block.startPct + block.endPct) / 2
      load += (avg / 100) ** 2 * dur
      if (avg >= 95) hardSec += dur * 0.5
    }
  }

  const ifActor = Math.sqrt(load / totalSec)
  const hardShare = hardSec / totalSec
  const hours = totalSec / 3600
  // Blend intensity factor, hard-time share, and duration into 0–4.
  const raw = ifActor * 2.8 + hardShare * 2.2 + Math.min(hours / 1.5, 1) * 0.6
  const score = Math.max(0, Math.min(4, raw - 0.8))
  const level = levelFromScore(score)

  return {
    level: level.id,
    label: level.label,
    score,
    confidence: 0.4,
    source: 'heuristic',
    fingerprint: intensityFingerprint(workout),
  }
}
