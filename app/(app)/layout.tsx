export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import AppNav from '@/components/app-nav'
import AppFooter from '@/components/app-footer'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  if (!user) {
    // Redirect to dev picker in dev-auth mode, otherwise to login
    const dest = process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? '/pick-user' : '/login'
    redirect(dest)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav user={user} />
      <main className="flex-1 container py-6">{children}</main>
      <AppFooter />
    </div>
  )
}
