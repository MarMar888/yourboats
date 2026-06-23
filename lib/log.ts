import { db } from '@/lib/db'
import { logs } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getPostHogClient } from '@/lib/posthog-server'
import pkg from '../package.json'

type LogEntry = {
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  error?: string
}

function appVersion(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? pkg.version ?? 'local'
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    const user = await getCurrentUser()
    const meta = { ...entry.metadata, _v: appVersion() }
    await db.insert(logs).values({
      userId: user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: JSON.stringify(meta),
      error: entry.error ?? null,
    })
    if (entry.error) {
      const posthog = getPostHogClient()
      posthog.capture({
        distinctId: user?.id ?? 'server',
        event: '$exception',
        properties: {
          $exception_message: entry.error,
          $exception_type: entry.action,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
        },
      })
      await posthog.shutdown()
    }
  } catch {
    // Logging must never crash the caller
  }
}

/** Log a system/cron-initiated event with no user context. */
export async function logSystem(entry: LogEntry): Promise<void> {
  try {
    const meta = { ...entry.metadata, _v: appVersion() }
    await db.insert(logs).values({
      userId: null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: JSON.stringify(meta),
      error: entry.error ?? null,
    })
    if (entry.error) {
      const posthog = getPostHogClient()
      posthog.capture({
        distinctId: 'server',
        event: '$exception',
        properties: {
          $exception_message: entry.error,
          $exception_type: entry.action,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
        },
      })
      await posthog.shutdown()
    }
  } catch {
    // Logging must never crash the caller
  }
}
