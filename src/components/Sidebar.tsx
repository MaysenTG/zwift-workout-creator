import { formatClock } from '../lib/time'
import type { WorkoutSummary } from '../types'

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
    <aside className="sidebar">
      <header className="site-head">
        <h1 className="site-title">ZWO Builder</h1>
        <p className="site-tag">Custom Zwift bike workouts</p>
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
    </aside>
  )
}
