import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import {
  DEFAULT_DOCUMENT_TITLE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
} from './src/siteMeta.js'

function seoBuildPlugin(siteUrl: string): Plugin {
  const origin = siteUrl.replace(/\/$/, '')

  return {
    name: 'seo-build',
    transformIndexHtml(html) {
      const ogImage = origin ? `${origin}/og-image.svg` : '/og-image.svg'
      const canonical = origin ? `${origin}/` : '/'

      const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${canonical}#website`,
            url: canonical,
            name: SITE_NAME,
            description: SITE_DESCRIPTION,
            inLanguage: 'en',
          },
          {
            '@type': 'WebApplication',
            '@id': `${canonical}#app`,
            name: SITE_NAME,
            url: canonical,
            description: SITE_DESCRIPTION,
            applicationCategory: 'SportsApplication',
            operatingSystem: 'Any',
            browserRequirements: 'Requires JavaScript. Requires HTML5.',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
            featureList: [
              'Visual power profile editor',
              'Drag-and-drop workout blocks',
              'Local workout library',
              'AI-assisted workout generation',
              'Export workouts for Zwift',
            ].join(', '),
            isPartOf: { '@id': `${canonical}#website` },
          },
        ],
      }

      return html
        .replaceAll('__SITE_NAME__', SITE_NAME)
        .replaceAll('__SITE_TAGLINE__', SITE_TAGLINE)
        .replaceAll('__SITE_DESCRIPTION__', SITE_DESCRIPTION)
        .replaceAll('__SITE_KEYWORDS__', SITE_KEYWORDS)
        .replaceAll('__DOCUMENT_TITLE__', DEFAULT_DOCUMENT_TITLE)
        .replaceAll('__CANONICAL_URL__', canonical)
        .replaceAll('__OG_IMAGE__', ogImage)
        .replace(
          '</head>',
          origin
            ? `    <link rel="alternate" hreflang="en" href="${canonical}" />\n  </head>`
            : '</head>',
        )
        .replaceAll(
          '__JSON_LD__',
          JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        )
    },
    closeBundle() {
      const dist = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
      const sitemapUrl = origin || 'https://example.com'

      writeFileSync(
        resolve(dist, 'robots.txt'),
        `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}/sitemap.xml
`,
      )

      writeFileSync(
        resolve(dist, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${sitemapUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
      )
    },
  }
}

// https://vite.dev/config/
function resolveSiteUrl(): string {
  return (
    process.env.VITE_SITE_URL?.trim() ||
    process.env.CF_PAGES_URL?.trim() ||
    ''
  )
}

export default defineConfig(() => {
  const siteUrl = resolveSiteUrl()

  return {
    plugins: [react(), seoBuildPlugin(siteUrl)],
    base: '/',
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  }
})
