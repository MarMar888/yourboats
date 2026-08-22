import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { DEMO_ROLES, DEMO_USER_COOKIE } from '@/lib/demo-mode'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

async function enterDemo(formData: FormData) {
  'use server'
  const role = formData.get('role') as string
  const cookieStore = await cookies()
  cookieStore.set(DEMO_USER_COOKIE, role, { path: '/', httpOnly: true })
  redirect('/dashboard')
}

export default function DemoPickerPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm overflow-hidden">
        <div className="h-1 bg-primary" />
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Yourboats</CardTitle>
          <CardDescription>See it as an owner, manager, or crew member.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {DEMO_ROLES.map((r) => (
            <form key={r.role}>
              <input type="hidden" name="role" value={r.role} />
              <Button formAction={enterDemo} variant="outline" className="w-full justify-start gap-3">
                <span className="font-medium">{r.label}</span>
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
