import './globals.css'
import { Inter } from 'next/font/google'
import { PostHogPageView } from '@/components/posthog-pageview'
import { StaleDeploymentBanner } from '@/components/stale-deployment-banner'

export const metadata = {
  metadataBase: new URL('https://yourboats.vercel.app'),
  title: 'yourboats',
  description: 'Boat cleaning operations — scheduling, jobs, and invoicing',
}

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <StaleDeploymentBanner />
        <PostHogPageView />
        {children}
      </body>
    </html>
  )
}
