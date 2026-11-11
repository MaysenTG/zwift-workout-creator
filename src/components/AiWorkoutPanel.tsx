import { useEffect, useMemo, useRef, useState } from 'react'
import {
  generateWorkoutFromPrompt,
  getGenerateWorkoutErrorInfo,
  type ClarifyingQuestion,
} from '../lib/api'
import { createAiAuditEntry, formatAuditTime } from '../lib/aiAudit'
import { blocksFromAiPayload, isFreshAiWorkout, workoutToAiContext } from '../lib/aiBlocks'
import { summarizeAiWorkoutChange } from '../lib/workoutDiff'
import type { Workout, WorkoutAiAuditEntry, WorkoutBlock } from '../types'

const LOADING_STEPS = [
  'Reading your request…',
  'Checking for missing details…',
  'Planning intervals…',
  'Setting power targets…',
  'Almost ready…',
]

type ClarifyingAnswer = {
  /** Selected preset option, or null when using free text / unanswered. */
  option: string | null
  /** True when the rider chose "Other" (or the question has no options). */
  useOther: boolean
  other: string
}

interface Props {
  workout: Workout
  onApply: (patch: {
    name: string
    description: string
    blocks: WorkoutBlock[]
    ftp?: number
    aiAuditEntry: WorkoutAiAuditEntry
  }) => void
  onLoadingChange: (loading: boolean) => void
}

function emptyAnswers(questions: ClarifyingQuestion[]): ClarifyingAnswer[] {
  return questions.map((q) => ({
    option: null,
    useOther: q.options.length === 0,
    other: '',
  }))
}

function answerResolved(answer: ClarifyingAnswer): boolean {
  if (answer.useOther) return answer.other.trim().length > 0
  return Boolean(answer.option?.trim())
}

function answerText(answer: ClarifyingAnswer): string {
  if (answer.useOther) return answer.other.trim()
  return answer.option?.trim() ?? ''
}

