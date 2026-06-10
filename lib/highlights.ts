export type Highlight = {
  slug: string
  title: string
  date: string
  status: string
  summary: string
  bullets: string[]
  links: {
    href: string
    label: string
  }[]
}

export const highlights: Highlight[] = [
  {
    slug: 'highlights-page',
    title: 'Highlights page',
    date: '2026-06-10',
    status: 'Launched',
    summary: 'There is now one place to see recent product changes and where to use them.',
    bullets: [
      'Highlights are listed inside the app for everyone on the team.',
      'Each update includes a short summary and links to the relevant pages.',
      'New user-facing features should get a highlight before they ship.',
    ],
    links: [
      { href: '/highlights', label: 'View highlights' },
    ],
  },
  {
    slug: 'weather-aware-scheduling',
    title: 'Weather-aware scheduling',
    date: '2026-06-10',
    status: 'Launched',
    summary: 'Forecasts now show up in the weekly schedule, and risky approved jobs are surfaced in Exceptions.',
    bullets: [
      'Schedule days show temperature, rain chance, wind, and hourly rain risk.',
      'Exceptions flags approved jobs when rain or wind could affect service.',
      'Forecast data refreshes hourly when service-area coordinates are configured.',
    ],
    links: [
      { href: '/schedule', label: 'View schedule' },
      { href: '/exceptions', label: 'Review exceptions' },
    ],
  },
]
