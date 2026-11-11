export interface Env {
  OPENAI_API_KEY: string
  /** Comma-separated origins, e.g. https://zwo-builder.pages.dev */
  ALLOWED_ORIGINS?: string
  /** Cloudflare Workers Rate Limit binding */
  GENERATE_RATE_LIMIT?: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>
  }
  /** Per–backup-code workout library (Durable Object) */
  LIBRARY: DurableObjectNamespace
}

export { LibraryDO } from './libraryDo'

type ClarificationAnswer = {
  question: string
  answer: string
}

type GenerateRequest = {
  prompt: string
  ftp: number
  /** When true, skip ambiguity routing and generate from prompt + clarifications. */
  resolvedClarifications?: boolean
  clarifications?: ClarificationAnswer[]
  current?: {
    name: string
    description: string
    ftp?: number
    blocks: unknown[]
  }
}

type ClarifyingQuestion = {
  prompt: string
  options: string[]
}

type GeneratedWorkout = {
  status: 'workout' | 'clarifying'
  name: string
  description: string
  ftp?: number
  blocks: unknown[]
  questions: ClarifyingQuestion[]
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

const nullableCadence = {
  anyOf: [{ type: 'number' }, { type: 'null' }],
  description: 'Cadence target in rpm, or null if not specified',
} as const

const nullableDurationSec = {
  anyOf: [{ type: 'number' }, { type: 'null' }],
  description: 'Seconds the cue stays on screen in Zwift, or null for default (~10s)',
} as const

/** On-screen Zwift `<textevent>` cues nested under a block. */
const textsField = {
  type: 'array',
  description:
    'On-screen text overlays for this block (Zwift textevents). Use [] when none. Prefer short coaching cues at useful offsets.',
  items: {
    type: 'object',
    properties: {
      timeOffsetSec: {
        type: 'number',
        description: 'Seconds from the start of this block (0 = start)',
      },
      message: {
        type: 'string',
        description: 'Short on-screen message shown in Zwift',
      },
      durationSec: nullableDurationSec,
    },
    required: ['timeOffsetSec', 'message', 'durationSec'],
    additionalProperties: false,
  },
} as const

/** OpenAI Structured Outputs — model must return this exact JSON shape. */
const WORKOUT_JSON_SCHEMA = {
  name: 'zwo_workout',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['workout', 'clarifying'],
        description:
          'workout = full profile ready; clarifying = ask questions instead of inventing missing details',
      },
      name: { type: 'string', description: 'Short workout title (placeholder OK when clarifying)' },
      description: {
        type: 'string',
        description: 'One or two sentences: goal, intensity, duration feel',
      },
      ftp: {
        type: 'number',
        description:
          'Workout FTP in watts (50–600). Use the rider FTP from the prompt unless the user asks to change it.',
      },
      questions: {
        type: 'array',
        description:
          'Clarifying questions when status is clarifying; empty array when status is workout',
        items: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Short concrete question for the rider',
            },
            options: {
              type: 'array',
              items: { type: 'string' },
              description:
                '2–5 short selectable answers (preferred). Use [] only when free text is truly required.',
            },
          },
          required: ['prompt', 'options'],
          additionalProperties: false,
        },
      },
      blocks: {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'steady' },
                durationSec: { type: 'number' },
                powerPct: { type: 'number' },
                cadence: nullableCadence,
                texts: textsField,
              },
              required: ['type', 'durationSec', 'powerPct', 'cadence', 'texts'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['warmup', 'cooldown', 'ramp'] },
                durationSec: { type: 'number' },
                startPct: { type: 'number' },
                endPct: { type: 'number' },
                cadence: nullableCadence,
                texts: textsField,
              },
              required: ['type', 'durationSec', 'startPct', 'endPct', 'cadence', 'texts'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'intervals' },
                repeat: { type: 'number' },
                onDurationSec: { type: 'number' },
                offDurationSec: { type: 'number' },
                onPct: { type: 'number' },
                offPct: { type: 'number' },
                cadence: nullableCadence,
                cadenceResting: nullableCadence,
                texts: textsField,
              },
              required: [
                'type',
                'repeat',
                'onDurationSec',
                'offDurationSec',
                'onPct',
                'offPct',
                'cadence',
                'cadenceResting',
                'texts',
              ],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'freeride' },
                durationSec: { type: 'number' },
                cadence: nullableCadence,
                texts: textsField,
              },
              required: ['type', 'durationSec', 'cadence', 'texts'],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ['status', 'name', 'description', 'ftp', 'questions', 'blocks'],
    additionalProperties: false,
  },
} as const

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true }, 200, cors)
    }

    if (url.pathname === '/api/generate-workout' && request.method === 'POST') {
      return handleGenerate(request, env, cors)
    }

    if (url.pathname === '/api/library' && (request.method === 'GET' || request.method === 'PUT')) {
      return handleLibrary(request, env, cors)
    }

    if (url.pathname === '/api/score-intensity' && request.method === 'POST') {
      return handleScoreIntensity(request, env, cors)
    }

    return json({ error: 'Not found' }, 404, cors)
  },
}

