export type BlockType =
  | 'steady'
  | 'ramp'
  | 'warmup'
  | 'cooldown'
  | 'intervals'
  | 'freeride'

export type PowerUnit = 'percent' | 'watts'

interface BlockBase {
  id: string
}

export interface SteadyBlock extends BlockBase {
  type: 'steady'
  durationSec: number
  powerPct: number
}

export interface RampBlock extends BlockBase {
  type: 'ramp' | 'warmup' | 'cooldown'
  durationSec: number
  startPct: number
  endPct: number
}

export interface IntervalsBlock extends BlockBase {
  type: 'intervals'
  repeat: number
  onDurationSec: number
  offDurationSec: number
  onPct: number
  offPct: number
}

export interface FreeRideBlock extends BlockBase {
  type: 'freeride'
  durationSec: number
}

export type WorkoutBlock =
  | SteadyBlock
  | RampBlock
  | IntervalsBlock
  | FreeRideBlock

export interface Workout {
  id: string
  name: string
  author: string
  description: string
  ftp: number
  powerUnit: PowerUnit
  blocks: WorkoutBlock[]
  createdAt: number
  updatedAt: number
}

export interface WorkoutSummary {
  id: string
  name: string
  updatedAt: number
  durationSec: number
  ftp: number
}
