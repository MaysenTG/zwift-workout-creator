import { useRef, useState } from 'react'
import { downloadZwo, parseZwo, workoutToZwo } from '../lib/zwo'
import { blockDuration, wattsFromPct } from '../lib/workout'
import type { Workout } from '../types'

interface Props {
  workout: Workout
  globalFtp: number
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onApplyGlobalFtp: () => void
  onImport: (workout: Workout) => void
}

export function TopBar({
  workout,
  globalFtp,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onApplyGlobalFtp,
  onImport,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kj = estimatedKj(workout)
  const ftpMismatch = workout.ftp !== globalFtp

  async function copyXml() {
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
        <h1>{workout.name || 'Untitled ride'}</h1>
        <p className="topbar-meta">
          Bike · {Math.round(kj)} kJ · FTP {workout.ftp} W
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
          <button type="button" className="ghost" onClick={() => void copyXml()}>
            {copied ? 'Copied' : 'Copy XML'}
          </button>
          <button type="button" className="primary" onClick={() => downloadZwo(workout)}>
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
