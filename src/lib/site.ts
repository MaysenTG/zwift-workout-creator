export {
  DEFAULT_DOCUMENT_TITLE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
} from '../siteMeta'

import { DEFAULT_DOCUMENT_TITLE, SITE_NAME } from '../siteMeta'

/** Canonical site origin (no trailing slash). Set VITE_SITE_URL in production builds. */
export function getSiteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function documentTitle(workoutName?: string | null): string {
  const name = workoutName?.trim()
  if (!name || name === 'Untitled ride') return DEFAULT_DOCUMENT_TITLE
  return `${name} | ${SITE_NAME}`
}