const INTENSITY_LEVELS = [
  { label: 'easy', description: 'Recovery or very easy endurance; little fatigue cost' },
  { label: 'moderate', description: 'Steady aerobic work; sustainable for most riders' },
  { label: 'challenging', description: 'Tempo / sweet spot load; noticeable fatigue' },
  { label: 'hard', description: 'Threshold or hard VO2 sessions; demanding' },
  { label: 'brutal', description: 'Very hard race-sim / stacked high-intensity; extreme' },
] as const

type IntensityScoreResult = {
  level: string
  label: string
  score: number
  confidence: number
  source: 'decisions'
}

/** Isolate-local cache so identical workouts don't re-hit OpenAI. */
const intensityScoreCache = new Map<string, IntensityScoreResult>()
const INTENSITY_CACHE_MAX = 80

function intensityCacheKey(workout: { ftp: number; blocks: unknown[] }): string {
  // Name is cosmetic — score from structure + FTP only.
  return JSON.stringify({ ftp: workout.ftp, blocks: workout.blocks })
}

async function handleScoreIntensity(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY is not configured on the worker.' }, 503, cors)
  }

  let body: { ftp?: number; name?: string; blocks?: unknown[] }
  try {
    body = (await request.json()) as { ftp?: number; name?: string; blocks?: unknown[] }
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, cors)
  }

  if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
    return json(
      {
        level: 'easy',
        label: 'Easy',
        score: 0,
        confidence: 1,
        source: 'decisions',
      },
      200,
      cors,
    )
  }

  const ftp = Number.isFinite(body.ftp) ? Number(body.ftp) : 200
  const payload = {
    name: typeof body.name === 'string' ? body.name : '',
    ftp,
    blocks: body.blocks,
  }
  const cacheKey = intensityCacheKey(payload)
  const cached = intensityScoreCache.get(cacheKey)
  if (cached) {
    return json(cached, 200, cors)
  }

  try {
    const scored = await scoreIntensityWithDecisions(payload, env.OPENAI_API_KEY)
    if (intensityScoreCache.size >= INTENSITY_CACHE_MAX) {
      const oldest = intensityScoreCache.keys().next().value
      if (oldest !== undefined) intensityScoreCache.delete(oldest)
    }
    intensityScoreCache.set(cacheKey, scored)
    return json(scored, 200, cors)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Intensity scoring failed.'
    return json({ error: message }, 502, cors)
  }
}

