import { formatClock } from '../lib/time'
import { SITE_NAME, SITE_TAGLINE } from '../lib/site'
import type { WorkoutSummary } from '../types'
import { SupportAside } from './SupportAside'

interface Props {
  summaries: WorkoutSummary[]
  activeId: string | undefined
  globalFtp: number
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
}

export function Sidebar({
  summaries,
  activeId,
  globalFtp,
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
          Build custom Zwift bike workouts in your browser—visual power editor, local library, AI
          assist, and export for Zwift.
        </p>
      </header>

      <div className="sidebar-actions">
        <button type="button" className="primary" onClick={onNew}>
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
        Workouts are stored locally in this browser. They are not synced to other devices or
        accounts.
      </div>

      <SupportAside />
    </aside>
  )
}
