'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveLogin, login } from './actions'
import { verifyClientOtp } from './client-actions'

type Step = 'email' | 'password' | 'otp'

export function LoginForm() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitEmail(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const route = await resolveLogin(email)
      if (route.mode === 'password') {
        setStep('password')
      } else {
        setNotice(route.message)
        setStep('otp')
      }
    })
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await login(email, password)
      if (result?.error) setError(result.error)
      // On success the action redirects server-side.
    })
  }

  function submitCode(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await verifyClientOtp(email, code)
      if (result?.error) setError(result.error)
      // On success the action redirects server-side.
    })
  }

  function reset() {
    setStep('email')
    setPassword('')
    setCode('')
    setNotice(null)
    setError(null)
  }

  if (step === 'email') {
    return (
      <form className="space-y-3" onSubmit={submitEmail}>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending || !email}>
          {isPending ? 'Checking…' : 'Continue'}
        </Button>
      </form>
    )
  }

  if (step === 'password') {
    return (
      <form className="space-y-3" onSubmit={submitPassword}>
        <p className="text-sm text-muted-foreground">{email}</p>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isPending || !password}>
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={reset}
        >
          Use a different email
        </button>
      </form>
    )
  }

  return (
    <form className="space-y-3" onSubmit={submitCode}>
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      <div className="space-y-1">
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
      </div>
      {error && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isPending || code.length < 6}>
        {isPending ? 'Verifying…' : 'Verify code'}
      </Button>
      <button
        type="button"
        className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        onClick={reset}
      >
        Use a different email
      </button>
    </form>
  )
}
