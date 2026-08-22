'use client'

import { useRef, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { requestInfo } from '@/app/request-info-action'

export function RequestInfoForm() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  if (status === 'success') {
    return (
      <p className="mt-4 text-sm font-medium text-primary" role="status">
        Thanks — we&apos;ll reach out soon.
      </p>
    )
  }

  return (
    <form
      ref={formRef}
      className="mt-4 flex flex-wrap items-end gap-2"
      action={(formData) => {
        setError(null)
        startTransition(async () => {
          const result = await requestInfo(formData)
          if (result.ok) {
            setStatus('success')
          } else {
            setError(result.error)
          }
        })
      }}
    >
      {/* Honeypot: hidden from real visitors, bots tend to fill every field. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-1">
        <Label htmlFor="phone" className="text-xs text-muted-foreground">
          Want more info? Leave your number.
        </Label>
        <div className="flex gap-2">
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="(555) 123-4567"
            required
            className="h-10 w-44 sm:w-52"
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" variant="outline" disabled={isPending}>
            {isPending ? 'Sending…' : 'Request info'}
          </Button>
        </div>
        {error ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}
