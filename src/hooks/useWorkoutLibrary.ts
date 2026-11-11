import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workout, WorkoutSummary } from '../types'
import {
  deleteWorkout,
  getAllWorkouts,
  getWorkout,
  listWorkouts,
  replaceAllWorkouts,
  saveWorkout,
  setAllWorkoutsFtp,
} from '../lib/db'
import { createWorkout, workoutDuration } from '../lib/workout'
import {
  ensureWorkoutInOrder,
  initialOrderFromSummaries,
  orderSummaries,
  prependWorkoutInOrder,
  readWorkoutOrder,
  removeWorkoutFromOrder,
  writeWorkoutOrder,
} from '../lib/workoutOrder'
import type { AppSettings } from '../lib/settings'
import {
  fetchCloudLibrary,
  pushCloudLibrary,
  type CloudSyncStatus,
} from '../lib/cloudLibrary'
import {
  formatLibraryKey,
  libraryPath,
  libraryUrl,
  normalizeLibraryKeyInput,
  readLibraryKey,
  resolveActiveLibraryKey,
  writeLibraryKey,
} from '../lib/libraryKey'

const HISTORY_LIMIT = 50

function lastIdKey(): string {
  return `wattline:${readLibraryKey() ?? 'local'}:last-workout-id`
}

function cloneWorkout(workout: Workout): Workout {
  return structuredClone(workout)
}

function sameBlockOrder(a: Workout, b: Workout): boolean {
  if (a.blocks.length !== b.blocks.length) return false
  return a.blocks.every((block, index) => block.id === b.blocks[index]?.id)
}

function maxUpdatedAt(workouts: { updatedAt: number }[]): number {
  return workouts.reduce((max, w) => Math.max(max, w.updatedAt || 0), 0)
}

