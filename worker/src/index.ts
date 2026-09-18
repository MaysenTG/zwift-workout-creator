export interface Env {
  OPENAI_API_KEY: string
  /** Comma-separated origins, e.g. https://zwo-builder.pages.dev */
  ALLOWED_ORIGINS?: string
}

type GenerateRequest = {
  prompt: string
  ftp: number
  current?: {
    name: string
    description: string
    ftp?: number
    blocks: unknown[]
  }
}

type GeneratedWorkout = {
  name: string
  description: string
  ftp?: number
  blocks: unknown[]
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

/** OpenAI Structured Outputs — model must return this exact JSON shape. */
const WORKOUT_JSON_SCHEMA = {
  name: 'zwo_workout',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short workout title' },
      description: {
        type: 'string',
        description: 'One or two sentences: goal, intensity, duration feel',
      },
      ftp: {
        type: 'number',
        description: 'Optional workout FTP in watts; omit unless changing FTP',
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
              },
              required: ['type', 'durationSec', 'powerPct'],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['warmup', 'cooldown', 'ramp'] },
                durationSec: { type: 'number' },
                startPct: { type: 'number' },
                endPct: { type: 'number' },
              },
              required: ['type', 'durationSec', 'startPct', 'endPct'],
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
              },
              required: [
                'type',
                'repeat',
                'onDurationSec',
                'offDurationSec',
                'onPct',
                'offPct',
              ],
              additionalProperties: false,
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', const: 'freeride' },
                durationSec: { type: 'number' },
              },
              required: ['type', 'durationSec'],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ['name', 'description', 'blocks'],
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

    return json({ error: 'Not found' }, 404, cors)
  },
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

  const current =
    body.current && Array.isArray(body.current.blocks) ? body.current : undefined

  try {
    const generated = await callOpenAI(
      body.prompt.trim(),
      body.ftp,
      env.OPENAI_API_KEY,
      current,
    )
    const blocks = validateBlocks(generated.blocks)
    if (blocks.length === 0) {
      return json({ error: 'Model returned no valid workout blocks.' }, 502, cors)
    }
    const response: Record<string, unknown> = {
      name: generated.name || 'Generated ride',
      description: generated.description || '',
      blocks,
    }
    const ftpOut = validateFtpOptional(generated.ftp)
    if (ftpOut !== undefined) response.ftp = ftpOut

    return json(response, 200, cors)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed.'
    return json({ error: message }, 502, cors)
  }
}

