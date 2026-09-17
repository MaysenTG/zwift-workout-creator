import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Workout, WorkoutSummary } from '../types'
import { workoutDuration } from './workout'

const DB_NAME = 'wattline'
const DB_VERSION = 1
const STORE = 'workouts'

interface WattlineDB extends DBSchema {
  workouts: {
    key: string
    value: Workout
    indexes: { 'by-updated': number }
  }
}

let dbPromise: Promise<IDBPDatabase<WattlineDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<WattlineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
  }
  return dbPromise
}

export async function listWorkouts(): Promise<WorkoutSummary[]> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all
    .map((workout) => ({
      id: workout.id,
      name: workout.name,
      updatedAt: workout.updatedAt,
      durationSec: workoutDuration(workout.blocks),
      ftp: workout.ftp,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
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
