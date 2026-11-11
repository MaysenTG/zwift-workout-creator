const STORAGE_KEY = 'wattline:library-key'

/** Crockford base32 alphabet (no I/L/O/U). */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

function randomKey(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length]
  }
  return out
}

export function normalizeLibraryKey(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.length < 16 || key.length > 64) return null
  if (!/^[a-z0-9]+$/.test(key)) return null
  return key
}

/** Accept a bare key, dashed key, path, or full library URL. */
export function normalizeLibraryKeyInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
      const url = trimmed.startsWith('/')
        ? new URL(trimmed, window.location.origin)
        : new URL(trimmed)
      const fromPath = libraryKeyFromPath(url.pathname)
      if (fromPath) return fromPath
    }
  } catch {
    // fall through to bare-key parsing
  }
  return normalizeLibraryKey(trimmed)
}

/** Display as groups for easier reading / typing. */
export function formatLibraryKey(key: string): string {
  const normalized = normalizeLibraryKey(key) ?? key
  return normalized.replace(/(.{4})(?=.)/g, '$1-')
}

export function readLibraryKey(): string | null {
  try {
    return normalizeLibraryKey(localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return null
  }
}

export function writeLibraryKey(key: string): string {
  const normalized = normalizeLibraryKey(key)
  if (!normalized) throw new Error('Invalid library key.')
  localStorage.setItem(STORAGE_KEY, normalized)
  return normalized
}

export function getOrCreateLibraryKey(): string {
  const existing = readLibraryKey()
  if (existing) return existing
  return writeLibraryKey(randomKey(16))
}

/** First path segment if it looks like a library key. */
export function libraryKeyFromPath(pathname = window.location.pathname): string | null {
  const segment = pathname.replace(/^\//, '').split('/').filter(Boolean)[0] ?? ''
  return normalizeLibraryKey(segment)
}

export function libraryPath(key: string): string {
  const normalized = normalizeLibraryKey(key)
  if (!normalized) throw new Error('Invalid library key.')
  return `/${normalized}`
}

export function libraryUrl(key: string, origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}${libraryPath(key)}`
}

/** Keep the address bar on /:libraryKey for the active library. */
export function ensureLibraryRoute(key: string): void {
  const path = libraryPath(key)
  if (window.location.pathname !== path) {
    window.history.replaceState(null, '', path)
  }
}

/**
 * Resolve active library from the URL (preferred) or localStorage, then sync the URL.
 */
export function resolveActiveLibraryKey(): string {
  const fromUrl = libraryKeyFromPath()
  if (fromUrl) {
    writeLibraryKey(fromUrl)
    ensureLibraryRoute(fromUrl)
    return fromUrl
  }
  const key = getOrCreateLibraryKey()
  ensureLibraryRoute(key)
  return key
}
