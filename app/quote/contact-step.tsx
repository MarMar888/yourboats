'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ContactStep({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  address,
  onAddressChange,
  notes,
  onNotesChange,
  message,
  onMessageChange,
}: {
  name: string
  onNameChange: (v: string) => void
  phone: string
  onPhoneChange: (v: string) => void
  email: string
  onEmailChange: (v: string) => void
  address: string
  onAddressChange: (v: string) => void
  notes: string
  onNotesChange: (v: string) => void
  message: string
  onMessageChange: (v: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Where should we send this?</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ll text or call to confirm scheduling. No account needed.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-name">Full name *</Label>
        <Input id="q-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Joe Ryan" required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="q-phone">Phone *</Label>
          <Input
            id="q-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="(612) 555-0100"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-email">Email</Label>
          <Input id="q-email" type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} placeholder="joe@example.com" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-address">Marina / dock address</Label>
        <Input
          id="q-address"
          value={address}
          onChange={(e) => onAddressChange(e.target.value)}
          placeholder="Slip 14, Lakeview Marina"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-notes">Anything we should know?</Label>
        <textarea
          id="q-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
          placeholder="Gate code, lift instructions, preferred day…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-message">Questions for us?</Label>
        <textarea
          id="q-message"
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          rows={3}
          placeholder="Ask us anything: pricing, scheduling, add-ons…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
      </div>
    </div>
  )
}
