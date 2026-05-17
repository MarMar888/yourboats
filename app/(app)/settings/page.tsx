import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { qboTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ImportCustomersButton from './import-customers-button'
import SyncQboItemsButton from './sync-qbo-items-button'
import ReminderTestPanel from './reminder-test-panel'
import ChangePasswordForm from './change-password-form'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) redirect('/dashboard')

  const { qbo } = await searchParams
  const [tokens] = await db.select().from(qboTokens).where(eq(qboTokens.id, 1)).limit(1)
  const connected = !!tokens

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="space-y-4 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Update your login password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QuickBooks Online</CardTitle>
            <CardDescription>
              Connect your QBO account to push invoices and sync customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qbo === 'connected' && (
              <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                QuickBooks connected successfully.
              </p>
            )}
            {qbo === 'error' && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                Connection failed. Check your QBO credentials and try again.
              </p>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-sm text-muted-foreground">
                  {connected
                    ? `Connected · last updated ${tokens.updatedAt.toLocaleDateString()}`
                    : 'Not connected'}
                </p>
              </div>
              <Button asChild variant={connected ? 'outline' : 'default'}>
                <a href="/api/qbo/connect">
                  {connected ? 'Reconnect' : 'Connect QuickBooks'}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reminder emails</CardTitle>
            <CardDescription>
              Test the nightly reminder email for any service date. Dry run shows who would receive without sending — useful for checking before you go live.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReminderTestPanel />
          </CardContent>
        </Card>

        {connected && (
          <Card>
            <CardHeader>
              <CardTitle>Import customers</CardTitle>
              <CardDescription>
                Pull all active customers from QuickBooks into yourboats. Safe to run multiple
                times — existing customers are updated, not duplicated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportCustomersButton />
            </CardContent>
          </Card>
        )}

        {connected && (
          <Card>
            <CardHeader>
              <CardTitle>Sync QBO items</CardTitle>
              <CardDescription>
                Pull your active products/services from QuickBooks into yourboats. These are used
                when creating invoices — run this after adding or changing items in QBO.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SyncQboItemsButton />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
