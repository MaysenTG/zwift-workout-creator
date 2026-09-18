import { SUPPORT_TIP_LABEL, SUPPORT_TIP_URL } from '../siteMeta'

export function supportLink(): { href: string; label: string } {
  return { href: SUPPORT_TIP_URL, label: SUPPORT_TIP_LABEL }
}

export function ethicalAdsPublisher(): string | null {
  if (import.meta.env.VITE_ADS?.trim().toLowerCase() !== 'ethical') return null
  const id = import.meta.env.VITE_ETHICAL_ADS_PUBLISHER?.trim()
  return id || null
}
