import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Workout, WorkoutSummary } from '../types'
import { workoutDuration } from './workout'
import { readLibraryKey } from './libraryKey'

const DB_VERSION = 1
const STORE = 'workouts'

interface WattlineDB extends DBSchema {
  workouts: {
    key: string
    value: Workout
    indexes: { 'by-updated': number }
  }
}

const dbPromises = new Map<string, Promise<IDBPDatabase<WattlineDB>>>()

function activeKey(): string {
  return readLibraryKey() ?? 'local'
}

function getDb() {
  const key = activeKey()
  let promise = dbPromises.get(key)
  if (!promise) {
    promise = openDB<WattlineDB>(`wattline:${key}`, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
    dbPromises.set(key, promise)
  }
  return promise
}

export async function listWorkouts(): Promise<WorkoutSummary[]> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all.map((workout) => ({
    id: workout.id,
    name: workout.name,
    updatedAt: workout.updatedAt,
    durationSec: workoutDuration(workout.blocks),
    ftp: workout.ftp,
  }))
}

export async function getWorkout(id: string): Promise<Workout | undefined> {
  const db = await getDb()
  return db.get(STORE, id)
}

export async function saveWorkout(workout: Workout): Promise<void> {
  const db = await getDb()
  await db.put(STORE, { ...workout, updatedAt: Date.now() })
}

export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, id)
}

export async function setAllWorkoutsFtp(ftp: number): Promise<void> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  const now = Date.now()
  for (const workout of all) {
    if (workout.ftp === ftp) continue
    await db.put(STORE, { ...workout, ftp, updatedAt: now })
  }
}

export async function getAllWorkouts(): Promise<Workout[]> {
  const db = await getDb()
  return db.getAll(STORE)
}

/** Replace the entire local library (used for cloud restore / pull). */
export async function replaceAllWorkouts(workouts: Workout[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  await tx.store.clear()
  for (const workout of workouts) {
    await tx.store.put(workout)
  }
  await tx.done
}
