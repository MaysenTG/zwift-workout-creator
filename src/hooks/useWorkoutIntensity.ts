import { useEffect, useMemo, useRef, useState } from 'react'
import { getCachedIntensity } from '../lib/intensityCache'
import { intensityFingerprint, type WorkoutIntensity } from '../lib/intensity'
import { scoreWorkoutIntensity } from '../lib/scoreIntensity'
import type { Workout } from '../types'

const OPEN_SCORE_DEBOUNCE_MS = 350
const EDIT_SCORE_DEBOUNCE_MS = 2200

export type WorkoutIntensityState = {
  intensity: WorkoutIntensity | null
  loading: boolean
}

export function useWorkoutIntensity(workout: Workout | null): WorkoutIntensityState {
  const fingerprint = useMemo(
    () => (workout && workout.blocks.length > 0 ? intensityFingerprint(workout) : ''),
    [workout],
  )
  const workoutId = workout?.id ?? ''
  const [intensity, setIntensity] = useState<WorkoutIntensity | null>(null)
  const [loading, setLoading] = useState(false)
  const lastWorkoutIdRef = useRef(workoutId)

  useEffect(() => {
    if (!workout || !fingerprint) {
      setIntensity(null)
      setLoading(false)
      lastWorkoutIdRef.current = workoutId
      return
    }

    const cached = getCachedIntensity(fingerprint)
    if (cached) {
      setIntensity(cached)
      setLoading(false)
      lastWorkoutIdRef.current = workoutId
      return
    }

    const switchedWorkout = lastWorkoutIdRef.current !== workoutId
    lastWorkoutIdRef.current = workoutId

    // Opening another workout: show "Rating…" — never flash Moderate first.
    // Editing the same workout: keep the prior label until the new score arrives.
    if (switchedWorkout) {
      setIntensity(null)
    }
    setLoading(true)

    const snapshot = workout
    let cancelled = false
    const timer = window.setTimeout(
      () => {
        void scoreWorkoutIntensity(snapshot).then((remote) => {
          if (cancelled) return
          setIntensity({ ...remote, fingerprint })
          setLoading(false)
        })
      },
      switchedWorkout ? OPEN_SCORE_DEBOUNCE_MS : EDIT_SCORE_DEBOUNCE_MS,
    )

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, workoutId])

  return { intensity, loading }
}
