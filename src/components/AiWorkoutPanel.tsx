import { useEffect, useMemo, useState } from 'react'
import { generateWorkoutFromPrompt } from '../lib/api'
import { blocksFromAiPayload, workoutToAiContext } from '../lib/aiBlocks'
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
  onApply: (patch: { name: string; description: string; blocks: WorkoutBlock[] }) => void
  onLoadingChange: (loading: boolean) => void
}

export function AiWorkoutPanel({ workout, onApply, onLoadingChange }: Props) {
  const [open, setOpen] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [changeSummary, setChangeSummary] = useState<string[] | null>(null)

  const hasBlocks = workout.blocks.length > 0

  const placeholder = useMemo(
    () =>
      hasBlocks
        ? 'e.g. Make the intervals 10 seconds longer and add 5 min cooldown'
        : 'e.g. 45 minute sweet spot ride with 3×8 min at 92% and easy spin between',
    [hasBlocks],
  )

  useEffect(() => {
    onLoadingChange(loading)
  }, [loading, onLoadingChange])

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
      blocks: structuredClone(workout.blocks),
    }

    try {
      const result = await generateWorkoutFromPrompt(
        text,
        workout.ftp,
        hasBlocks ? workoutToAiContext(workout) : undefined,
      )
      const blocks = blocksFromAiPayload(result.blocks)
      const after = {
        name: result.name,
        description: result.description,
        blocks,
      }
      setChangeSummary(summarizeAiWorkoutChange(before, after))
      onApply(after)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={`ai-panel ${open ? 'is-open' : ''} ${loading ? 'is-loading' : ''}`}>
      <button
        type="button"
        className="ai-panel-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="ai-panel-title">Natural language</span>
        <span className="ai-panel-chevron" aria-hidden />
      </button>

      {open ? (
        <div className="ai-panel-body">
          <p className="ai-panel-lead">
            {hasBlocks
              ? 'Describe changes and the AI will rework this profile. You can still drag blocks after.'
              : 'Describe a ride and the AI will build the profile from scratch.'}
          </p>

          <textarea
            className="ai-prompt"
            rows={3}
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
              {loading ? 'Generating…' : 'Generate'}
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

          {error ? <p className="ai-error">{error}</p> : null}
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
