import './globals.css'
import { PostHogPageView } from '@/components/posthog-pageview'
import { StaleDeploymentBanner } from '@/components/stale-deployment-banner'

const SITE_URL = 'https://yourboats.vercel.app'
const SITE_NAME = 'Yourboats'
const DESCRIPTION =
  'Yourboats is the operating system for marinas and boat detailers: slip management, scheduling, invoicing synced to QuickBooks, payroll, and an AI assistant that runs the marina for you.'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Yourboats — The Operating System for Marinas + Boat Detailers',
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
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'Yourboats — The Operating System for Marinas + Boat Detailers',
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yourboats — The Operating System for Marinas + Boat Detailers',
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