export function useWorkoutLibrary(settings: AppSettings) {
  const [summaries, setSummaries] = useState<WorkoutSummary[]>([])
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [ready, setReady] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>('idle')
  const [libraryKeyDisplay, setLibraryKeyDisplay] = useState('')
  const [libraryHref, setLibraryHref] = useState('')

  const pastRef = useRef<Workout[]>([])
  const futureRef = useRef<Workout[]>([])
  const lastMetaAtRef = useRef(0)
  const cloudPushTimerRef = useRef<number | null>(null)
  const suppressCloudPushRef = useRef(false)

  const refresh = useCallback(async () => {
    const fetched = await listWorkouts()
    setSummaries((prev) => {
      const order = prev.length > 0 ? prev.map((s) => s.id) : readWorkoutOrder()
      return orderSummaries(fetched, order)
    })
  }, [])

  const pushLibraryToCloud = useCallback(async () => {
    if (suppressCloudPushRef.current) return
    setCloudStatus('syncing')
    const workouts = await getAllWorkouts()
    const order = readWorkoutOrder()
    const ok = await pushCloudLibrary({
      updatedAt: Date.now(),
      order: order.length > 0 ? order : workouts.map((w) => w.id),
      workouts,
    })
    setCloudStatus(ok ? 'synced' : 'offline')
  }, [])

  const scheduleCloudPush = useCallback(() => {
    if (cloudPushTimerRef.current) window.clearTimeout(cloudPushTimerRef.current)
    cloudPushTimerRef.current = window.setTimeout(() => {
      void pushLibraryToCloud()
    }, 900)
  }, [pushLibraryToCloud])

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

  const applyLocalLibrary = useCallback(
    async (workouts: Workout[], order: string[], preferredId?: string | null) => {
      suppressCloudPushRef.current = true
      await replaceAllWorkouts(workouts)
      const nextOrder =
        order.length > 0 ? order : initialOrderFromSummaries(
          workouts.map((w) => ({
            id: w.id,
            name: w.name,
            updatedAt: w.updatedAt,
            durationSec: workoutDuration(w.blocks),
            ftp: w.ftp,
          })),
        )
      writeWorkoutOrder(nextOrder)
      const ordered = orderSummaries(
        workouts.map((w) => ({
          id: w.id,
          name: w.name,
          updatedAt: w.updatedAt,
          durationSec: workoutDuration(w.blocks),
          ftp: w.ftp,
        })),
        nextOrder,
      )
      setSummaries(ordered)
      const pickId = preferredId && workouts.some((w) => w.id === preferredId)
        ? preferredId
        : ordered[0]?.id
      const selected = pickId ? workouts.find((w) => w.id === pickId) : undefined
      resetHistory()
      if (selected) {
        setWorkout(selected)
        localStorage.setItem(lastIdKey(), selected.id)
      } else if (workouts[0]) {
        setWorkout(workouts[0])
        localStorage.setItem(lastIdKey(), workouts[0].id)
      }
      suppressCloudPushRef.current = false
    },
    [resetHistory],
  )

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const key = resolveActiveLibraryKey()
      setLibraryKeyDisplay(formatLibraryKey(key))
      setLibraryHref(libraryUrl(key))

      let existing = await listWorkouts()
      if (cancelled) return

      if (existing.length === 0) {
        const created = createWorkout({
          ftp: settings.ftp,
          powerUnit: settings.powerUnit,
        })
        await saveWorkout(created)
        localStorage.setItem(lastIdKey(), created.id)
        writeWorkoutOrder([created.id])
        existing = await listWorkouts()
        if (!cancelled) {
          setWorkout(created)
          setSummaries(existing)
        }
      } else {
        let order = readWorkoutOrder()
        if (order.length === 0) {
          order = initialOrderFromSummaries(existing)
          writeWorkoutOrder(order)
        }
        const lastId = localStorage.getItem(lastIdKey())
        const selected =
          (lastId && (await getWorkout(lastId))) ||
          (await getWorkout(orderSummaries(existing, order)[0]?.id ?? existing[0].id))
        if (cancelled) return
        setSummaries(orderSummaries(existing, order))
        if (selected) {
          setWorkout(selected)
          localStorage.setItem(lastIdKey(), selected.id)
        }
      }

      if (!cancelled) setReady(true)

      // Pull cloud after local boot so UI isn't blocked.
      setCloudStatus('syncing')
      const cloud = await fetchCloudLibrary(key)
      if (cancelled) return
      if (!cloud) {
        setCloudStatus('offline')
        void pushLibraryToCloud()
        return
      }

      const localWorkouts = await getAllWorkouts()
      const localStamp = maxUpdatedAt(localWorkouts)
      const cloudStamp = cloud.updatedAt || maxUpdatedAt(cloud.workouts)

      if (cloud.workouts.length > 0 && cloudStamp >= localStamp) {
        await applyLocalLibrary(cloud.workouts, cloud.order, localStorage.getItem(lastIdKey()))
        setCloudStatus('synced')
      } else {
        const ok = await pushCloudLibrary(
          {
            updatedAt: Math.max(localStamp, Date.now()),
            order: readWorkoutOrder(),
            workouts: localWorkouts,
          },
          key,
        )
        setCloudStatus(ok ? 'synced' : 'offline')
      }
    }

    void boot()
    return () => {
      cancelled = true
      if (cloudPushTimerRef.current) window.clearTimeout(cloudPushTimerRef.current)
    }
    // Boot once; new workouts after that use current settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!workout || suppressCloudPushRef.current) return
    setSummaries((prev) => {
      const index = prev.findIndex((item) => item.id === workout.id)
      const nextSummary: WorkoutSummary = {
        id: workout.id,
        name: workout.name,
        updatedAt: workout.updatedAt,
        durationSec: workoutDuration(workout.blocks),
        ftp: workout.ftp,
      }
      if (index < 0) return [...prev, nextSummary]
      const next = [...prev]
      next[index] = nextSummary
      return next
    })
    const handle = window.setTimeout(() => {
      void saveWorkout(workout).then(() => {
        void refresh()
        scheduleCloudPush()
      })
    }, 350)
    return () => window.clearTimeout(handle)
  }, [workout, refresh, scheduleCloudPush])

  const openWorkout = useCallback(async (id: string) => {
    const next = await getWorkout(id)
    if (next) {
      resetHistory()
      setWorkout(next)
      localStorage.setItem(lastIdKey(), next.id)
      const order = ensureWorkoutInOrder(id)
      setSummaries((prev) => orderSummaries(prev, order))
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
    localStorage.setItem(lastIdKey(), created.id)
    const order = prependWorkoutInOrder(created.id)
    const fetched = await listWorkouts()
    setSummaries(orderSummaries(fetched, order))
    scheduleCloudPush()
  }, [resetHistory, scheduleCloudPush, settings.ftp, settings.powerUnit])

  const importWorkout = useCallback(
    async (imported: Workout) => {
      const withDefaults: Workout = {
        ...imported,
        ftp: imported.ftp || settings.ftp,
      }
      await saveWorkout(withDefaults)
      resetHistory()
      setWorkout(withDefaults)
      localStorage.setItem(lastIdKey(), withDefaults.id)
      const order = prependWorkoutInOrder(withDefaults.id)
      const fetched = await listWorkouts()
      setSummaries(orderSummaries(fetched, order))
      scheduleCloudPush()
    },
    [resetHistory, scheduleCloudPush, settings.ftp],
  )

  const removeWorkout = useCallback(
    async (id: string) => {
      await deleteWorkout(id)
      const order = removeWorkoutFromOrder(id)
      const remaining = orderSummaries(await listWorkouts(), order)
      setSummaries(remaining)
      scheduleCloudPush()
      if (workout?.id === id) {
        if (remaining[0]) {
          await openWorkout(remaining[0].id)
        } else {
          await newWorkout()
        }
      }
    },
    [newWorkout, openWorkout, scheduleCloudPush, workout?.id],
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
    scheduleCloudPush()
  }, [refresh, scheduleCloudPush, settings.ftp, updateWorkout])

  const openLibraryKey = useCallback(async (rawCode: string) => {
    const key = normalizeLibraryKeyInput(rawCode)
    if (!key) throw new Error('That library key does not look valid.')
    writeLibraryKey(key)
    window.location.assign(libraryPath(key))
  }, [])

  return {
    ready,
    summaries,
    workout,
    canUndo,
    canRedo,
    cloudStatus,
    libraryKeyDisplay,
    libraryHref,
    updateWorkout,
    openWorkout,
    newWorkout,
    importWorkout,
    removeWorkout,
    undo,
    redo,
    applyFtpToCurrent,
    applyFtpToAll,
    openLibraryKey,
    syncNow: pushLibraryToCloud,
  }
}
