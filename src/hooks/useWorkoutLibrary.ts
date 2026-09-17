import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workout, WorkoutSummary } from '../types'
import {
  deleteWorkout,
  getWorkout,
  listWorkouts,
  saveWorkout,
  setAllWorkoutsFtp,
} from '../lib/db'
import { createWorkout } from '../lib/workout'
import type { AppSettings } from '../lib/settings'

const LAST_ID_KEY = 'wattline:last-workout-id'
const HISTORY_LIMIT = 50

function cloneWorkout(workout: Workout): Workout {
  return structuredClone(workout)
}

function sameBlockOrder(a: Workout, b: Workout): boolean {
  if (a.blocks.length !== b.blocks.length) return false
  return a.blocks.every((block, index) => block.id === b.blocks[index]?.id)
}

export function useWorkoutLibrary(settings: AppSettings) {
  const [summaries, setSummaries] = useState<WorkoutSummary[]>([])
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [ready, setReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pastRef = useRef<Workout[]>([])
  const futureRef = useRef<Workout[]>([])
  const lastMetaAtRef = useRef(0)

  const refresh = useCallback(async () => {
    setSummaries(await listWorkouts())
  }, [])

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const resetHistory = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    lastMetaAtRef.current = 0
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const remember = useCallback(
    (previous: Workout, next: Workout) => {
      const structural = !sameBlockOrder(previous, next)
      const now = Date.now()
      if (!structural && now - lastMetaAtRef.current < 500 && pastRef.current.length > 0) {
        lastMetaAtRef.current = now
        futureRef.current = []
        syncHistoryFlags()
        return
      }
      pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), cloneWorkout(previous)]
      futureRef.current = []
      lastMetaAtRef.current = now
      syncHistoryFlags()
    },
    [syncHistoryFlags],
  )

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const existing = await listWorkouts()
      if (cancelled) return

      if (existing.length === 0) {
        const created = createWorkout({
          ftp: settings.ftp,
          powerUnit: settings.powerUnit,
        })
        await saveWorkout(created)
        localStorage.setItem(LAST_ID_KEY, created.id)
        if (!cancelled) {
          setWorkout(created)
          setSummaries(await listWorkouts())
        }
        setReady(true)
        return
      }

      const lastId = localStorage.getItem(LAST_ID_KEY)
      const selected = (lastId && (await getWorkout(lastId))) || (await getWorkout(existing[0].id))
      if (cancelled) return
      setSummaries(existing)
      if (selected) {
        setWorkout(selected)
        localStorage.setItem(LAST_ID_KEY, selected.id)
      }
      setReady(true)
    }

    void boot()
    return () => {
      cancelled = true
    }
    // Boot once; new workouts after that use current settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!workout) return
    const handle = window.setTimeout(() => {
      void saveWorkout(workout).then(refresh)
    }, 350)
    return () => window.clearTimeout(handle)
  }, [workout, refresh])

  const openWorkout = useCallback(async (id: string) => {
    const next = await getWorkout(id)
    if (next) {
      resetHistory()
      setWorkout(next)
      localStorage.setItem(LAST_ID_KEY, next.id)
    }
  }, [resetHistory])

  const newWorkout = useCallback(async () => {
    const created = createWorkout({
      ftp: settings.ftp,
      powerUnit: settings.powerUnit,
    })
    await saveWorkout(created)
    resetHistory()
    setWorkout(created)
    localStorage.setItem(LAST_ID_KEY, created.id)
    await refresh()
  }, [refresh, resetHistory, settings.ftp, settings.powerUnit])

  const importWorkout = useCallback(
    async (imported: Workout) => {
      const withDefaults: Workout = {
        ...imported,
        ftp: imported.ftp || settings.ftp,
      }
      await saveWorkout(withDefaults)
      resetHistory()
      setWorkout(withDefaults)
      localStorage.setItem(LAST_ID_KEY, withDefaults.id)
      await refresh()
    },
    [refresh, resetHistory, settings.ftp],
  )

  const removeWorkout = useCallback(
    async (id: string) => {
      await deleteWorkout(id)
      const remaining = await listWorkouts()
      setSummaries(remaining)
      if (workout?.id === id) {
        if (remaining[0]) {
          await openWorkout(remaining[0].id)
        } else {
          await newWorkout()
        }
      }
    },
    [newWorkout, openWorkout, workout?.id],
  )

  const updateWorkout = useCallback(
    (updater: (current: Workout) => Workout) => {
      setWorkout((current) => {
        if (!current) return current
        const next = updater(current)
        if (next === current) return current
        remember(current, next)
        return next
      })
    },
    [remember],
  )

  const undo = useCallback(() => {
    setWorkout((current) => {
      const previous = pastRef.current[pastRef.current.length - 1]
      if (!current || !previous) return current
      pastRef.current = pastRef.current.slice(0, -1)
      futureRef.current = [...futureRef.current, cloneWorkout(current)]
      syncHistoryFlags()
      return cloneWorkout(previous)
    })
  }, [syncHistoryFlags])

  const redo = useCallback(() => {
    setWorkout((current) => {
      const next = futureRef.current[futureRef.current.length - 1]
      if (!current || !next) return current
      futureRef.current = futureRef.current.slice(0, -1)
      pastRef.current = [...pastRef.current, cloneWorkout(current)]
      syncHistoryFlags()
      return cloneWorkout(next)
    })
  }, [syncHistoryFlags])

  const applyFtpToCurrent = useCallback(() => {
    updateWorkout((current) => ({ ...current, ftp: settings.ftp }))
  }, [settings.ftp, updateWorkout])

  const applyFtpToAll = useCallback(async () => {
    await setAllWorkoutsFtp(settings.ftp)
    updateWorkout((current) => ({ ...current, ftp: settings.ftp }))
    await refresh()
  }, [refresh, settings.ftp, updateWorkout])

  return {
    ready,
    summaries,
    workout,
    canUndo,
    canRedo,
    updateWorkout,
    openWorkout,
    newWorkout,
    importWorkout,
    removeWorkout,
    undo,
    redo,
    applyFtpToCurrent,
    applyFtpToAll,
  }
}
