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
    blocks: unknown[]
  }
}

type GeneratedWorkout = {
  name: string
  description: string
  blocks: unknown[]
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

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
    body.current?.blocks?.length && Array.isArray(body.current.blocks)
      ? body.current
      : undefined

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
    return json(
      {
        name: generated.name || 'Generated ride',
        description: generated.description || '',
        blocks,
      },
      200,
      cors,
    )
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
  const system = `You create structured Zwift bike (.zwo) workouts. Output JSON only.
Power targets are percent of FTP (e.g. 70 means 70% FTP), not watts.
Use these block types:
- warmup, cooldown, ramp: { "type": "warmup"|"cooldown"|"ramp", "durationSec": number, "startPct": number, "endPct": number }
- steady: { "type": "steady", "durationSec": number, "powerPct": number }
- intervals: { "type": "intervals", "repeat": number, "onDurationSec": number, "offDurationSec": number, "onPct": number, "offPct": number }
- freeride: { "type": "freeride", "durationSec": number }
Include warmup and cooldown when appropriate. Durations are seconds.
Respond with: { "name": string, "description": string, "blocks": [...] }
When editing, return the full updated workout profile (all blocks), not a partial patch.`

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
      response_format: { type: 'json_object' },
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

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from OpenAI.')

  const parsed = JSON.parse(content) as GeneratedWorkout
  return parsed
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
