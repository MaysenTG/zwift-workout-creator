import type { Workout, WorkoutBlock } from '../types'
import { uid } from './ids'
import { createWorkout } from './workout'

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

function blockToXml(block: WorkoutBlock): string {
  switch (block.type) {
    case 'steady':
      return `    <SteadyState Duration="${Math.round(block.durationSec)}" Power="${toFraction(block.powerPct)}"/>`
    case 'ramp':
      return `    <Ramp Duration="${Math.round(block.durationSec)}" PowerLow="${toFraction(block.startPct)}" PowerHigh="${toFraction(block.endPct)}"/>`
    case 'warmup':
      return `    <Warmup Duration="${Math.round(block.durationSec)}" PowerLow="${toFraction(block.startPct)}" PowerHigh="${toFraction(block.endPct)}"/>`
    case 'cooldown':
      return `    <Cooldown Duration="${Math.round(block.durationSec)}" PowerLow="${toFraction(block.startPct)}" PowerHigh="${toFraction(block.endPct)}"/>`
    case 'intervals':
      return `    <IntervalsT Repeat="${Math.round(block.repeat)}" OnDuration="${Math.round(block.onDurationSec)}" OffDuration="${Math.round(block.offDurationSec)}" OnPower="${toFraction(block.onPct)}" OffPower="${toFraction(block.offPct)}"/>`
    case 'freeride':
      return `    <FreeRide Duration="${Math.round(block.durationSec)}" FlatRoad="0"/>`
  }
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

function parseBlock(el: Element, ftp: number): WorkoutBlock | null {
  const tag = el.tagName
  const duration = Math.max(1, Math.round(num(el, 'Duration', 60)))

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
      }
    }
    return {
      id: uid(),
      type: 'steady',
      durationSec: duration,
      powerPct: powerToPct(num(el, 'Power', 0.7), ftp),
    }
  }

  if (tag === 'Ramp' || tag === 'Warmup' || tag === 'Cooldown') {
    const start = powerToPct(num(el, 'PowerLow', num(el, 'Power', 0.5)), ftp)
    const end = powerToPct(num(el, 'PowerHigh', num(el, 'Power', 0.8)), ftp)
    const type = tag === 'Warmup' ? 'warmup' : tag === 'Cooldown' ? 'cooldown' : 'ramp'
    return { id: uid(), type, durationSec: duration, startPct: start, endPct: end }
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
    }
  }

  if (tag === 'FreeRide' || tag === 'Freeride' || tag === 'MaxEffort') {
    return { id: uid(), type: 'freeride', durationSec: duration }
  }

  return null
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
