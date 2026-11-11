import { formatClock } from '../lib/time'
import { SITE_NAME, SITE_TAGLINE } from '../lib/site'
import type { WorkoutSummary } from '../types'
import { SupportAside } from './SupportAside'

interface Props {
  summaries: WorkoutSummary[]
  activeId: string | undefined
  globalFtp: number
  softNewWorkout?: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
}

export function Sidebar({
  summaries,
  activeId,
  globalFtp,
  softNewWorkout = false,
  onOpen,
  onNew,
  onDelete,
  onOpenSettings,
}: Props) {
  return (
    <aside className="sidebar" aria-label="Workout library">
      <header className="site-head">
        <p className="site-title">{SITE_NAME}</p>
        <p className="site-tag">{SITE_TAGLINE}</p>
        <p className="site-intro">
          Visual Zwift bike workouts—local library, AI assist, export.
        </p>
      </header>

      <div className="sidebar-actions">
        <button
          type="button"
          className={softNewWorkout ? 'ghost' : 'primary'}
          onClick={onNew}
          title={softNewWorkout ? 'Already on a blank workout' : undefined}
        >
          New workout
        </button>
        <button type="button" className="ghost" onClick={onOpenSettings}>
          Preferences
        </button>
      </div>

      <div className="sidebar-label">On this device</div>
      <ul className="workout-list">
        {summaries.map((item) => (
          <li key={item.id} className={item.id === activeId ? 'is-active' : ''}>
            <button type="button" className="workout-open" onClick={() => onOpen(item.id)}>
              <strong>{item.name || 'Untitled ride'}</strong>
              <small>
                {formatClock(item.durationSec)}
                {item.ftp !== globalFtp ? ` · FTP ${item.ftp}` : ''}
              </small>
            </button>
            {item.ftp !== globalFtp ? (
              <span className="ftp-dot" title={`Workout FTP ${item.ftp} W · global ${globalFtp} W`}>
                ≠
              </span>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete ${item.name}`}
              onClick={() => onDelete(item.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="local-notice" role="status">
        Workouts sync to the cloud via this library link — no account. Open Preferences to copy or
        restore your link.
      </div>

      <SupportAside />
    </aside>
  )
}
