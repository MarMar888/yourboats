import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEV_USERS, DEV_USER_COOKIE } from '@/lib/dev-users'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

async function pickUser(formData: FormData) {
  'use server'
  const id = formData.get('id') as string
  const cookieStore = await cookies()
  cookieStore.set(DEV_USER_COOKIE, id, { path: '/', httpOnly: true })
  redirect('/dashboard')
}

export default function PickUserPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">yourboats</CardTitle>
          <CardDescription>Who are you today?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {DEV_USERS.map((u) => (
            <form key={u.id}>
              <input type="hidden" name="id" value={u.id} />
              <Button formAction={pickUser} variant="outline" className="w-full justify-start gap-3">
                <span className="font-medium">{u.displayName}</span>
                <span className="ml-auto text-xs text-muted-foreground capitalize">{u.role}</span>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
