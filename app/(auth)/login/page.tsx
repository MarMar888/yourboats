import { login, loginWithMagicLink } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">yourboats</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <p className="text-sm text-destructive text-center">{message}</p>
          )}

          <form className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button formAction={login} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <form>
            <div className="space-y-1">
              <Label htmlFor="magic-email">Email</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
              />
            </div>
            <Button formAction={loginWithMagicLink} variant="outline" className="w-full mt-3">
              Send magic link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
