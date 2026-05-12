import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const user = DEV_USERS.find((u) => u.id === cookieStore.get(DEV_USER_COOKIE)?.value)
  if (!user) redirect('/pick-user')

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">
        {new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </h1>
      <p className="text-muted-foreground mb-6">
        {user.role === 'employee' ? 'Your jobs for today' : 'All jobs today'}
      </p>

      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        No jobs scheduled for today.
      </div>
    </div>
  )
}
