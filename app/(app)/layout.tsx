import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import AppNav from '@/components/app-nav'
import AppFooter from '@/components/app-footer'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const devUserId = cookieStore.get(DEV_USER_COOKIE)?.value
  const user = DEV_USERS.find((u) => u.id === devUserId)

  if (!user) redirect('/pick-user')

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav user={user} />
      <main className="flex-1 container py-6">{children}</main>
      <AppFooter />
    </div>
  )
}
