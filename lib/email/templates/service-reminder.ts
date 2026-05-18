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

export function serviceReminderEmail(_params: {
  customerName: string
  serviceDate: string
  boats: string[]
  serviceType: string
  businessPhone?: string
}): { subject: string; text: string; html: string } {
  const subject = 'Reminder: Boat Services Tomorrow'
  const text = 'Reminder: Boat Services Tomorrow'
  return { subject, text, html: text }
}
