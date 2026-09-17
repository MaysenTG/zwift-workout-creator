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

export async function generateWorkoutFromPrompt(
  prompt: string,
  ftp: number,
  current?: AiWorkoutContext,
): Promise<GenerateWorkoutResponse> {
  const payload: { prompt: string; ftp: number; current?: AiWorkoutContext } = { prompt, ftp }
  if (current?.blocks.length) {
    payload.current = current
  }

  const res = await fetch(apiUrl('/api/generate-workout'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = (await res.json()) as GenerateWorkoutResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`)
  }
  return data
}
