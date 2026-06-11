'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createUser } from './actions'

export function CreateUserForm() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [form, setForm] = useState({
    displayName: '',
    emailUser: '',   // just the part before @
    password: '',
    role: 'employee' as 'owner' | 'manager' | 'employee',
  })

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setError(null)
    setSuccess(null)
  }

  const fullEmail = form.emailUser.includes('@')
    ? form.emailUser.toLowerCase().trim()
    : `${form.emailUser.toLowerCase().trim()}@squeakycleanboats.com`

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await createUser({ ...form, email: fullEmail })
      if (result.error) {
        setError(result.error)
        toast.error(result.error)
      } else {
        setSuccess(`${form.displayName} has been added to the team.`)
        toast.success(`${form.displayName} added to the team`)
        setForm({ displayName: '', emailUser: '', password: '', role: 'employee' })
        setTimeout(() => setOpen(false), 1500)
      }
    })
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Add member
      </Button>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4 w-full max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Add team member</h2>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setSuccess(null) }}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Full name</label>
          <Input
            autoComplete="off"
            placeholder="e.g. Alex Johnson"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            required
            disabled={pending}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <div className="flex items-center border border-input rounded-md bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
            <input
              autoComplete="off"
              spellCheck={false}
              placeholder="miles"
              value={form.emailUser}
              onChange={(e) => set('emailUser', e.target.value.replace(/\s/g, ''))}
              required
              disabled={pending}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent outline-none"
            />
            <span className="pr-3 text-sm text-muted-foreground whitespace-nowrap select-none">
              @squeakycleanboats.com
            </span>
          </div>
          {form.emailUser.includes('@') && (
            <p className="text-xs text-muted-foreground">Using full email: {fullEmail}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Temporary password</label>
          <Input
            autoComplete="new-password"
            type="password"
            placeholder="Min. 6 characters"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            required
            disabled={pending}
            minLength={6}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Role</label>
          <select
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
            disabled={pending}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-600">{success}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="submit" size="sm" disabled={pending} className="flex-1">
            {pending ? 'Creating…' : 'Create account'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setOpen(false); setError(null) }}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
