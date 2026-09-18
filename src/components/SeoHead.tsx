import { useEffect } from 'react'
import { documentTitle, getSiteOrigin, SITE_DESCRIPTION, SITE_NAME } from '../lib/site'

interface Props {
  workoutName?: string | null
}

/** Keeps document title and canonical URL in sync after the SPA loads. */
export function SeoHead({ workoutName }: Props) {
  useEffect(() => {
    document.title = documentTitle(workoutName)

    const origin = getSiteOrigin()
    if (!origin) return

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = origin + window.location.pathname

    let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.name = 'description'
      document.head.appendChild(metaDesc)
    }
    metaDesc.content = SITE_DESCRIPTION

    document.documentElement.lang = 'en'

    const pageUrl = origin + window.location.pathname
    document.querySelector('meta[property="og:site_name"]')?.setAttribute('content', SITE_NAME)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', pageUrl)
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', `${origin}/og-image.svg`)
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', `${origin}/og-image.svg`)
  }, [workoutName])

  return null
}
