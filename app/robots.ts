import type { MetadataRoute } from 'next'

// Everything behind the authenticated app shell — not meant for search or AI
// indexing, and requires a login a crawler will never have anyway.
const DISALLOW = [
  '/api/',
  '/dashboard',
  '/schedule',
  '/customers',
  '/invoices',
  '/settings',
  '/complaints',
  '/profit-loss',
  '/pay',
  '/exceptions',
  '/time',
  '/logs',
  '/team',
  '/highlights',
  '/performance',
  '/reminders',
  '/clock',
  '/pick-user',
  '/auth',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Explicitly welcome AI crawlers, assistants, and search bots — the
        // marketing site is meant to be read and cited by them.
        userAgent: [
          '*',
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'ClaudeBot',
          'Claude-Web',
          'anthropic-ai',
          'PerplexityBot',
          'Perplexity-User',
          'Google-Extended',
          'Applebot-Extended',
          'Amazonbot',
          'Meta-ExternalAgent',
          'cohere-ai',
          'CCBot',
        ],
        allow: '/',
        disallow: DISALLOW,
      },
    ],
    sitemap: 'https://yourboats.squeakycleanboats.com/sitemap.xml',
  }
}
