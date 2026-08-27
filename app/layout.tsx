import './globals.css'
import { PostHogPageView } from '@/components/posthog-pageview'
import { StaleDeploymentBanner } from '@/components/stale-deployment-banner'

const SITE_URL = 'https://yourboats.squeakycleanboats.com'
const SITE_NAME = 'Yourboats'
const TITLE = 'Yourboats — Marina Operations Software'
const DESCRIPTION =
  'Yourboats is marina operations software for marinas and boat detailers: slip management, scheduling, invoicing, payroll, and an AI assistant.'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s | Yourboats',
  },
  description: DESCRIPTION,
  keywords: [
    'marina management software',
    'boat detailing software',
    'slip management',
    'marina scheduling software',
    'boat cleaning business software',
    'marina invoicing QuickBooks',
    'marina operations software',
  ],
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <StaleDeploymentBanner />
        <PostHogPageView />
        {children}
      </body>
    </html>
  )
}
