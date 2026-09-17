export interface Zone {
  id: number
  name: string
  short: string
  minPct: number
  maxPct: number
  color: string
}

/** Muted zone fills that read clearly on a light chart background */
export const POWER_ZONES: Zone[] = [
  { id: 1, name: 'Active Recovery', short: 'Z1', minPct: 0, maxPct: 55, color: '#8a939c' },
  { id: 2, name: 'Endurance', short: 'Z2', minPct: 55, maxPct: 75, color: '#6b8f71' },
  { id: 3, name: 'Tempo', short: 'Z3', minPct: 75, maxPct: 90, color: '#b8973a' },
  { id: 4, name: 'Threshold', short: 'Z4', minPct: 90, maxPct: 105, color: '#c47a2c' },
  { id: 5, name: 'VO2 Max', short: 'Z5', minPct: 105, maxPct: 120, color: '#a63d32' },
  { id: 6, name: 'Anaerobic', short: 'Z6', minPct: 120, maxPct: 150, color: '#8b4d8a' },
  { id: 7, name: 'Neuromuscular', short: 'Z7', minPct: 150, maxPct: 400, color: '#7a3550' },
]

export function zoneForPercent(pct: number): Zone {
  const bounded = Math.max(0, pct)
  return (
    POWER_ZONES.find((z) => bounded >= z.minPct && bounded < z.maxPct) ??
    POWER_ZONES[POWER_ZONES.length - 1]
  )
}

export function mixZoneColor(startPct: number, endPct: number): string {
  return zoneForPercent((startPct + endPct) / 2).color
}
