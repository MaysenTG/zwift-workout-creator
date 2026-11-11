import { apiUrl } from './api'
import { getOrCreateLibraryKey, normalizeLibraryKey } from './libraryKey'
import type { Workout } from '../types'

export type CloudLibrarySnapshot = {
  version: 1
  updatedAt: number
  order: string[]
  workouts: Workout[]
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

function libraryHeaders(key: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-library-key': key,
  }
}

export async function fetchCloudLibrary(
  key = getOrCreateLibraryKey(),
): Promise<CloudLibrarySnapshot | null> {
  try {
    const res = await fetch(apiUrl('/api/library'), {
      method: 'GET',
      headers: libraryHeaders(key),
    })
    if (res.status === 503) return null
    if (!res.ok) throw new Error(`Cloud fetch failed (${res.status})`)
    const data = (await res.json()) as CloudLibrarySnapshot
    return {
      version: 1,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      order: Array.isArray(data.order) ? data.order.filter((id) => typeof id === 'string') : [],
      workouts: Array.isArray(data.workouts) ? (data.workouts as Workout[]) : [],
    }
  } catch {
    return null
  }
}

export async function pushCloudLibrary(
  snapshot: Omit<CloudLibrarySnapshot, 'version'> & { version?: 1 },
  key = getOrCreateLibraryKey(),
): Promise<boolean> {
  const normalized = normalizeLibraryKey(key)
  if (!normalized) return false
  try {
    const body: CloudLibrarySnapshot = {
      version: 1,
      updatedAt: snapshot.updatedAt || Date.now(),
      order: snapshot.order,
      workouts: snapshot.workouts,
    }
    const res = await fetch(apiUrl('/api/library'), {
      method: 'PUT',
      headers: libraryHeaders(normalized),
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}
