'use client'

import { useState, useTransition } from 'react'
import { createTeamAccount, setTeamMemberPassword, updateTeamMember } from './team-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamMember = {
  id: string
  email: string
  displayName: string
  role: 'owner' | 'manager' | 'employee'
  tier: 'top' | 'mid' | 'low' | null
  active: boolean
}

interface TeamAccountsPanelProps {
  members: TeamMember[]
}

// ── Shared select style ────────────────────────────────────────────────────────

const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed'
const selectSmCls = 'h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed'

// ── Role / tier display helpers ────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', manager: 'Manager', employee: 'Employee' }
const TIER_LABELS: Record<string, string> = { top: 'Top', mid: 'Mid', low: 'Low' }

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    owner: 'bg-violet-100 text-violet-700',
    manager: 'bg-blue-100 text-blue-700',
    employee: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded', colors[role] ?? colors.employee)}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

// ── Create account form ────────────────────────────────────────────────────────

function CreateAccountForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee' as 'owner' | 'manager' | 'employee',
    tier: '' as 'top' | 'mid' | 'low' | '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    startTransition(async () => {
      const result = await createTeamAccount({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        tier: (form.tier as 'top' | 'mid' | 'low') || null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setForm({ name: '', email: '', password: '', role: 'employee', tier: '' })
        onCreated()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="new-name" className="text-xs">Full name</Label>
          <Input
            id="new-name"
            placeholder="Jane Smith"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-email" className="text-xs">Email</Label>
          <Input
            id="new-email"
            type="email"
            placeholder="jane@squeakycleanboats.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="new-password" className="text-xs">Temporary password</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="Min. 8 characters"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
          minLength={8}
          disabled={pending}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="new-role" className="text-xs">Role</Label>
          <select
            id="new-role"
            className={selectCls}
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof f.role }))}
            disabled={pending}
          >
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        {form.role === 'employee' && (
          <div className="space-y-1">
            <Label htmlFor="new-tier" className="text-xs">Pay tier</Label>
            <select
              id="new-tier"
              className={selectCls}
              value={form.tier}
              onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as typeof f.tier }))}
              disabled={pending}
            >
              <option value="">None</option>
              <option value="top">Top</option>
              <option value="mid">Mid</option>
              <option value="low">Low</option>
            </select>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">
          Account created — share the temporary password with them. They can change it after logging in.
        </p>
      )}

      <Button type="submit" disabled={pending} size="sm">
        {pending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  )
}

// ── Set password form (per user) ───────────────────────────────────────────────

function SetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    startTransition(async () => {
      const result = await setTeamMemberPassword(userId, password)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setPassword('')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        type="password"
        placeholder="New password (min. 8)"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setSuccess(false); setError('') }}
        minLength={8}
        required
        disabled={pending}
        className="h-8 text-sm"
        aria-label={`New password for ${name}`}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8 shrink-0">
        {pending ? 'Saving…' : 'Set'}
      </Button>
      {success && <span className="text-xs text-green-700">✓ Updated</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  )
}

// ── Role / status editor (inline) ─────────────────────────────────────────────

function RoleEditor({ member, onUpdate }: { member: TeamMember; onUpdate: () => void }) {
  const [role, setRole] = useState(member.role)
  const [tier, setTier] = useState<string>(member.tier ?? '')
  const [active, setActive] = useState(member.active)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const dirty = role !== member.role || (tier || null) !== member.tier || active !== member.active

  function handleSave() {
    setSaved(false)
    startTransition(async () => {
      const result = await updateTeamMember(member.id, {
        role,
        tier: (tier as 'top' | 'mid' | 'low') || null,
        active,
      })
      if (!result.error) {
        setSaved(true)
        onUpdate()
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectSmCls}
        value={role}
        onChange={(e) => { setRole(e.target.value as typeof role); setSaved(false) }}
        disabled={pending}
      >
        <option value="employee">Employee</option>
        <option value="manager">Manager</option>
        <option value="owner">Owner</option>
      </select>

      {role === 'employee' && (
        <select
          className={selectSmCls}
          value={tier}
          onChange={(e) => { setTier(e.target.value); setSaved(false) }}
          disabled={pending}
        >
          <option value="">No tier</option>
          <option value="top">Top</option>
          <option value="mid">Mid</option>
          <option value="low">Low</option>
        </select>
      )}

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => { setActive(e.target.checked); setSaved(false) }}
          disabled={pending}
          className="accent-primary"
        />
        Active
      </label>

      {dirty && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSave} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      )}
      {saved && !dirty && <span className="text-xs text-green-700">✓ Saved</span>}
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export function TeamAccountsPanel({ members }: TeamAccountsPanelProps) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function refresh() {
    router.refresh()
  }

  return (
    <div className="space-y-4">

      {/* Existing members */}
      <div className="divide-y rounded-lg border overflow-hidden text-sm">
        {members.map((m) => {
          const expanded = expandedId === m.id
          return (
            <div key={m.id} className={cn('px-4 py-3 transition-colors', !m.active && 'opacity-50')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium leading-tight">{m.displayName}</span>
                    {roleBadge(m.role)}
                    {m.tier && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        {TIER_LABELS[m.tier]}
                      </span>
                    )}
                    {!m.active && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                </div>
                <button
                  onClick={() => setExpandedId(expanded ? null : m.id)}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline shrink-0"
                >
                  {expanded ? 'Close' : 'Edit'}
                </button>
              </div>

              {expanded && (
                <div className="mt-3 space-y-4 pt-3 border-t border-dashed">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Role &amp; status</p>
                    <RoleEditor member={m} onUpdate={refresh} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Set password</p>
                    <SetPasswordForm userId={m.id} name={m.displayName} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Create account */}
      {!showCreate ? (
        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
          + Add team member
        </Button>
      ) : (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">New account</p>
            <button
              onClick={() => setShowCreate(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <CreateAccountForm onCreated={() => { setShowCreate(false); refresh() }} />
        </div>
      )}
    </div>
  )
}
