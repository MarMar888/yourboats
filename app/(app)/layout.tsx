export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { AppSidebar } from '@/components/app-sidebar'
import AppFooter from '@/components/app-footer'
import { PostHogIdentify } from '@/components/posthog-identify'
import { Toaster } from 'sonner'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import Link from 'next/link'
import { LiveClockInsInitializer, LiveClockInsPanel, LiveClockInsWidget } from '@/components/live-clock-ins'
import { getActiveClockins } from '@/app/(app)/time/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  if (!user) {
    const dest = process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? '/pick-user' : '/login'
    redirect(dest)
  }

  const canSeeClockIns = user.role === 'owner' || user.role === 'manager'
  const activeClockins = canSeeClockIns ? await getActiveClockins() : []

  return (
    <SidebarProvider>
      <LiveClockInsInitializer entries={activeClockins} />
      <PostHogIdentify userId={user.id} email={user.email} displayName={user.displayName} role={user.role} />
      <AppSidebar user={user} />
      <SidebarInset className="flex flex-col min-h-svh overflow-x-hidden">
        {/* Mobile-only top bar */}
        <div className="flex md:hidden items-center gap-3 border-b px-4 py-3 sticky top-0 z-10 bg-background/92 backdrop-blur">
          <SidebarTrigger />
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
            <span className="tracking-tight">yourboats</span>
          </Link>
        </div>
        <div className="flex flex-1 min-w-0">
          <main className="flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-7 max-w-screen-xl mx-auto w-full">
            {children}
          </main>
          <LiveClockInsPanel />
        </div>
        <AppFooter />
      </SidebarInset>
      <LiveClockInsWidget />
      <Toaster richColors position="bottom-right" />
    </SidebarProvider>
  )
}
