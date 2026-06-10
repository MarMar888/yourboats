'use server'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { emailTransport } from '@/lib/email/client'
import { MARLEY_SMS } from '@/lib/constants/sms'

const MAX_COMMENT_LENGTH = 500

export async function notifyErrorReported(comment: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.posthog.com'
  const truncated = comment.length > MAX_COMMENT_LENGTH
    ? comment.slice(0, MAX_COMMENT_LENGTH) + '…'
    : comment

  try {
    await emailTransport.sendMail({
      from: `"yourboats" <${process.env.GMAIL_USER}>`,
      to: MARLEY_SMS,
      subject: 'Error reported in yourboats',
      text: `Error reported: ${truncated} — View in PostHog: ${posthogHost}/activity/explore`,
    })
  } catch (err) {
    console.error('[report-error] Failed to send notification:', err)
  }
}
