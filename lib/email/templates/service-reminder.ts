export function formatServiceType(type: string): string {
  const map: Record<string, string> = {
    recurring: 'Recurring Cleaning',
    detailing: 'Detailing',
    buffing_waxing: 'Buffing & Waxing',
    acid_washing: 'Acid Washing',
    powerwashing: 'Powerwashing',
    gelcoat_wetsanding: 'Gelcoat Wet Sanding',
    captaining: 'Captaining',
    other: 'Service',
  }
  return map[type] ?? type
}

export function serviceReminderEmail(params: {
  customerName: string
  serviceDate: string
  boats: string[]
  serviceType: string
  businessPhone?: string
}): { subject: string; text: string; html: string } {
  const { customerName, serviceDate, boats, serviceType, businessPhone } = params
  const firstName = customerName.split(' ')[0]
  const boatList = boats.length > 0 ? boats : ['your boat']

  const subject = `Reminder: Your Squeaky Clean Boats service is tomorrow, ${serviceDate}`

  // ── Plain text ──────────────────────────────────────────────────────────────
  const boatLines = boatList.map((b) => `  • ${b}`).join('\n')
  const phoneLine = businessPhone
    ? `\nQuestions? Give us a call at ${businessPhone}.\n`
    : ''

  const text = `Hi ${firstName},

Just a quick reminder that your ${serviceType} service is scheduled for tomorrow, ${serviceDate}.

Boats being serviced:
${boatLines}

We'll see you soon!

— The Squeaky Clean Boats Team
${phoneLine}`

  // ── HTML ────────────────────────────────────────────────────────────────────
  const boatItems = boatList
    .map((b) => `<li style="margin: 4px 0;">${escapeHtml(b)}</li>`)
    .join('\n')

  const phoneBlock = businessPhone
    ? `<p style="margin: 0 0 8px;">Questions? Give us a call at <strong>${escapeHtml(businessPhone)}</strong>.</p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: Arial, Helvetica, sans-serif; color: #1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color: #0ea5e9; padding: 24px 32px;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">
                Squeaky Clean Boats
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">
                Hi ${escapeHtml(firstName)},
              </p>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">
                Just a quick reminder that your <strong>${escapeHtml(serviceType)}</strong> service is scheduled for tomorrow, <strong>${escapeHtml(serviceDate)}</strong>.
              </p>

              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">Boats being serviced:</p>
              <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 15px; line-height: 1.6;">
                ${boatItems}
              </ul>

              <p style="margin: 0 0 8px; font-size: 16px; line-height: 1.5;">We'll see you soon!</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px;">
              <p style="margin: 0 0 4px; font-size: 13px; color: #64748b; font-weight: 600;">The Squeaky Clean Boats Team</p>
              ${phoneBlock}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
