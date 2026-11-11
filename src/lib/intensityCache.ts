import type { WorkoutIntensity } from './intensity'

const STORAGE_KEY = 'zwift-intensity-cache-v1'
const MAX_ENTRIES = 120

const memory = new Map<string, WorkoutIntensity>()
const inflight = new Map<string, Promise<WorkoutIntensity>>()

let storageHydrated = false

function hydrateFromStorage() {
  if (storageHydrated || typeof localStorage === 'undefined') return
  storageHydrated = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, WorkoutIntensity>
    for (const [fp, value] of Object.entries(parsed)) {
      if (value && typeof value.score === 'number' && value.fingerprint) {
        memory.set(fp, value)
      }
    }
  } catch {
    // ignore corrupt cache
  }
}

function persistToStorage() {
  if (typeof localStorage === 'undefined') return
  try {
    const entries = [...memory.entries()].slice(-MAX_ENTRIES)
    memory.clear()
    for (const [fp, value] of entries) memory.set(fp, value)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // quota / private mode
  }
}

export function getCachedIntensity(fingerprint: string): WorkoutIntensity | null {
  hydrateFromStorage()
  return memory.get(fingerprint) ?? null
}

export function setCachedIntensity(fingerprint: string, value: WorkoutIntensity): void {
  hydrateFromStorage()
  memory.set(fingerprint, value)
  persistToStorage()
}

/** Deduplicate concurrent score requests for the same fingerprint. */
export function getOrFetchIntensity(
  fingerprint: string,
  fetchFn: () => Promise<WorkoutIntensity>,
): Promise<WorkoutIntensity> {
  const cached = getCachedIntensity(fingerprint)
  if (cached) return Promise.resolve(cached)

  const existing = inflight.get(fingerprint)
  if (existing) return existing

  const promise = fetchFn()
    .then((result) => {
      setCachedIntensity(fingerprint, result)
      return result
    })
    .finally(() => {
      inflight.delete(fingerprint)
    })

  inflight.set(fingerprint, promise)
  return promise
}