async function scoreIntensityWithDecisions(
  workout: { name: string; ftp: number; blocks: unknown[] },
  apiKey: string,
): Promise<IntensityScoreResult> {
  const response = await fetch('https://api.openai.com/v1/decisions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      input: [
        {
          role: 'developer',
          content:
            'You rate indoor cycling / Zwift workout difficulty for a typical trained amateur. Consider duration, %FTP targets, interval structure, density of hard efforts, and recovery. Warmups/cooldowns matter less than the main set.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Rate how difficult this bike workout is overall.',
            },
            {
              type: 'input_json',
              data: workout,
            },
          ],
        },
      ],
      questions: [
        {
          type: 'score',
          name: 'intensity',
          instructions:
            'Score overall workout difficulty for a typical trained amateur cyclist completing this indoor session.',
          levels: INTENSITY_LEVELS.map((level) => ({
            label: level.label,
            description: level.description,
          })),
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Decisions API error (${response.status}): ${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    answers?: Array<{
      type?: string
      name?: string | null
      score?: number
      confidence?: number
      probabilities?: Array<{ label?: string; probability?: number; value?: number }>
    }>
  }

  const answer = data.answers?.find((a) => a.name === 'intensity') ?? data.answers?.[0]
  if (!answer || answer.type !== 'score' || typeof answer.score !== 'number') {
    throw new Error('Decisions API returned no intensity score.')
  }

  const score = Math.max(0, Math.min(INTENSITY_LEVELS.length - 1, answer.score))
  const index = Math.round(score)
  const level = INTENSITY_LEVELS[index] ?? INTENSITY_LEVELS[0]!
  const label = level.label.charAt(0).toUpperCase() + level.label.slice(1)

  return {
    level: level.label,
    label,
    score,
    confidence: typeof answer.confidence === 'number' ? answer.confidence : 0.7,
    source: 'decisions',
  }
}

const LIBRARY_KEY_RE = /^[a-z0-9]{16,64}$/

async function handleLibrary(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const key = libraryKeyFromRequest(request)
  if (!key) {
    return json(
      { error: 'Missing or invalid library key. Send X-Library-Key with your backup code.' },
      401,
      cors,
    )
  }

  const id = env.LIBRARY.idFromName(key)
  const stub = env.LIBRARY.get(id)
  const upstream = await stub.fetch(request)
  const body = await upstream.text()
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...cors,
      'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    },
  })
}

function libraryKeyFromRequest(request: Request): string | null {
  const raw =
    request.headers.get('x-library-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    ''
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return LIBRARY_KEY_RE.test(key) ? key : null
}

async function handleGenerate(
  request: Request,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return json(
      { error: 'OPENAI_API_KEY is not configured on the worker.' },
      503,
      cors,
    )
  }

  let body: GenerateRequest
  try {
    body = (await request.json()) as GenerateRequest
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400, cors)
  }

  if (!body.prompt?.trim()) {
    return json({ error: 'prompt is required.' }, 400, cors)
  }
  if (!Number.isFinite(body.ftp) || body.ftp < 50 || body.ftp > 600) {
    return json({ error: 'ftp must be between 50 and 600.' }, 400, cors)
  }

  if (env.GENERATE_RATE_LIMIT) {
    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'anonymous'
    const { success } = await env.GENERATE_RATE_LIMIT.limit({ key: ip })
    if (!success) {
      return json(
        { error: 'Too many requests. Wait a minute and try again.' },
        429,
        cors,
      )
    }
  }

  const current =
    body.current && Array.isArray(body.current.blocks) ? body.current : undefined
  const clarifications = normalizeClarificationAnswers(body.clarifications)
  const answersResolved =
    body.resolvedClarifications === true || clarifications.length > 0

  try {
    const prompt = body.prompt.trim()
    const apiKey = env.OPENAI_API_KEY

    // After the rider answered clarifying questions, never re-ask — generate.
    if (!answersResolved) {
      const route = await decidePromptRoute(prompt, body.ftp, apiKey, current)
      if (route === 'clarify') {
        const questions = await generateClarifyingQuestions(prompt, body.ftp, apiKey, current)
        if (questions.length === 0) {
          return json(
            { error: 'Clarification was needed but no questions were returned.' },
            502,
            cors,
          )
        }
        return json(
          {
            status: 'clarifying',
            questions,
            name: '',
            description: '',
            blocks: [],
          },
          200,
          cors,
        )
      }
    }

    const generated = await callOpenAI(prompt, body.ftp, apiKey, current, clarifications)

    // Safety net: if the model still tries to clarify after answers, force generate once.
    if (generated.status === 'clarifying') {
      if (answersResolved) {
        const forced = await callOpenAI(
          prompt,
          body.ftp,
          apiKey,
          current,
          clarifications,
          true,
        )
        if (forced.status === 'clarifying' || validateBlocks(forced.blocks).length === 0) {
          return json(
            { error: 'Could not build the workout from your answers. Try again.' },
            502,
            cors,
          )
        }
        const blocks = validateBlocks(forced.blocks)
        const response: Record<string, unknown> = {
          status: 'workout',
          name: forced.name || 'Generated ride',
          description: forced.description || '',
          blocks,
          questions: [],
        }
        const ftpOut = validateFtpOptional(forced.ftp) ?? body.ftp
        if (ftpOut !== body.ftp) response.ftp = ftpOut
        return json(response, 200, cors)
      }

      const questions = normalizeClarifyingQuestions(generated.questions)
      if (questions.length === 0) {
        return json(
          { error: 'Model asked for clarification but returned no questions.' },
          502,
          cors,
        )
      }
      return json(
        {
          status: 'clarifying',
          questions,
          name: generated.name || '',
          description: generated.description || '',
          blocks: [],
        },
        200,
        cors,
      )
    }

    const blocks = validateBlocks(generated.blocks)
    if (blocks.length === 0) {
      return json({ error: 'Model returned no valid workout blocks.' }, 502, cors)
    }
    const response: Record<string, unknown> = {
      status: 'workout',
      name: generated.name || 'Generated ride',
      description: generated.description || '',
      blocks,
      questions: [],
    }
    const ftpOut = validateFtpOptional(generated.ftp) ?? body.ftp
    if (ftpOut !== body.ftp) response.ftp = ftpOut

    return json(response, 200, cors)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed.'
    return json({ error: message }, 502, cors)
  }
}

