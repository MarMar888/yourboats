import { db } from '@/lib/db'
import { logs } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'

type LogEntry = {
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  error?: string
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    const user = await getCurrentUser()
    await db.insert(logs).values({
      userId: user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      error: entry.error ?? null,
    })
  } catch {
    // Logging must never crash the caller
  }
}
