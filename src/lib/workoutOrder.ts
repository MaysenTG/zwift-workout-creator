import type { WorkoutSummary } from '../types'

const ORDER_KEY = 'wattline:workout-order'

export function readWorkoutOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeWorkoutOrder(ids: string[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids))
}

/** Stable sidebar order: known ids first, then any new workouts by most recently updated. */
export function orderSummaries(
  summaries: WorkoutSummary[],
  order: string[],
): WorkoutSummary[] {
  const byId = new Map(summaries.map((s) => [s.id, s]))
  const ordered: WorkoutSummary[] = []
  for (const id of order) {
    const item = byId.get(id)
    if (item) {
      ordered.push(item)
      byId.delete(id)
    }
  }
  const rest = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  return [...ordered, ...rest]
}

export function bumpWorkoutInOrder(id: string): string[] {
  const next = [id, ...readWorkoutOrder().filter((existing) => existing !== id)]
  writeWorkoutOrder(next)
  return next
}

export function removeWorkoutFromOrder(id: string): string[] {
  const next = readWorkoutOrder().filter((existing) => existing !== id)
  writeWorkoutOrder(next)
  return next
}

export function initialOrderFromSummaries(summaries: WorkoutSummary[]): string[] {
  return [...summaries].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => s.id)
}
