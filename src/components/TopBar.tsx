import { useEffect, useRef, useState } from 'react'
import { downloadZwo, parseZwo, workoutToZwo } from '../lib/zwo'
import { blockDuration, wattsFromPct } from '../lib/workout'
import { INTENSITY_LEVELS, type WorkoutIntensity } from '../lib/intensity'
import type { Workout } from '../types'

interface Props {
  workout: Workout
  globalFtp: number
  intensity: WorkoutIntensity | null
  intensityLoading?: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onApplyGlobalFtp: () => void
  onImport: (workout: Workout) => void
  onChangeName: (name: string) => void
}

export function TopBar({
  workout,
  globalFtp,
  intensity,
  intensityLoading = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onApplyGlobalFtp,
  onImport,
  onChangeName,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)

  const kj = estimatedKj(workout)
  const ftpMismatch = workout.ftp !== globalFtp
  const hasBlocks = workout.blocks.length > 0
  const displayName = workout.name.trim() || 'Untitled ride'

  useEffect(() => {
    if (editingName) nameInputRef.current?.select()
  }, [editingName])

  async function copyXml() {
    if (!hasBlocks) return
    await navigator.clipboard.writeText(workoutToZwo(workout))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function handleFile(file: File) {
    try {
      setError(null)
      const text = await file.text()
      onImport(parseZwo(text, workout.ftp))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-main">
        {editingName ? (
          <input
            ref={nameInputRef}
            className="topbar-name-input"
            value={workout.name}
            aria-label="Workout name"
            onChange={(e) => onChangeName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault()
                setEditingName(false)
              }
            }}
          />
        ) : (
          <h1>
            <button
              type="button"
              className="topbar-title-btn"
              onClick={() => setEditingName(true)}
              title="Rename workout"
            >
              {displayName}
            </button>
          </h1>
        )}
        <p className="topbar-meta">
          Bike · {Math.round(kj)} kJ · FTP {workout.ftp} W
          {intensityLoading && !intensity ? (
            <>
              {' '}
              ·{' '}
              <span className="intensity-pill intensity-loading" aria-busy="true" title="Rating difficulty…">
                <span className="intensity-meter" aria-hidden>
                  {INTENSITY_LEVELS.map((level) => (
                    <i key={level.id} />
                  ))}
                </span>
                Rating…
              </span>
            </>
          ) : intensity ? (
            <>
              {' '}
              ·{' '}
              <span
                className={`intensity-pill intensity-${intensity.level}${intensityLoading ? ' is-refreshing' : ''}`}
                title={
                  intensityLoading
                    ? 'Updating difficulty…'
                    : intensity.source === 'decisions'
                      ? `Difficulty rated by AI (${Math.round(intensity.confidence * 100)}% confidence)`
                      : 'Difficulty estimate (local)'
                }
              >
                <span className="intensity-meter" aria-hidden>
                  {INTENSITY_LEVELS.map((level, index) => (
                    <i
                      key={level.id}
                      className={index <= Math.round(intensity.score) ? 'is-on' : ''}
                    />
                  ))}
                </span>
                {intensity.label}
              </span>
            </>
          ) : null}
        </p>
        {ftpMismatch ? (
          <p className="ftp-banner">
            This file uses {workout.ftp} W FTP; your default is {globalFtp} W.{' '}
            <button type="button" className="link-btn" onClick={onApplyGlobalFtp}>
              Switch to {globalFtp} W
            </button>
          </p>
        ) : null}
        {error ? <p className="topbar-error">{error}</p> : null}
      </div>

      <div className="topbar-toolbar">
        <div className="toolbar-group" role="group" aria-label="History">
          <button
            type="button"
            className="ghost"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="ghost"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
        </div>
        <div className="toolbar-group" role="group" aria-label="File">
          <input
            ref={fileRef}
            type="file"
            accept=".zwo,application/xml,text/xml"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ''
            }}
          />
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void copyXml()}
            disabled={!hasBlocks}
            title={hasBlocks ? undefined : 'Add blocks before copying'}
          >
            {copied ? 'Copied' : 'Copy XML'}
          </button>
          <button
            type="button"
            className={hasBlocks ? 'primary' : 'ghost'}
            onClick={() => downloadZwo(workout)}
            disabled={!hasBlocks}
            title={hasBlocks ? undefined : 'Add blocks before exporting'}
          >
            Export for Zwift
          </button>
        </div>
      </div>
    </header>
  )
}

function estimatedKj(workout: Workout): number {
  let joules = 0
  for (const block of workout.blocks) {
    if (block.type === 'steady') {
      joules += wattsFromPct(block.powerPct, workout.ftp) * block.durationSec
    } else if (block.type === 'freeride') {
      joules += wattsFromPct(50, workout.ftp) * block.durationSec
    } else if (block.type === 'intervals') {
      const on = wattsFromPct(block.onPct, workout.ftp) * block.onDurationSec
      const off = wattsFromPct(block.offPct, workout.ftp) * block.offDurationSec
      joules += block.repeat * (on + off)
    } else {
      const avg = wattsFromPct((block.startPct + block.endPct) / 2, workout.ftp)
      joules += avg * blockDuration(block)
    }
  }
  return joules / 1000
}
