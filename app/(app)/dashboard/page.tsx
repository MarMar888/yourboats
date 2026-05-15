import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

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
