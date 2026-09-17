export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatMinutes(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

export function splitDuration(totalSec: number): { minutes: number; seconds: number } {
  const sec = Math.max(0, Math.round(totalSec))
  return { minutes: Math.floor(sec / 60), seconds: sec % 60 }
}

export function joinDuration(minutes: number, seconds: number): number {
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0
  const s = Number.isFinite(seconds) ? Math.max(0, Math.min(59, Math.floor(seconds))) : 0
  return m * 60 + s
}
