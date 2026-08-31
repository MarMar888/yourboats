import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isDemoModeEnabled, DEMO_URL } from '@/lib/demo-mode'
import { getClientSession } from '@/lib/auth/client-session'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  // This deployment IS the demo branch — skip straight to the role picker,
  // there's no real Neon Auth configured here.
  if (isDemoModeEnabled()) redirect('/demo')

  // A customer who already verified a code on this device goes straight to
  // their corner instead of seeing the sign-in form again.
  const clientSession = await getClientSession()
  if (clientSession) redirect('/client')

  const { message } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm overflow-hidden">
        <div className="h-1 bg-primary" />
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Yourboats</CardTitle>
          <p className="text-sm font-medium text-muted-foreground">Squeaky Clean Boat Services</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{message}</p>
          )}

          <LoginForm />

          <p className="text-center text-sm text-muted-foreground">
            Just looking?{' '}
            <Link
              href={DEMO_URL}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              See a demo
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
