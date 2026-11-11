import { apiUrl } from './api'
import { workoutToAiContext } from './aiBlocks'
import { getOrFetchIntensity } from './intensityCache'
import {
  heuristicIntensity,
  intensityFingerprint,
  levelFromScore,
  type IntensityLevelId,
  type WorkoutIntensity,
} from './intensity'
import type { Workout } from '../types'

const INTENSITY_IDS = new Set<IntensityLevelId>([
  'easy',
  'moderate',
  'challenging',
  'hard',
  'brutal',
])

async function fetchRemoteIntensity(workout: Workout): Promise<WorkoutIntensity> {
  const fingerprint = intensityFingerprint(workout)
  try {
    const res = await fetch(apiUrl('/api/score-intensity'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: workout.name,
        ftp: workout.ftp,
        blocks: workoutToAiContext(workout).blocks,
      }),
    })
    if (!res.ok) throw new Error(`Intensity score failed (${res.status})`)
    const data = (await res.json()) as {
      level?: string
      label?: string
      score?: number
      confidence?: number
    }
    if (typeof data.score !== 'number') throw new Error('Missing intensity score')
    const levelMeta = levelFromScore(data.score)
    const level = (data.level as IntensityLevelId) || levelMeta.id
    return {
      level: INTENSITY_IDS.has(level) ? level : levelMeta.id,
      label: data.label?.trim() || levelMeta.label,
      score: Math.max(0, Math.min(4, data.score)),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.7,
      source: 'decisions',
      fingerprint,
    }
  } catch {
    // Cache heuristic too so a failed API doesn't re-hit on every click.
    return { ...heuristicIntensity(workout), fingerprint }
  }
}

export async function scoreWorkoutIntensity(workout: Workout): Promise<WorkoutIntensity> {
  const fingerprint = intensityFingerprint(workout)
  return getOrFetchIntensity(fingerprint, () => fetchRemoteIntensity(workout))
}
