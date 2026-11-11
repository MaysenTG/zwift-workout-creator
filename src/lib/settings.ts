import type { PowerUnit } from '../types'

/** Seconds to snap duration drag to. `0` = no snap (1s steps). */
export type DurationSnapSec = 0 | 5 | 10 | 15 | 30 | 60

export interface AppSettings {
  ftp: number
  powerUnit: PowerUnit
  durationSnapSec: DurationSnapSec
}

const KEY = 'wattline:settings'

export const DEFAULT_SETTINGS: AppSettings = {
  ftp: 200,
  powerUnit: 'percent',
  durationSnapSec: 30,
}

export const DURATION_SNAP_OPTIONS: { value: DurationSnapSec; label: string }[] = [
  { value: 0, label: 'Off (1 second)' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
]

function parseDurationSnap(value: unknown): DurationSnapSec {
  const n = Number(value)
  if (n === 0 || n === 5 || n === 10 || n === 15 || n === 30 || n === 60) return n
  return DEFAULT_SETTINGS.durationSnapSec
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const ftp = Number(parsed.ftp)
    return {
      ftp: Number.isFinite(ftp) ? Math.min(600, Math.max(50, Math.round(ftp))) : DEFAULT_SETTINGS.ftp,
      powerUnit: parsed.powerUnit === 'watts' ? 'watts' : 'percent',
      durationSnapSec: parseDurationSnap(parsed.durationSnapSec),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function clampFtp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.ftp
  return Math.min(600, Math.max(50, Math.round(value)))
}

export function snapDuration(seconds: number, snapSec: DurationSnapSec): number {
  const min = snapSec > 0 ? snapSec : 1
  if (!Number.isFinite(seconds)) return min
  if (snapSec <= 0) return Math.max(1, Math.round(seconds))
  return Math.max(snapSec, Math.round(seconds / snapSec) * snapSec)
}