export function AiWorkoutPanel({ workout, onApply, onLoadingChange }: Props) {
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const userToggledOpenRef = useRef(false)
  const [open, setOpen] = useState(() => workout.blocks.length === 0)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<{ title: string; message: string; hint?: string } | null>(
    null,
  )
  const [changeSummary, setChangeSummary] = useState<string[] | null>(null)
  const [clarifying, setClarifying] = useState<{
    originalPrompt: string
    questions: ClarifyingQuestion[]
  } | null>(null)
  const [clarifyingAnswers, setClarifyingAnswers] = useState<ClarifyingAnswer[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const hasBlocks = workout.blocks.length > 0
  const prominent = !hasBlocks
  const aiHistory = workout.aiHistory ?? []
  const clarificationsReady =
    Boolean(clarifying) &&
    clarifyingAnswers.length === (clarifying?.questions.length ?? 0) &&
    clarifyingAnswers.every(answerResolved)

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
    userToggledOpenRef.current = false
    setOpen(workout.blocks.length === 0)
    setChangeSummary(null)
    setError(null)
    setClarifying(null)
    setClarifyingAnswers([])
    setHistoryOpen(false)
  }, [workout.id])

  useEffect(() => {
    if (prominent) {
      setOpen(true)
      promptRef.current?.focus()
      return
    }
    if (!userToggledOpenRef.current) {
      setOpen(false)
    }
  }, [prominent, workout.blocks.length])

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

  async function runGenerate(
    text: string,
    options?: {
      resolvedClarifications?: boolean
      clarifications?: { question: string; answer: string }[]
      originalPrompt?: string
    },
  ) {
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
        {
          resolvedClarifications: options?.resolvedClarifications,
          clarifications: options?.clarifications,
        },
      )

      if (result.status === 'clarifying' && result.questions?.length) {
        // Never reopen clarify after the rider already answered.
        if (options?.resolvedClarifications) {
          throw new Error('Still needed more detail after your answers. Try a more specific request.')
        }
        setClarifying({
          originalPrompt: options?.originalPrompt || clarifying?.originalPrompt || text,
          questions: result.questions,
        })
        setClarifyingAnswers(emptyAnswers(result.questions))
        userToggledOpenRef.current = true
        setOpen(true)
        return
      }

      setClarifying(null)
      setClarifyingAnswers([])
      setPrompt('')
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
      const changes = summarizeAiWorkoutChange(before, after)
      const promptForLog = (options?.originalPrompt || text).trim()
      const aiAuditEntry = createAiAuditEntry({
        kind: before.blocks.length === 0 ? 'create' : 'edit',
        prompt: promptForLog,
        clarifications: options?.clarifications,
        changes,
      })
      setChangeSummary(changes)
      userToggledOpenRef.current = true
      setOpen(true)
      onApply({
        name,
        description,
        blocks,
        ...(result.ftp !== undefined ? { ftp: result.ftp } : {}),
        aiAuditEntry,
      })
    } catch (err) {
      setError(getGenerateWorkoutErrorInfo(err))
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    const text = prompt.trim()
    if (!text) return
    setClarifying(null)
    setClarifyingAnswers([])
    await runGenerate(text)
  }

  async function submitClarifications() {
    if (!clarifying || !clarificationsReady) return
    const clarifications = clarifying.questions.map((q, i) => ({
      question: q.prompt,
      answer: answerText(clarifyingAnswers[i]!),
    }))
    await runGenerate(clarifying.originalPrompt, {
      resolvedClarifications: true,
      clarifications,
      originalPrompt: clarifying.originalPrompt,
    })
  }

  function updateAnswer(index: number, patch: Partial<ClarifyingAnswer>) {
    setClarifyingAnswers((prev) =>
      prev.map((answer, i) => (i === index ? { ...answer, ...patch } : answer)),
    )
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
          onClick={() => {
            userToggledOpenRef.current = true
            setOpen((v) => !v)
          }}
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

          {clarifying ? (
            <div className="ai-clarify" role="status">
              <strong>A few details before generating</strong>
              <p className="ai-clarify-lead">Tap an option — or Other to type your own.</p>
              <ul className="ai-clarify-list">
                {clarifying.questions.map((question, index) => {
                  const answer = clarifyingAnswers[index] ?? {
                    option: null,
                    useOther: question.options.length === 0,
                    other: '',
                  }
                  return (
                    <li key={`${index}-${question.prompt}`} className="ai-clarify-item">
                      <p className="ai-clarify-prompt">{question.prompt}</p>
                      {question.options.length > 0 ? (
                        <div className="ai-clarify-options" role="group" aria-label={question.prompt}>
                          {question.options.map((option) => {
                            const selected = !answer.useOther && answer.option === option
                            return (
                              <button
                                key={option}
                                type="button"
                                className={`ai-clarify-option ${selected ? 'is-selected' : ''}`}
                                disabled={loading}
                                aria-pressed={selected}
                                onClick={() =>
                                  updateAnswer(index, {
                                    option,
                                    useOther: false,
                                    other: '',
                                  })
                                }
                              >
                                {option}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            className={`ai-clarify-option ${answer.useOther ? 'is-selected' : ''}`}
                            disabled={loading}
                            aria-pressed={answer.useOther}
                            onClick={() =>
                              updateAnswer(index, { option: null, useOther: true })
                            }
                          >
                            Other
                          </button>
                        </div>
                      ) : null}
                      {answer.useOther ? (
                        <input
                          type="text"
                          className="ai-clarify-other"
                          value={answer.other}
                          disabled={loading}
                          placeholder={
                            question.options.length > 0
                              ? 'Type your own answer…'
                              : 'Your answer…'
                          }
                          onChange={(e) =>
                            updateAnswer(index, {
                              option: null,
                              useOther: true,
                              other: e.target.value,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault()
                              void submitClarifications()
                            }
                          }}
                        />
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              <div className="ai-panel-foot">
                <button
                  type="button"
                  className="ghost"
                  disabled={loading}
                  onClick={() => {
                    setClarifying(null)
                    setClarifyingAnswers([])
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary ai-submit"
                  disabled={loading || !clarificationsReady}
                  onClick={() => void submitClarifications()}
                >
                  {loading ? 'Generating…' : 'Continue'}
                </button>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

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

          {aiHistory.length > 0 ? (
            <div className="ai-audit">
              <button
                type="button"
                className="ai-audit-toggle"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <span>
                  Prompt history
                  <span className="ai-audit-count">{aiHistory.length}</span>
                </span>
                <span
                  className={`ai-panel-chevron${historyOpen ? ' is-flipped' : ''}`}
                  aria-hidden
                />
              </button>
              {historyOpen ? (
                <ol className="ai-audit-list">
                  {[...aiHistory].reverse().map((entry) => (
                    <li key={entry.id} className="ai-audit-item">
                      <div className="ai-audit-meta">
                        <span className="ai-audit-kind">
                          {entry.kind === 'create' ? 'Created' : 'Edited'}
                        </span>
                        <time dateTime={new Date(entry.at).toISOString()}>
                          {formatAuditTime(entry.at)}
                        </time>
                      </div>
                      <p className="ai-audit-prompt">{entry.prompt}</p>
                      {entry.clarifications?.length ? (
                        <ul className="ai-audit-clarifications">
                          {entry.clarifications.map((c) => (
                            <li key={`${entry.id}-${c.question}`}>
                              <span className="ai-audit-q">{c.question}</span>
                              <span className="ai-audit-a">{c.answer}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {entry.changes.length > 0 ? (
                        <ul className="ai-audit-changes">
                          {entry.changes.map((line) => (
                            <li key={`${entry.id}-${line}`}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
