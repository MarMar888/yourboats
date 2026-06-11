import './globals.css'
import { PostHogPageView } from '@/components/posthog-pageview'
import { StaleDeploymentBanner } from '@/components/stale-deployment-banner'
import { AppToaster } from '@/components/app-toaster'

export const metadata = {
  metadataBase: new URL('https://yourboats.vercel.app'),
  title: 'yourboats',
  description: 'Boat cleaning operations — scheduling, jobs, and invoicing',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <StaleDeploymentBanner />
        <PostHogPageView />
        {children}
        <AppToaster />
      </body>
    </html>
  )
}
