/** Worker URL in production (set at Pages build time). Empty in dev → Vite proxies `/api`. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export type GeneratedBlockPayload =
  | {
      type: 'steady'
      durationSec: number
      powerPct: number
    }
  | {
      type: 'ramp' | 'warmup' | 'cooldown'
      durationSec: number
      startPct: number
      endPct: number
    }
  | {
      type: 'intervals'
      repeat: number
      onDurationSec: number
      offDurationSec: number
      onPct: number
      offPct: number
    }
  | {
      type: 'freeride'
      durationSec: number
    }

export type GenerateWorkoutResponse = {
  name: string
  description: string
  blocks: GeneratedBlockPayload[]
}

export type AiWorkoutContext = {
  name: string
  description: string
  blocks: GeneratedBlockPayload[]
}

export type GenerateWorkoutErrorInfo = {
  title: string
  message: string
  hint?: string
}

export class GenerateWorkoutError extends Error {
  title: string
  hint?: string

  constructor(info: GenerateWorkoutErrorInfo) {
    super(info.message)
    this.name = 'GenerateWorkoutError'
    this.title = info.title
    this.hint = info.hint
  }
}

export function getGenerateWorkoutErrorInfo(err: unknown): GenerateWorkoutErrorInfo {
  if (err instanceof GenerateWorkoutError) {
    return { title: err.title, message: err.message, hint: err.hint }
  }
  if (err instanceof Error) {
    return { title: 'Something went wrong', message: err.message }
  }
  return { title: 'Something went wrong', message: 'Generation failed.' }
}

function errorFromResponse(status: number, serverMessage?: string): GenerateWorkoutError {
  if (status === 429) {
    return new GenerateWorkoutError({
      title: 'Too many requests',
      message: serverMessage ?? 'You hit the rate limit.',
      hint: 'Wait a minute and try again.',
    })
  }
  if (status === 503) {
    return new GenerateWorkoutError({
      title: 'AI not configured',
      message: serverMessage ?? 'The workout API is missing its OpenAI key.',
      hint: 'Set OPENAI_API_KEY on the worker (local: worker/.dev.vars).',
    })
  }
  if (status === 502) {
    return new GenerateWorkoutError({
      title: 'AI could not build that workout',
      message: serverMessage ?? 'The model returned an invalid or empty profile.',
      hint: 'Try rephrasing your request or simplifying the structure.',
    })
  }
  if (status === 400) {
    return new GenerateWorkoutError({
      title: 'Invalid request',
      message: serverMessage ?? 'The server rejected this prompt.',
    })
  }
  if (status >= 500) {
    return new GenerateWorkoutError({
      title: 'Server error',
      message: serverMessage ?? `The API failed (${status}).`,
      hint: 'Try again in a moment.',
    })
  }
  return new GenerateWorkoutError({
    title: 'Request failed',
    message: serverMessage ?? `Unexpected response (${status}).`,
  })
}

export async function generateWorkoutFromPrompt(
  prompt: string,
  ftp: number,
  current?: AiWorkoutContext,
): Promise<GenerateWorkoutResponse> {
  const payload: { prompt: string; ftp: number; current?: AiWorkoutContext } = { prompt, ftp }
  if (current?.blocks.length) {
    payload.current = current
  }

  let res: Response
  try {
    res = await fetch(apiUrl('/api/generate-workout'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    const dev = import.meta.env.DEV
    throw new GenerateWorkoutError({
      title: 'Cannot reach the workout API',
      message: dev
        ? 'Nothing is listening for /api on this machine.'
        : 'The browser could not connect to the API.',
      hint: dev
        ? 'Run npm run dev:worker (or npm run dev:full) in another terminal.'
        : 'Check VITE_API_BASE on Cloudflare Pages and that the worker is deployed.',
    })
  }

  const raw = await res.text()
  let data: GenerateWorkoutResponse & { error?: string } = {
    name: '',
    description: '',
    blocks: [],
  }
  if (raw) {
    try {
      data = JSON.parse(raw) as GenerateWorkoutResponse & { error?: string }
    } catch {
      if (!res.ok) {
        throw new GenerateWorkoutError({
          title: 'Unexpected API response',
          message: raw.slice(0, 160) || `HTTP ${res.status}`,
        })
      }
    }
  }

  if (!res.ok) {
    throw errorFromResponse(res.status, data.error)
  }

  if (!Array.isArray(data.blocks) || data.blocks.length === 0) {
    throw new GenerateWorkoutError({
      title: 'Empty workout',
      message: 'The API returned no blocks.',
      hint: 'Try a more specific description (duration, intervals, power).',
    })
  }

  return data
}
