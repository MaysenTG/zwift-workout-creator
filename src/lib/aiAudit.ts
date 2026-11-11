import { uid } from './ids'
import type { Workout, WorkoutAiAuditEntry } from '../types'

export const AI_HISTORY_MAX = 40

export function createAiAuditEntry(
  partial: Omit<WorkoutAiAuditEntry, 'id' | 'at'> & { at?: number },
): WorkoutAiAuditEntry {
  return {
    id: uid(),
    at: partial.at ?? Date.now(),
    kind: partial.kind,
    prompt: partial.prompt.trim(),
    clarifications: partial.clarifications?.length
      ? partial.clarifications.map((c) => ({
          question: c.question.trim(),
          answer: c.answer.trim(),
        }))
      : undefined,
    changes: partial.changes.filter((line) => line.trim().length > 0),
  }
}

export function appendAiAuditEntry(
  workout: Workout,
  entry: WorkoutAiAuditEntry,
): WorkoutAiAuditEntry[] {
  const prev = workout.aiHistory ?? []
  return [...prev, entry].slice(-AI_HISTORY_MAX)
}

export function formatAuditTime(at: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(at))
  } catch {
    return new Date(at).toLocaleString()
  }
}