/** Only treat as clarify when Decisions is reasonably sure clarification is needed. */
/** Edit: clarify when fairly sure the target is unclear. Create: only clarify when very sure. */
const CLARIFY_CONFIDENCE_FLOOR_EDIT = 0.65
const CLARIFY_CONFIDENCE_FLOOR_CREATE = 0.85

type PromptRoute = 'clarify' | 'generate'

/**
 * Use OpenAI Decisions API to judge whether the rider request is specific enough
 * in context of the current workout (if any). Falls back to a chat decision if
 * Decisions is unavailable for the account/key.
 */
async function decidePromptRoute(
  prompt: string,
  ftp: number,
  apiKey: string,
  current?: GenerateRequest['current'],
): Promise<PromptRoute> {
  try {
    return await decidePromptRouteWithDecisions(prompt, ftp, apiKey, current)
  } catch {
    return decidePromptRouteWithChat(prompt, ftp, apiKey, current)
  }
}

async function decidePromptRouteWithDecisions(
  prompt: string,
  ftp: number,
  apiKey: string,
  current?: GenerateRequest['current'],
): Promise<PromptRoute> {
  const mode = current ? 'edit_existing_workout' : 'create_new_workout'
  const response = await fetch('https://api.openai.com/v1/decisions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-6-luna',
      input: [
        {
          role: 'developer',
          content: `You route indoor cycling / Zwift workout requests. Prefer generate.

CREATE (no current workout, or building from scratch):
- Generate when duration and intent/intensity are clear enough for a coach to build a sensible session.
- Examples that MUST generate: "45 mins easy", "1 hour sweet spot", "VO2 5x3", "recovery spin 40 minutes", "threshold 3x10".
- FTP is already provided in context — do not clarify for FTP unless the rider explicitly asks to set/change it and gives no value.
- Ordinary words like easy / hard / endurance / tempo / sweet spot are enough to choose zones; do not clarify those.
- Clarify create prompts only when almost nothing actionable is present (e.g. "workout please", "make me something").

EDIT (current workout present):
- Clarify when the target of a relative change is unclear — e.g. "make interval longer" / "more" / "harder" / "longer" without saying which block(s) or how much.
- Generate when the edit names what to change and enough detail to apply (e.g. "add 5 min to cooldown", "make the VO2 intervals 10s longer", "bump work bouts +5%").
- If clarifying Q&A was already answered in the prompt, always generate.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Rider request:\n${prompt}`,
            },
            {
              type: 'input_json',
              data: {
                mode,
                ftp,
                currentWorkout: current ?? null,
              },
            },
          ],
        },
      ],
      questions: [
        {
          type: 'choice',
          name: 'route',
          instructions:
            'Prefer generate. Choose clarify only when an edit target is unclear (which block / how much) or a create request has no usable duration/intent. Do not clarify for FTP, or for ordinary intensity words like easy/hard when duration is given.',
          choices: [
            {
              value: 'clarify',
              description:
                'Need to know which part to change or a missing critical create detail (not FTP; not “easy/hard” alone when time is given)',
            },
            {
              value: 'generate',
              description:
                'Enough to build or edit — e.g. “45 mins easy”, named structure, or a clear targeted edit',
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Decisions API error (${response.status}): ${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    answers?: Array<{
      type?: string
      name?: string | null
      choice?: string | boolean
      confidence?: number
    }>
  }
  const answer = data.answers?.find((a) => a.name === 'route') ?? data.answers?.[0]
  if (!answer || answer.type === 'refusal') {
    throw new Error('Decisions API refused or returned no route answer.')
  }
  if (answer.type !== 'choice') {
    throw new Error('Decisions API returned an unexpected answer type.')
  }

  const choice = String(answer.choice)
  const confidence = typeof answer.confidence === 'number' ? answer.confidence : 1
  const floor = current ? CLARIFY_CONFIDENCE_FLOOR_EDIT : CLARIFY_CONFIDENCE_FLOOR_CREATE
  // Bias toward generate — especially for create prompts like "45 mins easy".
  if (choice === 'clarify' && confidence >= floor) return 'clarify'
  return 'generate'
}

const ROUTE_JSON_SCHEMA = {
  name: 'prompt_route',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      route: {
        type: 'string',
        enum: ['clarify', 'generate'],
        description:
          'clarify = ask questions first; generate = request is specific enough to build/update now',
      },
    },
    required: ['route'],
    additionalProperties: false,
  },
} as const

async function decidePromptRouteWithChat(
  prompt: string,
  ftp: number,
  apiKey: string,
  current?: GenerateRequest['current'],
): Promise<PromptRoute> {
  const mode = current ? 'edit' : 'create'
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: ROUTE_JSON_SCHEMA,
      },
      messages: [
        {
          role: 'system',
          content:
            'Route Zwift bike workout prompts. Prefer generate. CREATE: generate for prompts like "45 mins easy", "1hr sweet spot", "VO2 5x3" — FTP is provided; easy/hard/endurance are enough intensity. Clarify create only when almost no usable detail exists. EDIT: clarify when the target is unclear ("make interval longer", "more", "harder" without which block/how much). Generate clear targeted edits. If clarifying Q&A was already answered, generate.',
        },
        {
          role: 'user',
          content: `Mode: ${mode}. FTP: ${ftp} W.
${current ? `Current workout JSON:\n${JSON.stringify(current)}\n\n` : ''}Rider request:\n${prompt}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Route decision failed (${response.status}): ${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as OpenAiChatCompletion
  const content = data.choices?.[0]?.message?.content
  if (!content?.trim()) throw new Error('Empty route decision from OpenAI.')
  const parsed = parseModelJsonContent(content) as { route?: string }
  // Prefer generate on ambiguous/unexpected chat output.
  return parsed.route === 'clarify' ? 'clarify' : 'generate'
}

const CLARIFY_QUESTIONS_SCHEMA = {
  name: 'clarifying_questions',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        description: '1–3 tap-to-answer clarifying questions',
        items: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Short concrete question the rider can answer by tapping an option',
            },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 5,
              items: { type: 'string' },
              description:
                '2–5 complete selectable answers (never empty). Each option must be a full usable answer.',
            },
          },
          required: ['prompt', 'options'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
} as const

async function generateClarifyingQuestions(
  prompt: string,
  ftp: number,
  apiKey: string,
  current?: GenerateRequest['current'],
): Promise<ClarifyingQuestion[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: CLARIFY_QUESTIONS_SCHEMA,
      },
      messages: [
        {
          role: 'system',
          content: `You write clarifying questions for a Zwift bike workout builder UI with tappable chips.

Rules:
- Ask only what blocks the edit (usually 1–2 questions). Prefer which block/section and how much.
- Every question MUST include 2–5 concrete selectable options tied to the current workout when provided (e.g. "VO2 intervals", "Steady main set", "+5% FTP", "+2 min each work bout").
- Never ask for FTP (it is already known), cadence, text alerts, author, or yes/no / "none" / "0" fillers.
- Do not invent a workout. Questions only.`,
        },
        {
          role: 'user',
          content: `FTP: ${ftp} W.
${current ? `Current workout JSON:\n${JSON.stringify(current)}\n\n` : ''}Ambiguous rider request:\n${prompt}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Clarifying questions failed (${response.status}): ${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as OpenAiChatCompletion
  const content = data.choices?.[0]?.message?.content
  if (!content?.trim()) throw new Error('Empty clarifying questions from OpenAI.')
  const parsed = parseModelJsonContent(content) as { questions?: unknown }
  return normalizeClarifyingQuestions(parsed.questions).filter((q) => q.options.length >= 2)
}

function normalizeClarificationAnswers(raw: unknown): ClarificationAnswer[] {
  if (!Array.isArray(raw)) return []
  const out: ClarificationAnswer[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const obj = item as Record<string, unknown>
    const question = typeof obj.question === 'string' ? obj.question.trim() : ''
    const answer = typeof obj.answer === 'string' ? obj.answer.trim() : ''
    if (!question || !answer) continue
    out.push({ question, answer })
  }
  return out.slice(0, 8)
}

async function callOpenAI(
  prompt: string,
  ftp: number,
  apiKey: string,
  current?: GenerateRequest['current'],
  clarifications: ClarificationAnswer[] = [],
  forceWorkout = false,
): Promise<GeneratedWorkout> {
  const hasAnswers = clarifications.length > 0
  const system = `You are an expert indoor cycling coach building structured Zwift bike workouts (.zwo format). Output JSON only.

Context:
- Workouts are a timeline of power targets as % of the rider's FTP (functional threshold power). 100% ≈ one-hour max sustainable power. The app converts % to watts using the workout FTP.
- Typical session shape: progressive warmup → main set (steady state and/or intervals) → cooldown. Match total duration and intensity to the user's goal.
- Power zones (% FTP): Z1 recovery 0–55%; Z2 endurance 55–75%; Z3 tempo 75–90%; Z4 threshold/sweet spot ~88–105%; Z5 VO2max 105–120%; Z6+ short anaerobic/sprints (use sparingly).
- Common formats: endurance (long Z2); tempo (Z3 blocks); sweet spot (88–94% sustained or repeats); threshold (95–105%); VO2 intervals (106–120% work with equal or longer recovery); over-unders; cadence drills; recovery spins (Z1–low Z2).
- Intervals: use recovery "off" at 50–65% unless the user asks otherwise; size repeat count and work duration for the requested time and difficulty; avoid unrealistic stack of high-intensity blocks without recovery.
- Use "freeride" only when the user wants unstructured riding or open-ended segments; otherwise prefer explicit power blocks.
- Cadence is optional rpm (null when not specified). For intervals, cadence = work, cadenceResting = recovery.
- Text overlays: each block has "texts" — short on-screen Zwift cues ({ timeOffsetSec, message, durationSec|null }). Use sparingly for coaching moments (start of work bout, "1 min left", form reminders). Use [] when none. Preserve existing texts on edit unless the rider asks to change/remove them or the block timing makes them wrong.

Routing:
${
  forceWorkout || hasAnswers
    ? `- The rider already answered clarifying questions. You MUST set status to "workout", questions to [], and return the full blocks. Do not ask more questions.`
    : `- Ambiguity is decided upstream. Prefer status "workout" with a full block list and questions [].
- Only set status "clarifying" if you still cannot build the profile without guessing; then leave blocks [] and put 1–3 questions with 2–5 selectable options each.`
}
- You may change any part of the workout the rider asks for (structure, power, duration, cadence, text overlays). Prefer targeted edits over rewriting everything.
- For create prompts like "45 mins easy", use the provided FTP and a sensible easy Z1–Z2 session (warmup / steady / cooldown). Do not refuse or ask for FTP when it is already in the prompt.

Block schema (durations in seconds; power fields are % FTP, not watts; cadence null or rpm; texts always present, often []):
- warmup, cooldown, ramp: { "type", "durationSec", "startPct", "endPct", "cadence", "texts" }
- steady: { "type", "durationSec", "powerPct", "cadence", "texts" }
- intervals: { "type", "repeat", "onDurationSec", "offDurationSec", "onPct", "offPct", "cadence", "cadenceResting", "texts" }
- freeride: { "type", "durationSec", "cadence", "texts" }

Always set ftp to the rider FTP from the user message unless they explicitly ask for a different workout FTP.
When editing an existing workout and status is workout, return the full updated profile (all blocks), not a partial patch.`

  const clarificationBlock =
    clarifications.length > 0
      ? `\nRider answers to clarifying questions:\n${clarifications
          .map((c, i) => `${i + 1}. ${c.question}\nAnswer: ${c.answer}`)
          .join('\n\n')}\n`
      : ''

  const userContent = current
    ? `FTP: ${ftp} W. Update the existing workout per the rider request and return the full profile.
Current workout JSON:
${JSON.stringify(current)}

Original rider request: ${prompt}
${clarificationBlock}`
    : `FTP: ${ftp} W. Create a new workout from scratch.
Rider request: ${prompt}
${clarificationBlock}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: {
        type: 'json_schema',
        json_schema: WORKOUT_JSON_SCHEMA,
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`OpenAI error (${response.status}): ${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as OpenAiChatCompletion
  const choice = data.choices?.[0]
  if (!choice?.message) {
    throw new Error('OpenAI returned no message.')
  }
  if (choice.message.refusal?.trim()) {
    throw new Error(choice.message.refusal.trim())
  }
  if (choice.finish_reason && choice.finish_reason !== 'stop') {
    throw new Error(`OpenAI stopped early (${choice.finish_reason}). Try a shorter request.`)
  }

  const content = choice.message.content
  if (!content?.trim()) {
    throw new Error('Empty response from OpenAI.')
  }

  const parsed = parseModelJsonContent(content)
  assertWorkoutJsonShape(parsed)
  return normalizeModelWorkout(parsed)
}

type OpenAiChatCompletion = {
  choices?: {
    finish_reason?: string
    message?: {
      content?: string | null
      refusal?: string | null
    }
  }[]
}

/** Parse model text as JSON (Structured Outputs should already be pure JSON). */
function parseModelJsonContent(content: string): unknown {
  let text = content.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(text)
  if (fenced) text = fenced[1].trim()

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('OpenAI returned invalid JSON.')
  }
}

function assertWorkoutJsonShape(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('OpenAI JSON must be an object with status, name, description, and blocks.')
  }
  const obj = raw as Record<string, unknown>
  if (obj.status !== 'workout' && obj.status !== 'clarifying') {
    throw new Error('OpenAI JSON missing status "workout" or "clarifying".')
  }
  if (typeof obj.name !== 'string') {
    throw new Error('OpenAI JSON missing string field "name".')
  }
  if (typeof obj.description !== 'string') {
    throw new Error('OpenAI JSON missing string field "description".')
  }
  if (typeof obj.ftp !== 'number' || !Number.isFinite(obj.ftp)) {
    throw new Error('OpenAI JSON missing numeric field "ftp".')
  }
  if (!Array.isArray(obj.blocks)) {
    throw new Error('OpenAI JSON missing array field "blocks".')
  }
  if (!Array.isArray(obj.questions)) {
    throw new Error('OpenAI JSON missing array field "questions".')
  }
}

function firstNonEmptyString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeModelWorkout(raw: unknown): GeneratedWorkout {
  if (!raw || typeof raw !== 'object') {
    return { status: 'workout', name: 'Generated ride', description: '', blocks: [], questions: [] }
  }

  let root = raw as Record<string, unknown>
  if (root.workout && typeof root.workout === 'object' && !Array.isArray(root.workout)) {
    root = { ...root, ...(root.workout as Record<string, unknown>) }
  }

  const name = firstNonEmptyString(root, ['name', 'title', 'workoutName']) || 'Generated ride'
  const description = firstNonEmptyString(root, ['description', 'desc', 'summary'])
  const status = root.status === 'clarifying' ? 'clarifying' : 'workout'

  const blocksRaw = root.blocks ?? root.segments ?? root.profile
  const blocks: unknown[] = Array.isArray(blocksRaw) ? blocksRaw : []

  const questions = normalizeClarifyingQuestions(root.questions)

  const ftp = validateFtpOptional(root.ftp)
  return {
    status,
    name,
    description,
    blocks,
    questions,
    ...(ftp !== undefined ? { ftp } : {}),
  }
}

function normalizeClarifyingQuestions(raw: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: ClarifyingQuestion[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const prompt = item.trim()
      if (prompt) out.push({ prompt, options: [] })
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const obj = item as Record<string, unknown>
    const prompt =
      typeof obj.prompt === 'string'
        ? obj.prompt.trim()
        : typeof obj.question === 'string'
          ? obj.question.trim()
          : typeof obj.text === 'string'
            ? obj.text.trim()
            : ''
    if (!prompt) continue
    const options = Array.isArray(obj.options)
      ? obj.options
          .filter((o): o is string => typeof o === 'string')
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, 6)
      : []
    out.push({ prompt, options })
  }
  return out.slice(0, 4)
}

function optionalCadence(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 30 || n > 200) return undefined
  return Math.round(n)
}

