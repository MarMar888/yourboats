export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import AppNav from '@/components/app-nav'
import AppFooter from '@/components/app-footer'
import { PostHogIdentify } from '@/components/posthog-identify'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  if (!user) {
    // Redirect to dev picker in dev-auth mode, otherwise to login
    const dest = process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? '/pick-user' : '/login'
    redirect(dest)
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <PostHogIdentify userId={user.id} email={user.email} displayName={user.displayName} role={user.role} />
      <AppNav user={user} />
      <main className="flex-1 container w-full max-w-screen-xl px-4 py-4 sm:px-6 sm:py-6">
        {children}
      </main>
      <AppFooter />
    </div>
  )
}
