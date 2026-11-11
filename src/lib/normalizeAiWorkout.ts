import type {
  ClarifyingQuestion,
  GenerateWorkoutResponse,
  GeneratedBlockPayload,
} from './api'

function firstString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function normalizeClarifyingQuestions(raw: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: ClarifyingQuestion[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const prompt = item.trim()
      if (prompt) out.push({ prompt, options: [] })
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const obj = item as Record<string, unknown>
    const prompt = firstString(obj, ['prompt', 'question', 'text', 'q'])
    if (!prompt) continue
    const options = Array.isArray(obj.options)
      ? obj.options
          .filter((o): o is string => typeof o === 'string')
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, 6)
      : []
    out.push({ prompt, options })
  }
  return out.slice(0, 4)
}

/** Coerce worker/API JSON into the shape the UI expects (handles older workers & model quirks). */
export function normalizeGenerateWorkoutResponse(raw: unknown): GenerateWorkoutResponse {
  if (!raw || typeof raw !== 'object') {
    return { status: 'workout', name: 'Generated ride', description: '', blocks: [], questions: [] }
  }

  let root = raw as Record<string, unknown>
  if (root.workout && typeof root.workout === 'object' && !Array.isArray(root.workout)) {
    root = { ...root, ...(root.workout as Record<string, unknown>) }
  }

  const name = firstString(root, ['name', 'title', 'workoutName']) || 'Generated ride'
  const description = firstString(root, ['description', 'desc', 'summary'])
  const status = root.status === 'clarifying' ? 'clarifying' : 'workout'

  let blocks = root.blocks ?? root.segments ?? root.profile
  if (!Array.isArray(blocks)) blocks = []

  const questions = normalizeClarifyingQuestions(root.questions)

  const ftpRaw = root.ftp
  const ftp =
    typeof ftpRaw === 'number' && Number.isFinite(ftpRaw) ? Math.round(ftpRaw) : undefined

  return {
    status,
    name,
    description,
    blocks: blocks as GeneratedBlockPayload[],
    questions,
    ...(ftp !== undefined && ftp >= 50 && ftp <= 600 ? { ftp } : {}),
  }
}
