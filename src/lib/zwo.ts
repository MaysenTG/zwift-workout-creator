import type { TextAlert, Workout, WorkoutBlock } from '../types'
import { uid } from './ids'
import { blockTexts, cadenceXmlAttrs, clampCadence, createWorkout } from './workout'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toFraction(pct: number): string {
  const fraction = Math.max(0, pct) / 100
  return Number(fraction.toFixed(3)).toString()
}

function filenameFromName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
  return `${slug || 'workout'}.zwo`
}

export function workoutToZwo(workout: Workout): string {
  const body = workout.blocks.map(blockToXml).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>${escapeXml(workout.author || 'Wattline')}</author>
  <name>${escapeXml(workout.name || 'Untitled ride')}</name>
  <description>${escapeXml(workout.description || '')}</description>
  <sportType>bike</sportType>
  <Tags></Tags>
  <workout>
${body}
  </workout>
</workout_file>
`
}

function textEventsXml(texts: TextAlert[]): string {
  if (texts.length === 0) return ''
  return texts
    .filter((t) => t.message.trim())
    .map((t) => {
      const duration =
        t.durationSec !== undefined && t.durationSec > 0
          ? ` duration="${Math.round(t.durationSec)}"`
          : ''
      return `      <textevent timeoffset="${Math.max(0, Math.round(t.timeOffsetSec))}"${duration} message="${escapeXml(t.message.trim())}"/>`
    })
    .join('\n')
}

function wrapBlockXml(openTag: string, texts: TextAlert[]): string {
  const events = textEventsXml(texts)
  if (!events) return `    <${openTag}/>`
  return `    <${openTag}>\n${events}\n    </${openTag.split(' ')[0]}>`
}

function blockToXml(block: WorkoutBlock): string {
  const texts = blockTexts(block)
  const cad = cadenceXmlAttrs(block)
  switch (block.type) {
    case 'steady':
      return wrapBlockXml(
        `SteadyState Duration="${Math.round(block.durationSec)}" Power="${toFraction(block.powerPct)}"${cad}`,
        texts,
      )
    case 'ramp':
      return wrapBlockXml(
        `Ramp Duration="${Math.round(block.durationSec)}" PowerLow="${toFraction(block.startPct)}" PowerHigh="${toFraction(block.endPct)}"${cad}`,
        texts,
      )
    case 'warmup':
      return wrapBlockXml(
        `Warmup Duration="${Math.round(block.durationSec)}" PowerLow="${toFraction(block.startPct)}" PowerHigh="${toFraction(block.endPct)}"${cad}`,
        texts,
      )
    case 'cooldown':
      return wrapBlockXml(
        `Cooldown Duration="${Math.round(block.durationSec)}" PowerLow="${toFraction(block.startPct)}" PowerHigh="${toFraction(block.endPct)}"${cad}`,
        texts,
      )
    case 'intervals':
      return wrapBlockXml(
        `IntervalsT Repeat="${Math.round(block.repeat)}" OnDuration="${Math.round(block.onDurationSec)}" OffDuration="${Math.round(block.offDurationSec)}" OnPower="${toFraction(block.onPct)}" OffPower="${toFraction(block.offPct)}"${cad}`,
        texts,
      )
    case 'freeride':
      return wrapBlockXml(
        `FreeRide Duration="${Math.round(block.durationSec)}" FlatRoad="0"${cad}`,
        texts,
      )
  }
}

function parseCadenceFields(el: Element): {
  cadence?: number
  cadenceLow?: number
  cadenceHigh?: number
  cadenceResting?: number
} {
  const out: {
    cadence?: number
    cadenceLow?: number
    cadenceHigh?: number
    cadenceResting?: number
  } = {}
  const cadence = attr(el, 'Cadence')
  const low = attr(el, 'CadenceLow')
  const high = attr(el, 'CadenceHigh')
  const resting = attr(el, 'CadenceResting')
  if (cadence != null && cadence !== '' && Number.isFinite(Number(cadence))) {
    out.cadence = clampCadence(Number(cadence))
  }
  if (low != null && low !== '' && Number.isFinite(Number(low))) {
    out.cadenceLow = clampCadence(Number(low))
  }
  if (high != null && high !== '' && Number.isFinite(Number(high))) {
    out.cadenceHigh = clampCadence(Number(high))
  }
  if (resting != null && resting !== '' && Number.isFinite(Number(resting))) {
    out.cadenceResting = clampCadence(Number(resting))
  }
  return out
}

export function downloadZwo(workout: Workout): void {
  const xml = workoutToZwo(workout)
  const blob = new Blob([xml], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filenameFromName(workout.name)
  a.click()
  URL.revokeObjectURL(url)
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(name.toLowerCase())
}

function num(el: Element, name: string, fallback = 0): number {
  const raw = attr(el, name)
  if (raw == null || raw === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function powerToPct(value: number, ftp: number): number {
  if (value > 2.5) {
    return ftp > 0 ? Math.round((value / ftp) * 1000) / 10 : value
  }
  return Math.round(value * 1000) / 10
}

function parseTextEvents(el: Element): TextAlert[] {
  const out: TextAlert[] = []
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase()
    // Zwift uses <textevent>; some files also use <TextEvent>.
    if (tag !== 'textevent') continue

    const message =
      attr(child, 'message')?.trim() ||
      attr(child, 'mssage')?.trim() || // known Zwift typo in some files
      ''
    if (!message) continue

    const timeOffsetSec = Math.max(
      0,
      Math.round(num(child, 'timeoffset', num(child, 'TimeOffset', 0))),
    )
    const durationAttr = attr(child, 'duration') ?? attr(child, 'Duration')
    const durationSec =
      durationAttr != null && durationAttr !== '' && Number.isFinite(Number(durationAttr))
        ? Math.max(1, Math.round(Number(durationAttr)))
        : undefined

    out.push({
      id: uid(),
      timeOffsetSec,
      message,
      ...(durationSec !== undefined ? { durationSec } : {}),
    })
  }
  return out
}

function parseBlock(el: Element, ftp: number): WorkoutBlock | null {
  const tag = el.tagName
  const duration = Math.max(1, Math.round(num(el, 'Duration', 60)))
  const texts = parseTextEvents(el)
  const cad = parseCadenceFields(el)

  if (tag === 'SteadyState' || tag === 'SolidState') {
    const powerLow = attr(el, 'PowerLow')
    const powerHigh = attr(el, 'PowerHigh')
    if (powerLow && powerHigh) {
      return {
        id: uid(),
        type: 'ramp',
        durationSec: duration,
        startPct: powerToPct(Number(powerLow), ftp),
        endPct: powerToPct(Number(powerHigh), ftp),
        texts,
        ...pickCadence(cad),
      }
    }
    return {
      id: uid(),
      type: 'steady',
      durationSec: duration,
      powerPct: powerToPct(num(el, 'Power', 0.7), ftp),
      texts,
      ...pickCadence(cad),
    }
  }

  if (tag === 'Ramp' || tag === 'Warmup' || tag === 'Cooldown') {
    const start = powerToPct(num(el, 'PowerLow', num(el, 'Power', 0.5)), ftp)
    const end = powerToPct(num(el, 'PowerHigh', num(el, 'Power', 0.8)), ftp)
    const type = tag === 'Warmup' ? 'warmup' : tag === 'Cooldown' ? 'cooldown' : 'ramp'
    return {
      id: uid(),
      type,
      durationSec: duration,
      startPct: start,
      endPct: end,
      texts,
      ...pickCadence(cad),
    }
  }

  if (tag === 'IntervalsT') {
    return {
      id: uid(),
      type: 'intervals',
      repeat: Math.max(1, Math.round(num(el, 'Repeat', 1))),
      onDurationSec: Math.max(1, Math.round(num(el, 'OnDuration', 60))),
      offDurationSec: Math.max(1, Math.round(num(el, 'OffDuration', 60))),
      onPct: powerToPct(num(el, 'OnPower', 1), ftp),
      offPct: powerToPct(num(el, 'OffPower', 0.5), ftp),
      texts,
      ...(cad.cadence != null ? { cadence: cad.cadence } : {}),
      ...(cad.cadenceResting != null ? { cadenceResting: cad.cadenceResting } : {}),
    }
  }

  if (tag === 'FreeRide' || tag === 'Freeride' || tag === 'MaxEffort') {
    return {
      id: uid(),
      type: 'freeride',
      durationSec: duration,
      texts,
      ...pickCadence(cad),
    }
  }

  return null
}

function pickCadence(cad: {
  cadence?: number
  cadenceLow?: number
  cadenceHigh?: number
}): Pick<WorkoutBlock, 'cadence' | 'cadenceLow' | 'cadenceHigh'> {
  const out: Pick<WorkoutBlock, 'cadence' | 'cadenceLow' | 'cadenceHigh'> = {}
  if (cad.cadenceLow != null && cad.cadenceHigh != null) {
    out.cadenceLow = cad.cadenceLow
    out.cadenceHigh = cad.cadenceHigh
  } else if (cad.cadence != null) {
    out.cadence = cad.cadence
  } else {
    if (cad.cadenceLow != null) out.cadenceLow = cad.cadenceLow
    if (cad.cadenceHigh != null) out.cadenceHigh = cad.cadenceHigh
  }
  return out
}

export function parseZwo(xml: string, ftp = 200): Workout {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('That file is not valid XML.')
  }

  const root = doc.querySelector('workout_file') ?? doc.documentElement
  const name = root.querySelector('name')?.textContent?.trim() || 'Imported workout'
  const author = root.querySelector('author')?.textContent?.trim() || ''
  const description = root.querySelector('description')?.textContent?.trim() || ''
  const workoutEl = root.querySelector('workout')
  const blocks: WorkoutBlock[] = []

  if (workoutEl) {
    for (const child of Array.from(workoutEl.children)) {
      const block = parseBlock(child, ftp)
      if (block) blocks.push(block)
    }
  }

  if (blocks.length === 0) {
    throw new Error('No workout blocks were found in that file.')
  }

  return createWorkout({
    name,
    author,
    description,
    ftp,
    blocks,
  })
}
