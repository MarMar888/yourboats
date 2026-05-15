import { db } from '@/lib/db'
import { logs } from '@/lib/db/schema'
import { cookies } from 'next/headers'
import { DEV_USER_COOKIE } from '@/lib/dev-users'

type LogEntry = {
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  error?: string
}

async function currentUserId(): Promise<string | null> {
  try {
    const store = await cookies()
    return store.get(DEV_USER_COOKIE)?.value ?? null
  } catch {
    return null
  }
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    const userId = await currentUserId()
    await db.insert(logs).values({
      userId,
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
