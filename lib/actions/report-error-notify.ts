'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { emailTransport } from '@/lib/email/client'
import { MARLEY_SMS } from '@/lib/constants/sms'
import { log } from '@/lib/log'

const MAX_COMMENT_LENGTH = 500

export async function notifyErrorReported(comment: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com'
  const truncated = comment.length > MAX_COMMENT_LENGTH
    ? comment.slice(0, MAX_COMMENT_LENGTH) + '…'
    : comment

  // Record the report first so it always lands on the Logs page, even if the
  // email notification below fails.
  await log({ action: 'error_reported', metadata: { comment: truncated } })

  try {
    const userLabel = user.displayName
      ? `${user.displayName} (${user.email})`
      : user.email

    await emailTransport.sendMail({
      from: `"yourboats" <${process.env.GMAIL_USER}>`,
      to: MARLEY_SMS,
      subject: 'Error report',
      text: `Error reported by: ${userLabel}`,
    })

    await emailTransport.sendMail({
      from: `"yourboats" <${process.env.GMAIL_USER}>`,
      to: MARLEY_SMS,
      subject: 'Error report',
      text: truncated,
    })
  } catch (err) {
    console.error('[report-error] Failed to send notification:', err)
  }
}
