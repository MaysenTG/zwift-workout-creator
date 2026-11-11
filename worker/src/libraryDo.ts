const LIBRARY_MAX_BYTES = 900_000

type CloudLibrary = {
  version: 1
  updatedAt: number
  order: string[]
  workouts: unknown[]
}

/**
 * One Durable Object per library backup code.
 * Works in `wrangler dev` and production without a separate KV namespace setup.
 */
export class LibraryDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const stored = await this.state.storage.get<CloudLibrary>('library')
      return Response.json(stored ?? emptyLibrary())
    }

    if (request.method === 'PUT') {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
      }

      const library = normalizeCloudLibrary(body)
      const encoded = JSON.stringify(library)
      if (encoded.length > LIBRARY_MAX_BYTES) {
        return Response.json({ error: 'Library is too large to sync.' }, { status: 413 })
      }

      await this.state.storage.put('library', library)
      return Response.json({
        ok: true,
        updatedAt: library.updatedAt,
        count: library.workouts.length,
      })
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }
}

function emptyLibrary(): CloudLibrary {
  return { version: 1, updatedAt: 0, order: [], workouts: [] }
}

function normalizeCloudLibrary(raw: unknown): CloudLibrary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, updatedAt: Date.now(), order: [], workouts: [] }
  }
  const obj = raw as Record<string, unknown>
  const workouts = Array.isArray(obj.workouts)
    ? obj.workouts.filter((w) => w && typeof w === 'object')
    : []
  const order = Array.isArray(obj.order)
    ? obj.order.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  const updatedAt =
    typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : Date.now()
  return { version: 1, updatedAt, order, workouts }
}
