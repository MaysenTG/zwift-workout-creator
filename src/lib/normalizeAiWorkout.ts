import type { GenerateWorkoutResponse, GeneratedBlockPayload } from './api'

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** Coerce worker/API JSON into the shape the UI expects (handles older workers & model quirks). */
export function normalizeGenerateWorkoutResponse(raw: unknown): GenerateWorkoutResponse {
  if (!raw || typeof raw !== 'object') {
    return { name: 'Generated ride', description: '', blocks: [] }
  }

  let root = raw as Record<string, unknown>
  if (root.workout && typeof root.workout === 'object' && !Array.isArray(root.workout)) {
    root = { ...root, ...(root.workout as Record<string, unknown>) }
  }

  const name = firstString(root, ['name', 'title', 'workoutName']) || 'Generated ride'
  const description = firstString(root, ['description', 'desc', 'summary'])

  let blocks = root.blocks ?? root.segments ?? root.profile
  if (!Array.isArray(blocks)) blocks = []

  const ftpRaw = root.ftp
  const ftp =
    typeof ftpRaw === 'number' && Number.isFinite(ftpRaw) ? Math.round(ftpRaw) : undefined

  return {
    name,
    description,
    blocks: blocks as GeneratedBlockPayload[],
    ...(ftp !== undefined && ftp >= 50 && ftp <= 600 ? { ftp } : {}),
  }
}
