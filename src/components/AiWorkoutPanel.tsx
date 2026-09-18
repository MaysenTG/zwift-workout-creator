import { useEffect, useMemo, useRef, useState } from 'react'
import { generateWorkoutFromPrompt, getGenerateWorkoutErrorInfo } from '../lib/api'
import { blocksFromAiPayload, isFreshAiWorkout, workoutToAiContext } from '../lib/aiBlocks'
import { summarizeAiWorkoutChange } from '../lib/workoutDiff'
import type { Workout, WorkoutBlock } from '../types'

const LOADING_STEPS = [
  'Reading your request…',
  'Planning intervals…',
  'Setting power targets…',
  'Balancing duration…',
  'Almost ready…',
]

interface Props {
  workout: Workout
  onApply: (patch: {
    name: string
    description: string
    blocks: WorkoutBlock[]
    ftp?: number
  }) => void
  onLoadingChange: (loading: boolean) => void
}

export function AiWorkoutPanel({ workout, onApply, onLoadingChange }: Props) {
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<{ title: string; message: string; hint?: string } | null>(
    null,
  )
  const [changeSummary, setChangeSummary] = useState<string[] | null>(null)

  const hasBlocks = workout.blocks.length > 0
  const prominent = !hasBlocks

  const placeholder = useMemo(
    () =>
      hasBlocks
        ? 'e.g. Make the intervals 10 seconds longer and add 5 min cooldown'
        : 'e.g. 45 minute sweet spot ride with 3×8 min at 92% FTP and easy spin between',
    [hasBlocks],
  )

  useEffect(() => {
    onLoadingChange(loading)
  }, [loading, onLoadingChange])

  useEffect(() => {
    if (prominent) {
      setOpen(true)
      promptRef.current?.focus()
    }
  }, [prominent, workout.id])

  useEffect(() => {
    if (!loading) {
      setStepIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % LOADING_STEPS.length)
    }, 2200)
    return () => window.clearInterval(timer)
  }, [loading])

  async function submit() {
    const text = prompt.trim()
    if (!text || loading) return

    setError(null)
    setChangeSummary(null)
    setLoading(true)

    const before = {
      name: workout.name,
      description: workout.description,
      ftp: workout.ftp,
      blocks: structuredClone(workout.blocks),
    }

    try {
      const result = await generateWorkoutFromPrompt(
        text,
        workout.ftp,
        isFreshAiWorkout(workout) ? undefined : workoutToAiContext(workout),
      )
      const blocks = blocksFromAiPayload(result.blocks)
      const name =
        result.name.trim() ||
        (isFreshAiWorkout(workout) ? 'Generated ride' : before.name.trim() || 'Untitled ride')
      const description =
        result.description.trim() || (isFreshAiWorkout(workout) ? '' : before.description)
      const after = {
        name,
        description,
        ftp: result.ftp ?? workout.ftp,
        blocks,
      }
      setChangeSummary(summarizeAiWorkoutChange(before, after))
      onApply({
        name,
        description,
        blocks,
        ...(result.ftp !== undefined ? { ftp: result.ftp } : {}),
      })
    } catch (err) {
      setError(getGenerateWorkoutErrorInfo(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      className={`ai-panel ${open ? 'is-open' : ''} ${loading ? 'is-loading' : ''} ${prominent ? 'ai-panel-prominent' : ''}`}
    >
      {prominent ? (
        <header className="ai-hero-head">
          <h2>Describe your workout</h2>
          <p>
            Start in plain English—warmup, intervals, cooldown—and we&apos;ll build the Zwift
            profile. You can drag blocks and tweak watts after.
          </p>
        </header>
      ) : (
        <button
          type="button"
          className="ai-panel-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="ai-panel-title">Natural language</span>
          <span className="ai-panel-chevron" aria-hidden />
        </button>
      )}

      {open ? (
        <div className="ai-panel-body">
          {!prominent ? (
            <p className="ai-panel-lead">
              Describe changes and the AI will rework this profile. You can still drag blocks after.
            </p>
          ) : null}

          <textarea
            ref={promptRef}
            className="ai-prompt"
            rows={prominent ? 5 : 3}
            value={prompt}
            disabled={loading}
            placeholder={placeholder}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit()
              }
            }}
          />

          <div className="ai-panel-foot">
            <span className="ai-hint">Ctrl+Enter to generate</span>
            <button
              type="button"
              className="primary ai-submit"
              disabled={loading || !prompt.trim()}
              onClick={() => void submit()}
            >
              {loading ? 'Generating…' : prominent ? 'Generate workout' : 'Generate'}
            </button>
          </div>

          {loading ? (
            <div className="ai-inline-loader" aria-live="polite">
              <div className="ai-bars" aria-hidden>
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
                ))}
              </div>
              <p>{LOADING_STEPS[stepIndex]}</p>
            </div>
          ) : null}

          {error ? (
            <div className="ai-error-panel" role="alert">
              <strong>{error.title}</strong>
              <p>{error.message}</p>
              {error.hint ? <p className="ai-error-hint">{error.hint}</p> : null}
            </div>
          ) : null}

          {changeSummary ? (
            <div className="ai-change-summary" role="status">
              <strong>What changed</strong>
              <ul>
                {changeSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
