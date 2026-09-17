import type { PowerUnit } from '../types'

export interface AppSettings {
  ftp: number
  powerUnit: PowerUnit
}

const KEY = 'wattline:settings'

export const DEFAULT_SETTINGS: AppSettings = {
  ftp: 200,
  powerUnit: 'percent',
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