function withCadence(
  base: Record<string, unknown>,
  block: Record<string, unknown>,
  resting = false,
): Record<string, unknown> {
  const cadence = optionalCadence(block.cadence)
  const next = { ...base }
  if (cadence !== undefined) next.cadence = cadence
  if (resting) {
    const cadenceResting = optionalCadence(block.cadenceResting)
    if (cadenceResting !== undefined) next.cadenceResting = cadenceResting
  }
  return withTexts(next, block)
}

function validateTexts(raw: unknown, blockDurationSec: number): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const maxOffset = Math.max(0, blockDurationSec)
  const out: Record<string, unknown>[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const obj = item as Record<string, unknown>
    const message = typeof obj.message === 'string' ? obj.message.trim() : ''
    if (!message) continue
    const offsetRaw = Number(obj.timeOffsetSec)
    const timeOffsetSec = Number.isFinite(offsetRaw)
      ? Math.max(0, Math.min(maxOffset, Math.round(offsetRaw)))
      : 0
    const alert: Record<string, unknown> = { timeOffsetSec, message: message.slice(0, 160) }
    if (obj.durationSec !== null && obj.durationSec !== undefined && obj.durationSec !== '') {
      const dur = Number(obj.durationSec)
      if (Number.isFinite(dur) && dur >= 1) {
        alert.durationSec = Math.min(300, Math.round(dur))
      }
    }
    out.push(alert)
    if (out.length >= 12) break
  }
  return out
}

