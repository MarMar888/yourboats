'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createMcpToken, revokeMcpToken, type McpTokenRow } from './mcp-token-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const selectCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50'

function fmtDate(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

function tokenStatus(t: McpTokenRow): { label: string; cls: string } {
  if (t.revokedAt) return { label: 'Revoked', cls: 'bg-red-100 text-red-600' }
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now())
    return { label: 'Expired', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Active', cls: 'bg-green-100 text-green-700' }
}

export function McpTokensPanel({ tokens }: { tokens: McpTokenRow[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [expiresDays, setExpiresDays] = useState(90)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState('')

  const mcpUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp'
  const connectCmd = newToken
    ? `claude mcp add --transport http florence ${mcpUrl} --header "Authorization: Bearer ${newToken}"`
    : ''

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError('')
    setNewToken(null)
    setCopied('')
    startTransition(async () => {
      const res = await createMcpToken({ name, expiresDays })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setNewToken(res.token)
      setName('')
      router.refresh()
    })
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      await revokeMcpToken(id)
      router.refresh()
    })
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div className="space-y-4">
      {/* One-time reveal of the newly created token */}
      {newToken && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
          <p className="text-sm font-medium text-green-800">
            Token created — copy it now. You won’t be able to see it again.
          </p>
          <code className="block text-xs bg-white border rounded px-2 py-1 break-all">{newToken}</code>
          <p className="text-xs text-muted-foreground">Add it to Claude Code:</p>
          <code className="block text-xs bg-white border rounded px-2 py-1 break-all">{connectCmd}</code>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(newToken, 'token')}>
              Copy token
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(connectCmd, 'cmd')}>
              Copy command
            </Button>
            {copied && <span className="text-xs text-green-700">✓ Copied {copied}</span>}
          </div>
        </div>
      )}

      {/* Existing tokens */}
      {tokens.length > 0 && (
        <div className="divide-y rounded-lg border overflow-hidden text-sm">
          {tokens.map((t) => {
            const status = tokenStatus(t)
            return (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{t.name}</span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${status.cls}`}
                    >
                      {status.label}
                    </span>
                    <code className="text-xs text-muted-foreground">{t.tokenPrefix}…</code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {fmtDate(t.createdAt)} · Last used {fmtDate(t.lastUsedAt)} · Expires{' '}
                    {fmtDate(t.expiresAt)}
                  </p>
                </div>
                {!t.revokedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={pending}
                    onClick={() => handleRevoke(t.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create form */}
      <form onSubmit={handleCreate} className="space-y-3 border rounded-lg p-4">
        <p className="text-sm font-medium">Generate a token</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mcp-token-name" className="text-xs">
              Name
            </Label>
            <Input
              id="mcp-token-name"
              placeholder="e.g. My laptop / Claude Code"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mcp-token-exp" className="text-xs">
              Expires
            </Label>
            <select
              id="mcp-token-exp"
              className={selectCls}
              value={expiresDays}
              onChange={(e) => setExpiresDays(Number(e.target.value))}
              disabled={pending}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
              <option value={0}>No expiry</option>
            </select>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Generating…' : 'Generate token'}
        </Button>
      </form>
    </div>
  )
}
