import { redirect } from 'next/navigation'
import { desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { logs, users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import LogsClient from './logs-client'

export const dynamic = 'force-dynamic'

export default async function LogsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'owner') redirect('/dashboard')

  const rows = await db
    .select({
      id: logs.id,
      userId: logs.userId,
      action: logs.action,
      entityType: logs.entityType,
      entityId: logs.entityId,
      metadata: logs.metadata,
      error: logs.error,
      createdAt: logs.createdAt,
      displayName: users.displayName,
    })
    .from(logs)
    .leftJoin(users, sql`${logs.userId} = ${users.id}::text`)
    .orderBy(desc(logs.createdAt))
    .limit(200)

  // Collect distinct actions for the filter dropdown
  const distinctActions = Array.from(new Set(rows.map((r) => r.action))).sort()

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Most recent 200 events, newest first.
        </p>
      </div>

      <LogsClient rows={rows} distinctActions={distinctActions} />
    </div>
  )
}
