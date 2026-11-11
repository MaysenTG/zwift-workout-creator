import {
  clampFtp,
  DURATION_SNAP_OPTIONS,
  type AppSettings,
  type DurationSnapSec,
} from '../lib/settings'

interface Props {
  settings: AppSettings
  workoutFtp: number
  open: boolean
  onClose: () => void
  onChange: (patch: Partial<AppSettings>) => void
  onApplyCurrent: () => void
  onApplyAll: () => void
}

export function SettingsPanel({
  settings,
  workoutFtp,
  open,
  onClose,
  onChange,
  onApplyCurrent,
  onApplyAll,
}: Props) {
  if (!open) return null

  const mismatch = workoutFtp !== settings.ftp

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="settings-title">Preferences</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <label className="field">
          <span>Global FTP</span>
          <input
            type="number"
            min={50}
            max={600}
            value={settings.ftp}
            onChange={(e) => onChange({ ftp: clampFtp(Number(e.target.value)) })}
          />
        </label>
        <p className="modal-copy">
          New workouts use this FTP. Exported Zwift workouts still store power as % of FTP, so
          changing FTP changes the watts you see here, not the exported percentages.
        </p>

        <label className="field">
          <span>Default power unit (new workouts)</span>
          <select
            value={settings.powerUnit}
            onChange={(e) =>
              onChange({ powerUnit: e.target.value === 'watts' ? 'watts' : 'percent' })
            }
          >
            <option value="percent">% FTP</option>
            <option value="watts">Watts</option>
          </select>
        </label>
        <p className="modal-copy">
          The open workout&apos;s unit is edited in the inspector. This only sets the default for
          new rides.
        </p>

        <label className="field">
          <span>Duration drag snap</span>
          <select
            value={settings.durationSnapSec}
            onChange={(e) =>
              onChange({ durationSnapSec: Number(e.target.value) as DurationSnapSec })
            }
          >
            {DURATION_SNAP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="modal-copy">
          When resizing blocks on the profile, durations snap to this step. Choose Off for 1-second
          precision.
        </p>

        <div className={mismatch ? 'ftp-mismatch' : 'ftp-match'}>
          {mismatch ? (
            <>
              This workout is at <strong>{workoutFtp} W</strong>, global is{' '}
              <strong>{settings.ftp} W</strong>.
            </>
          ) : (
            <>This workout already uses the global FTP ({settings.ftp} W).</>
          )}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className={mismatch ? 'primary' : 'ghost'}
            onClick={onApplyCurrent}
            disabled={!mismatch}
          >
            Apply to this workout
          </button>
          <button type="button" className="ghost" onClick={() => void onApplyAll()}>
            Apply to all saved workouts
          </button>
        </div>
      </div>
    </div>
  )
}