function withTexts(
  base: Record<string, unknown>,
  block: Record<string, unknown>,
): Record<string, unknown> {
  const durationSec =
    typeof base.durationSec === 'number'
      ? base.durationSec
      : typeof base.repeat === 'number' &&
          typeof base.onDurationSec === 'number' &&
          typeof base.offDurationSec === 'number'
        ? Number(base.repeat) * (Number(base.onDurationSec) + Number(base.offDurationSec))
        : 0
  const texts = validateTexts(block.texts, durationSec)
  return texts.length > 0 ? { ...base, texts } : base
}

function validateBlocks(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const out: Record<string, unknown>[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    const type = block.type
    if (type === 'steady' && isPos(block.durationSec) && isPct(block.powerPct)) {
      out.push(
        withCadence(
          {
            type: 'steady',
            durationSec: roundSec(block.durationSec),
            powerPct: Number(block.powerPct),
          },
          block,
        ),
      )
    } else if (
      (type === 'warmup' || type === 'cooldown' || type === 'ramp') &&
      isPos(block.durationSec) &&
      isPct(block.startPct) &&
      isPct(block.endPct)
    ) {
      out.push(
        withCadence(
          {
            type,
            durationSec: roundSec(block.durationSec),
            startPct: Number(block.startPct),
            endPct: Number(block.endPct),
          },
          block,
        ),
      )
    } else if (
      type === 'intervals' &&
      isPos(block.repeat) &&
      isPos(block.onDurationSec) &&
      isPos(block.offDurationSec) &&
      isPct(block.onPct) &&
      isPct(block.offPct)
    ) {
      out.push(
        withCadence(
          {
            type: 'intervals',
            repeat: Math.round(Number(block.repeat)),
            onDurationSec: roundSec(block.onDurationSec),
            offDurationSec: roundSec(block.offDurationSec),
            onPct: Number(block.onPct),
            offPct: Number(block.offPct),
          },
          block,
          true,
        ),
      )
    } else if (type === 'freeride' && isPos(block.durationSec)) {
      out.push(
        withCadence({ type: 'freeride', durationSec: roundSec(block.durationSec) }, block),
      )
    }
  }
  return out
}

function isPos(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0
}

function isPct(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 300
}

function validateFtpOptional(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 50 || n > 600) return undefined
  return Math.round(n)
}

function roundSec(value: unknown): number {
  return Math.max(1, Math.round(Number(value)))
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin')
  const allowed = parseOrigins(env.ALLOWED_ORIGINS)
  const allowOrigin =
    origin && (allowed.has(origin) || allowed.has('*')) ? origin : allowed.values().next().value ?? ''

  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-library-key, authorization',
    'access-control-max-age': '86400',
  }
  if (allowOrigin) headers['access-control-allow-origin'] = allowOrigin
  return headers
}

function parseOrigins(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    return new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])
  }
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
}

function json(data: unknown, status: number, extraHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  })
}