async function callOpenAI(
  prompt: string,
  ftp: number,
  apiKey: string,
  current?: GenerateRequest['current'],
): Promise<GeneratedWorkout> {
  const system = `You are an expert indoor cycling coach building structured Zwift bike workouts (.zwo format). Output JSON only.

Context:
- Workouts are a timeline of power targets as % of the rider's FTP (functional threshold power). 100% ≈ one-hour max sustainable power. The app converts % to watts using the workout FTP.
- Typical session shape: progressive warmup → main set (steady state and/or intervals) → cooldown. Match total duration and intensity to the user's goal.
- Power zones (% FTP): Z1 recovery 0–55%; Z2 endurance 55–75%; Z3 tempo 75–90%; Z4 threshold/sweet spot ~88–105%; Z5 VO2max 105–120%; Z6+ short anaerobic/sprints (use sparingly).
- Common formats: endurance (long Z2); tempo (Z3 blocks); sweet spot (88–94% sustained or repeats); threshold (95–105%); VO2 intervals (106–120% work with equal or longer recovery); over-unders; cadence drills (note in description—power still set here); recovery spins (Z1–low Z2).
- Intervals: use recovery "off" at 50–65% unless the user asks otherwise; size repeat count and work duration for the requested time and difficulty; avoid unrealistic stack of high-intensity blocks without recovery.
- Use "freeride" only when the user wants unstructured riding or open-ended segments; otherwise prefer explicit power blocks.

Block schema (durations in seconds; power fields are % FTP, not watts):
- warmup, cooldown, ramp: { "type": "warmup"|"cooldown"|"ramp", "durationSec", "startPct", "endPct" } — ramps for gradual build/recovery (e.g. warmup 50→75%).
- steady: { "type": "steady", "durationSec", "powerPct" }
- intervals: { "type": "intervals", "repeat", "onDurationSec", "offDurationSec", "onPct", "offPct" }
- freeride: { "type": "freeride", "durationSec" }

Always set a clear workout name and a short description (goal, key efforts, total time feel).
Output one JSON object with these exact top-level keys (not nested under "workout"): "name", "description", "blocks", and optional "ftp".
Example shape: { "name": "Sweet Spot 60", "description": "3×8 min at 92% with easy spin recoveries.", "blocks": [ ... ] }
Include "ftp" (watts, 50–600) only when the user asks to change workout FTP or you recommend a specific FTP for the plan.
When editing, return the full updated profile (all blocks plus name and description), not a partial patch.`

  const userContent = current
    ? `FTP: ${ftp} W. The user has an existing workout—update it per their request and return the full profile.
Current workout JSON:
${JSON.stringify(current)}

User request: ${prompt}`
    : `FTP: ${ftp} W. Create a new workout from scratch: ${prompt}`

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
    throw new Error('OpenAI JSON must be an object with name, description, and blocks.')
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.name !== 'string') {
    throw new Error('OpenAI JSON missing string field "name".')
  }
  if (typeof obj.description !== 'string') {
    throw new Error('OpenAI JSON missing string field "description".')
  }
  if (!Array.isArray(obj.blocks)) {
    throw new Error('OpenAI JSON missing array field "blocks".')
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
    return { name: 'Generated ride', description: '', blocks: [] }
  }

  let root = raw as Record<string, unknown>
  if (root.workout && typeof root.workout === 'object' && !Array.isArray(root.workout)) {
    root = { ...root, ...(root.workout as Record<string, unknown>) }
  }

  const name = firstNonEmptyString(root, ['name', 'title', 'workoutName']) || 'Generated ride'
  const description = firstNonEmptyString(root, ['description', 'desc', 'summary'])

  let blocks = root.blocks ?? root.segments ?? root.profile
  if (!Array.isArray(blocks)) blocks = []

  const ftp = validateFtpOptional(root.ftp)
  return ftp !== undefined
    ? { name, description, blocks, ftp }
    : { name, description, blocks }
}

function validateBlocks(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const out: Record<string, unknown>[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    const type = block.type
    if (type === 'steady' && isPos(block.durationSec) && isPct(block.powerPct)) {
      out.push({
        type: 'steady',
        durationSec: roundSec(block.durationSec),
        powerPct: Number(block.powerPct),
      })
    } else if (
      (type === 'warmup' || type === 'cooldown' || type === 'ramp') &&
      isPos(block.durationSec) &&
      isPct(block.startPct) &&
      isPct(block.endPct)
    ) {
      out.push({
        type,
        durationSec: roundSec(block.durationSec),
        startPct: Number(block.startPct),
        endPct: Number(block.endPct),
      })
    } else if (
      type === 'intervals' &&
      isPos(block.repeat) &&
      isPos(block.onDurationSec) &&
      isPos(block.offDurationSec) &&
      isPct(block.onPct) &&
      isPct(block.offPct)
    ) {
      out.push({
        type: 'intervals',
        repeat: Math.round(Number(block.repeat)),
        onDurationSec: roundSec(block.onDurationSec),
        offDurationSec: roundSec(block.offDurationSec),
        onPct: Number(block.onPct),
        offPct: Number(block.offPct),
      })
    } else if (type === 'freeride' && isPos(block.durationSec)) {
      out.push({ type: 'freeride', durationSec: roundSec(block.durationSec) })
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
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
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
