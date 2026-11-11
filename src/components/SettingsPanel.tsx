import { useState } from 'react'
import {
  clampFtp,
  DURATION_SNAP_OPTIONS,
  type AppSettings,
  type DurationSnapSec,
} from '../lib/settings'
import type { CloudSyncStatus } from '../lib/cloudLibrary'

interface Props {
  settings: AppSettings
  workoutFtp: number
  open: boolean
  cloudStatus: CloudSyncStatus
  libraryKeyDisplay: string
  libraryHref: string
  onClose: () => void
  onChange: (patch: Partial<AppSettings>) => void
  onApplyCurrent: () => void
  onApplyAll: () => void
  onOpenLibraryKey: (code: string) => Promise<void>
  onSyncNow: () => Promise<void>
}

function cloudStatusLabel(status: CloudSyncStatus): string {
  switch (status) {
    case 'syncing':
      return 'Syncing…'
    case 'synced':
      return 'Saved to the cloud'
    case 'offline':
      return 'Cloud offline — kept on this device for now'
    case 'error':
      return 'Cloud sync error'
    default:
      return 'Cloud idle'
  }
}

export function SettingsPanel({
  settings,
  workoutFtp,
  open,
  cloudStatus,
  libraryKeyDisplay,
  libraryHref,
  onClose,
  onChange,
  onApplyCurrent,
  onApplyAll,
  onOpenLibraryKey,
  onSyncNow,
}: Props) {
  const [otherKey, setOtherKey] = useState('')
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const mismatch = workoutFtp !== settings.ftp

  async function copyLibraryUrl() {
    try {
      await navigator.clipboard.writeText(libraryHref || window.location.href)
      setCloudMessage('Library link copied.')
    } catch {
      setCloudMessage('Could not copy — select the link and copy manually.')
    }
  }

  async function openOtherLibrary() {
    setBusy(true)
    setCloudMessage(null)
    try {
      await onOpenLibraryKey(otherKey)
    } catch (err) {
      setCloudMessage(err instanceof Error ? err.message : 'Could not open that library.')
      setBusy(false)
    }
  }

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

        <div className="settings-section">
          <strong className="settings-section-title">Cloud library</strong>
          <p className="modal-copy">
            Workouts are stored in the cloud under a library key — no account. This page URL is your
            library ({libraryKeyDisplay}). Bookmark or share it to open the same workouts later.
          </p>
          <p className="cloud-status" data-status={cloudStatus}>
            {cloudStatusLabel(cloudStatus)}
          </p>
          <label className="field">
            <span>Library link</span>
            <input type="text" readOnly value={libraryHref} spellCheck={false} />
          </label>
          <div className="modal-actions-row">
            <button type="button" className="ghost" onClick={() => void copyLibraryUrl()}>
              Copy link
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy || cloudStatus === 'syncing'}
              onClick={() => void onSyncNow()}
            >
              Sync now
            </button>
          </div>
          <label className="field">
            <span>Open another library key</span>
            <input
              type="text"
              value={otherKey}
              spellCheck={false}
              placeholder="Paste a library key or full link"
              onChange={(e) => setOtherKey(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || !otherKey.trim()}
            onClick={() => void openOtherLibrary()}
          >
            {busy ? 'Opening…' : 'Open library'}
          </button>
          {cloudMessage ? <p className="modal-copy">{cloudMessage}</p> : null}
        </div>

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
