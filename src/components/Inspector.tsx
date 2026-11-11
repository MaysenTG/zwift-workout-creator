import { useState } from 'react'
import { uid } from '../lib/ids'
import {
  BLOCK_LABELS,
  blockDuration,
  blockTexts,
  clampCadence,
  pctFromWatts,
  wattsFromPct,
} from '../lib/workout'
import { formatMinutes, joinDuration, splitDuration } from '../lib/time'
import { zoneForPercent } from '../lib/zones'
import type { TextAlert, Workout, WorkoutBlock } from '../types'

interface Props {
  workout: Workout
  globalFtp: number
  selected: WorkoutBlock | null
  presentation: 'rail' | 'sheet'
  sheetOpen?: boolean
  onCloseSheet?: () => void
  onChangeMeta: (patch: Partial<Workout>) => void
  onChangeBlock: (id: string, patch: Partial<WorkoutBlock>) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onApplyGlobalFtp: () => void
}

export function Inspector({
  workout,
  globalFtp,
  selected,
  presentation,
  sheetOpen = false,
  onCloseSheet,
  onChangeMeta,
  onChangeBlock,
  onDuplicate,
  onRemove,
  onApplyGlobalFtp,
}: Props) {
  const ftpMismatch = workout.ftp !== globalFtp
  const isSheet = presentation === 'sheet'

  if (isSheet && !sheetOpen) return null

  const body = (
    <>
      {isSheet ? (
        <div className="inspector-sheet-head">
          <h2>Edit</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onCloseSheet}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="inspector-power-bar">
        <label className="field">
          <span>FTP</span>
          <input
            type="number"
            min={50}
            max={600}
            value={workout.ftp}
            onChange={(e) => onChangeMeta({ ftp: clamp(Number(e.target.value), 50, 600) })}
          />
        </label>
        <div className="field">
          <span>Power as</span>
          <div className="power-unit-toggle" role="group" aria-label="Edit power as">
            <button
              type="button"
              className={workout.powerUnit === 'percent' ? 'is-selected' : ''}
              aria-pressed={workout.powerUnit === 'percent'}
              onClick={() => onChangeMeta({ powerUnit: 'percent' })}
            >
              % FTP
            </button>
            <button
              type="button"
              className={workout.powerUnit === 'watts' ? 'is-selected' : ''}
              aria-pressed={workout.powerUnit === 'watts'}
              onClick={() => onChangeMeta({ powerUnit: 'watts' })}
            >
              Watts
            </button>
          </div>
        </div>
      </div>
      {ftpMismatch ? (
        <div className="ftp-mismatch compact">
          Global FTP is {globalFtp} W.
          <button type="button" className="link-btn" onClick={onApplyGlobalFtp}>
            Use global
          </button>
        </div>
      ) : null}

      <div className="inspector-rule" />

      {selected ? (
        <BlockFields
          block={selected}
          ftp={workout.ftp}
          unit={workout.powerUnit}
          onChange={(patch) => onChangeBlock(selected.id, patch)}
          onDuplicate={() => onDuplicate(selected.id)}
          onRemove={() => onRemove(selected.id)}
        />
      ) : (
        <p className="inspector-empty">
          {workout.blocks.length === 0
            ? 'Use natural language or add blocks to the profile.'
            : 'Select a block on the profile to edit power and time.'}
        </p>
      )}

      <details className="workout-details">
        <summary>Workout details</summary>
        <div className="workout-details-body">
          <label className="field">
            <span>Name</span>
            <input
              value={workout.name}
              onChange={(e) => onChangeMeta({ name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Author</span>
            <input
              value={workout.author}
              placeholder="You"
              onChange={(e) => onChangeMeta({ author: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              rows={3}
              value={workout.description}
              placeholder="What this ride is for"
              onChange={(e) => onChangeMeta({ description: e.target.value })}
            />
          </label>
        </div>
      </details>
    </>
  )

  if (isSheet) {
    return (
      <div className="inspector-sheet-root" role="presentation">
        <button
          type="button"
          className="inspector-sheet-backdrop"
          aria-label="Close editor"
          onClick={onCloseSheet}
        />
        <aside className="inspector inspector-sheet" role="dialog" aria-label="Block editor">
          {body}
        </aside>
      </div>
    )
  }

  return <aside className="inspector">{body}</aside>
}

function BlockFields({
  block,
  ftp,
  unit,
  onChange,
  onDuplicate,
  onRemove,
}: {
  block: WorkoutBlock
  ftp: number
  unit: Workout['powerUnit']
  onChange: (patch: Partial<WorkoutBlock>) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  return (
    <div className="block-fields">
      <div className="block-fields-head">
        <strong>{BLOCK_LABELS[block.type]}</strong>
        <span className="chip">{zoneChip(block)}</span>
      </div>

      {block.type !== 'intervals' && (
        <DurationField
          seconds={'durationSec' in block ? block.durationSec : 0}
          onChange={(durationSec) => onChange({ durationSec } as Partial<WorkoutBlock>)}
        />
      )}

      {block.type === 'steady' && (
        <PowerField
          label="Power"
          pct={block.powerPct}
          ftp={ftp}
          unit={unit}
          onChange={(powerPct) => onChange({ powerPct })}
        />
      )}

      {(block.type === 'ramp' || block.type === 'warmup' || block.type === 'cooldown') && (
        <>
          <PowerField
            label="Start"
            pct={block.startPct}
            ftp={ftp}
            unit={unit}
            onChange={(startPct) => onChange({ startPct })}
          />
          <PowerField
            label="End"
            pct={block.endPct}
            ftp={ftp}
            unit={unit}
            onChange={(endPct) => onChange({ endPct })}
          />
        </>
      )}

      {block.type === 'intervals' && (
        <>
          <RepeatsField
            value={block.repeat}
            onChange={(repeat) => onChange({ repeat })}
          />
          <div className="interval-section">
            <h3 className="interval-section-title">Work (on)</h3>
            <DurationField
              label="Duration"
              seconds={block.onDurationSec}
              onChange={(onDurationSec) => onChange({ onDurationSec })}
            />
            <PowerField
              label="Power"
              pct={block.onPct}
              ftp={ftp}
              unit={unit}
              onChange={(onPct) => onChange({ onPct })}
            />
            <CadenceField
              label="Cadence"
              value={block.cadence}
              onChange={(cadence) => onChange({ cadence })}
            />
          </div>
          <div className="interval-section">
            <h3 className="interval-section-title">Recovery (off)</h3>
            <DurationField
              label="Duration"
              seconds={block.offDurationSec}
              onChange={(offDurationSec) => onChange({ offDurationSec })}
            />
            <PowerField
              label="Power"
              pct={block.offPct}
              ftp={ftp}
              unit={unit}
              onChange={(offPct) => onChange({ offPct })}
            />
            <CadenceField
              label="Cadence"
              value={block.cadenceResting}
              onChange={(cadenceResting) => onChange({ cadenceResting })}
            />
          </div>
        </>
      )}

      {block.type !== 'intervals' ? (
        <CadenceTargets
          cadence={block.cadence}
          cadenceLow={block.cadenceLow}
          cadenceHigh={block.cadenceHigh}
          onChange={onChange}
        />
      ) : null}

      <TextAlertsEditor
        texts={blockTexts(block)}
        blockDurationSec={blockDuration(block)}
        onChange={(texts) => onChange({ texts })}
      />

      <div className="inspector-actions">
        <button type="button" className="ghost" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  )
}

function TextAlertsEditor({
  texts,
  blockDurationSec,
  onChange,
}: {
  texts: TextAlert[]
  blockDurationSec: number
  onChange: (texts: TextAlert[]) => void
}) {
  function update(id: string, patch: Partial<TextAlert>) {
    onChange(texts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function remove(id: string) {
    onChange(texts.filter((t) => t.id !== id))
  }

  function add() {
    onChange([
      ...texts,
      {
        id: uid(),
        timeOffsetSec: 0,
        message: '',
        durationSec: 10,
      },
    ])
  }

  const maxOffset = Math.max(0, blockDurationSec)

  return (
    <div className="text-alerts">
      <div className="text-alerts-head">
        <strong>Text alerts</strong>
        <button type="button" className="ghost text-alerts-add" onClick={add}>
          Add
        </button>
      </div>
      <p className="text-alerts-hint">
        On-screen cues in Zwift. Time is from the start of this block
        {maxOffset > 0 ? ` (0–${formatMinutes(maxOffset)})` : ''}.
      </p>
      {texts.length === 0 ? (
        <p className="text-alerts-empty">No on-screen cues yet.</p>
      ) : (
        <ul className="text-alerts-list">
          {texts.map((alert, index) => (
            <li key={alert.id} className="text-alert-card">
              <div className="text-alert-card-head">
                <span className="text-alert-card-label">Cue {index + 1}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove text alert ${index + 1}`}
                  onClick={() => remove(alert.id)}
                >
                  ×
                </button>
              </div>
              <label className="field text-alert-message">
                <span>Message</span>
                <input
                  type="text"
                  value={alert.message}
                  placeholder="e.g. High cadence — stay smooth"
                  onChange={(e) => update(alert.id, { message: e.target.value })}
                />
              </label>
              <DurationField
                label="Appear at"
                seconds={alert.timeOffsetSec}
                onChange={(timeOffsetSec) =>
                  update(alert.id, {
                    timeOffsetSec: clamp(timeOffsetSec, 0, maxOffset || timeOffsetSec),
                  })
                }
              />
              <DurationField
                label="Show for"
                seconds={alert.durationSec ?? 10}
                onChange={(durationSec) =>
                  update(alert.id, {
                    durationSec: clamp(durationSec, 1, 300),
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RepeatsField({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? String(value)

  function commit(raw: string) {
    if (raw.trim() === '') {
      onChange(1)
      setDraft(null)
      return
    }
    const next = Number(raw)
    if (!Number.isFinite(next)) {
      setDraft(null)
      return
    }
    onChange(clamp(Math.round(next), 1, 40))
    setDraft(null)
  }

  return (
    <label className="field">
      <span>Repeats</span>
      <input
        type="number"
        min={1}
        max={40}
        value={display}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          if (raw.trim() === '') return
          const next = Number(raw)
          if (Number.isFinite(next) && next >= 1) {
            onChange(clamp(Math.round(next), 1, 40))
          }
        }}
        onBlur={() => commit(draft ?? String(value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function CadenceField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <label className="field">
      <span>{label} (rpm)</span>
      <input
        type="number"
        min={30}
        max={200}
        placeholder="None"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') onChange(undefined)
          else onChange(clampCadence(Number(raw)))
        }}
      />
    </label>
  )
}

function CadenceTargets({
  cadence,
  cadenceLow,
  cadenceHigh,
  onChange,
}: {
  cadence: number | undefined
  cadenceLow: number | undefined
  cadenceHigh: number | undefined
  onChange: (patch: Partial<WorkoutBlock>) => void
}) {
  const useRange = cadenceLow != null || cadenceHigh != null

  return (
    <div className="cadence-targets">
      <div className="cadence-targets-head">
        <strong>Cadence</strong>
        <label className="cadence-range-toggle">
          <input
            type="checkbox"
            checked={useRange}
            onChange={(e) => {
              if (e.target.checked) {
                const mid = cadence ?? 90
                onChange({
                  cadence: undefined,
                  cadenceLow: mid - 5,
                  cadenceHigh: mid + 5,
                })
              } else {
                onChange({
                  cadence: cadenceLow ?? cadenceHigh ?? cadence,
                  cadenceLow: undefined,
                  cadenceHigh: undefined,
                })
              }
            }}
          />
          Range
        </label>
      </div>
      {useRange ? (
        <div className="field-row">
          <CadenceField
            label="Low"
            value={cadenceLow}
            onChange={(next) => onChange({ cadenceLow: next })}
          />
          <CadenceField
            label="High"
            value={cadenceHigh}
            onChange={(next) => onChange({ cadenceHigh: next })}
          />
        </div>
      ) : (
        <CadenceField
          label="Target"
          value={cadence}
          onChange={(next) => onChange({ cadence: next })}
        />
      )}
    </div>
  )
}

function DurationField({
  label = 'Duration',
  seconds,
  onChange,
}: {
  label?: string
  seconds: number
  onChange: (seconds: number) => void
}) {
  const { minutes, seconds: secs } = splitDuration(seconds)
  return (
    <div className="field">
      <span>{label}</span>
      <div className="duration-inputs">
        <input
          type="number"
          min={0}
          value={minutes}
          aria-label={`${label} minutes`}
          onChange={(e) => onChange(joinDuration(Number(e.target.value), secs))}
        />
        <em>min</em>
        <input
          type="number"
          min={0}
          max={59}
          value={secs}
          aria-label={`${label} seconds`}
          onChange={(e) => onChange(joinDuration(minutes, Number(e.target.value)))}
        />
        <em>sec</em>
      </div>
    </div>
  )
}

function PowerField({
  label,
  pct,
  ftp,
  unit,
  onChange,
}: {
  label: string
  pct: number
  ftp: number
  unit: Workout['powerUnit']
  onChange: (pct: number) => void
}) {
  const watts = wattsFromPct(pct, ftp)
  const zone = zoneForPercent(pct)
  return (
    <label className="field">
      <span>
        {label}{' '}
        <b style={{ color: zone.color }}>
          {zone.short} · {unit === 'watts' ? `${Math.round(pct)}%` : `${watts} W`}
        </b>
      </span>
      <input
        type="number"
        min={0}
        max={unit === 'watts' ? 2000 : 300}
        step={unit === 'watts' ? 1 : 0.5}
        value={unit === 'watts' ? watts : pct}
        onChange={(e) => {
          const value = Number(e.target.value)
          onChange(unit === 'watts' ? pctFromWatts(value, ftp) : value)
        }}
      />
    </label>
  )
}

function zoneChip(block: WorkoutBlock): string {
  if (block.type === 'steady') return zoneForPercent(block.powerPct).name
  if (block.type === 'intervals') return zoneForPercent(block.onPct).name
  if (block.type === 'freeride') return 'Free'
  return zoneForPercent((block.startPct + block.endPct) / 2).name
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
