import { BLOCK_LABELS, pctFromWatts, wattsFromPct } from '../lib/workout'
import { joinDuration, splitDuration } from '../lib/time'
import { zoneForPercent } from '../lib/zones'
import type { Workout, WorkoutBlock } from '../types'

interface Props {
  workout: Workout
  globalFtp: number
  selected: WorkoutBlock | null
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
  onChangeMeta,
  onChangeBlock,
  onDuplicate,
  onRemove,
  onApplyGlobalFtp,
}: Props) {
  const ftpMismatch = workout.ftp !== globalFtp

  return (
    <aside className="inspector">
      <h2>Workout</h2>
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

      <div className="field-row">
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
        <label className="field">
          <span>Edit power as</span>
          <select
            value={workout.powerUnit}
            onChange={(e) =>
              onChangeMeta({ powerUnit: e.target.value as Workout['powerUnit'] })
            }
          >
            <option value="percent">% FTP</option>
            <option value="watts">Watts</option>
          </select>
        </label>
      </div>
      {ftpMismatch ? (
        <div className="ftp-mismatch compact">
          Global FTP is {globalFtp} W.
          <button type="button" className="link-btn" onClick={onApplyGlobalFtp}>
            Use global
          </button>
        </div>
      ) : (
        <p className="ftp-match-note">Matches global FTP ({globalFtp} W)</p>
      )}

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
        <p className="inspector-empty">Select a block on the profile to edit power and time.</p>
      )}
    </aside>
  )
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
          <label className="field">
            <span>Repeats</span>
            <input
              type="number"
              min={1}
              max={40}
              value={block.repeat}
              onChange={(e) => onChange({ repeat: clamp(Number(e.target.value), 1, 40) })}
            />
          </label>
          <DurationField
            label="On time"
            seconds={block.onDurationSec}
            onChange={(onDurationSec) => onChange({ onDurationSec })}
          />
          <PowerField
            label="On power"
            pct={block.onPct}
            ftp={ftp}
            unit={unit}
            onChange={(onPct) => onChange({ onPct })}
          />
          <DurationField
            label="Off time"
            seconds={block.offDurationSec}
            onChange={(offDurationSec) => onChange({ offDurationSec })}
          />
          <PowerField
            label="Off power"
            pct={block.offPct}
            ftp={ftp}
            unit={unit}
            onChange={(offPct) => onChange({ offPct })}
          />
        </>
      )}

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
