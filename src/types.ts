export type BlockType =
  | 'steady'
  | 'ramp'
  | 'warmup'
  | 'cooldown'
  | 'intervals'
  | 'freeride'

export type PowerUnit = 'percent' | 'watts'

/** Zwift `<textevent>` — on-screen cue relative to the parent block. */
export interface TextAlert {
  id: string
  /** Seconds from the start of this block (for IntervalsT, from the interval step start). */
  timeOffsetSec: number
  message: string
  /** Optional seconds the cue stays on screen in Zwift. */
  durationSec?: number
}

interface BlockBase {
  id: string
  texts?: TextAlert[]
  /** Single cadence target (rpm) → ZWO `Cadence`. */
  cadence?: number
  /** Cadence range low (rpm) → `CadenceLow` when paired with cadenceHigh. */
  cadenceLow?: number
  /** Cadence range high (rpm) → `CadenceHigh` when paired with cadenceLow. */
  cadenceHigh?: number
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
  /** Recovery cadence (rpm) → ZWO `CadenceResting`. Work uses `cadence`. */
  cadenceResting?: number
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

/** One natural-language AI request (and outcome) against a workout. */
export interface WorkoutAiAuditEntry {
  id: string
  at: number
  kind: 'create' | 'edit'
  prompt: string
  clarifications?: { question: string; answer: string }[]
  /** Human-readable summary of what the model changed. */
  changes: string[]
}

export interface Workout {
  id: string
  name: string
  author: string
  description: string
  ftp: number
  powerUnit: PowerUnit
  blocks: WorkoutBlock[]
  /** Chronological log of AI prompts applied to this workout. */
  aiHistory?: WorkoutAiAuditEntry[]
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
