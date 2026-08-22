import Link from 'next/link'
import { redirect } from 'next/navigation'
import { login } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isDemoModeEnabled, DEMO_URL } from '@/lib/demo-mode'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  // This deployment IS the demo branch — skip straight to the role picker,
  // there's no real Neon Auth configured here.
  if (isDemoModeEnabled()) redirect('/demo')

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

          <form className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="username">Name</Label>
              <div className="flex items-center rounded-md border border-input bg-card shadow-inner shadow-foreground/[0.03] ring-offset-background transition-colors focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-ring/30 focus-within:ring-offset-1">
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="mrpeanut"
                  required
                  autoComplete="username"
                  className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <span className="pr-3 text-sm text-muted-foreground whitespace-nowrap">@squeakycleanboats.com</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            <Button formAction={login} className="w-full">
              Sign in
            </Button>
          </form>

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
