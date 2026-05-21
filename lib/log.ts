import { db } from '@/lib/db'
import { logs } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import pkg from '../package.json'

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
    const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? pkg.version ?? 'local'
    const meta = { ...entry.metadata, _v: version }
    await db.insert(logs).values({
      userId: user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: meta ? JSON.stringify(meta) : JSON.stringify({ _v: version }),
      error: entry.error ?? null,
    })
  } catch {
    // Logging must never crash the caller
  }
}
