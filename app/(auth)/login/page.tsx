import { login } from './actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
          <CardTitle>Squeaky Clean Boat Services</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <p className="text-sm text-destructive text-center">{message}</p>
          )}

          <form className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="username">Name</Label>
              <div className="flex items-center rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
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
        </CardContent>
      </Card>
    </div>
  )
}
