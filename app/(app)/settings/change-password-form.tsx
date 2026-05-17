'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth/client'

export default function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const currentPassword = (form.elements.namedItem('current') as HTMLInputElement).value
    const newPassword = (form.elements.namedItem('next') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (newPassword !== confirm) {
      setMessage({ text: 'New passwords do not match', error: true })
      return
    }
    if (newPassword.length < 8) {
      setMessage({ text: 'Password must be at least 8 characters', error: true })
      return
    }

    setMessage(null)
    startTransition(async () => {
      const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false })
      if (error) {
        setMessage({ text: error.message ?? 'Failed to update password', error: true })
      } else {
        setMessage({ text: 'Password updated', error: false })
        form.reset()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" name="current" type="password" required disabled={isPending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next">New password</Label>
        <Input id="next" name="next" type="password" required disabled={isPending} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" required disabled={isPending} />
      </div>
      {message && (
        <p className={`text-sm ${message.error ? 'text-destructive' : 'text-green-700'}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  )
}
