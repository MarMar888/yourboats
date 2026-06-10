import Link from 'next/link'
import { db } from '@/lib/db'
import { logs } from '@/lib/db/schema'
import { isNotNull, gte, sql } from 'drizzle-orm'
import { version } from '@/package.json'

// Errors in the last hour — if 3 or more, status goes red
const ERROR_WINDOW_MS = 60 * 60 * 1000
const ERROR_THRESHOLD = 3

export default async function AppFooter() {
  let isUnhealthy = false

  try {
    const since = new Date(Date.now() - ERROR_WINDOW_MS)
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(logs)
      .where(
        sql`${logs.error} is not null and ${logs.createdAt} >= ${since}`
      )
    isUnhealthy = (row?.count ?? 0) >= ERROR_THRESHOLD
  } catch {
    // If we can't query, don't crash the footer
  }

  return (
    <footer className="border-t bg-background/80 py-3 px-6 flex items-center justify-center gap-2">
      <p className="text-xs text-muted-foreground">
        yourboats v{version} / Squeaky Clean Boat Services LLC
      </p>
      <Link
        href="/logs"
        title={isUnhealthy ? 'Recent errors detected — view logs' : 'System healthy — view logs'}
        className="flex items-center"
      >
        <span
          className={`w-2 h-2 rounded-full inline-block ${
            isUnhealthy
              ? 'bg-red-500 animate-pulse'
              : 'bg-green-500'
          }`}
        />
      </Link>
    </footer>
  )
}
