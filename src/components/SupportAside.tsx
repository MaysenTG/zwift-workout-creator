import { useEffect } from 'react'
import { ethicalAdsPublisher, supportLink } from '../lib/support'

const ETHICAL_SCRIPT = 'https://media.ethicalads.io/media/client/ethicalads.min.js'

export function SupportAside() {
  const tip = supportLink()
  const publisher = ethicalAdsPublisher()

  useEffect(() => {
    if (!publisher) return
    if (document.querySelector(`script[src="${ETHICAL_SCRIPT}"]`)) return
    const script = document.createElement('script')
    script.src = ETHICAL_SCRIPT
    script.async = true
    document.head.appendChild(script)
  }, [publisher])

  if (!tip && !publisher) return null

  return (
    <div className="support-aside">
      {tip ? (
        <p className="support-tip">
          <a href={tip.href} target="_blank" rel="noopener noreferrer">
            {tip.label}
          </a>
          <span className="support-tip-sep">·</span>
          tip jar
        </p>
      ) : null}
      {publisher ? (
        <div className="support-ad" aria-label="Sponsored">
          <div className="support-ad-label">Sponsored</div>
          <ins
            className="ethicalads"
            data-ea-publisher={publisher}
            data-ea-type="image"
            data-ea-style="stickybox"
          />
        </div>
      ) : null}
    </div>
  )
}
