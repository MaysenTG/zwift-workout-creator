import { clampFtp, type AppSettings } from '../lib/settings'

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
          New workouts use this FTP. Power targets in a .zwo file are still stored as % of FTP, so
          changing FTP changes the watts you see here, not the exported percentages.
        </p>

        <label className="field">
          <span>Edit power as</span>
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
          <button type="button" className="ghost" onClick={onApplyCurrent} disabled={!mismatch}>
            Apply to this workout
          </button>
          <button type="button" className="primary" onClick={() => void onApplyAll()}>
            Apply to all saved workouts
          </button>
        </div>
      </div>
    </div>
  )
}
