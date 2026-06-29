import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { qboTokens, customers, invoices, services } from '@/lib/db/schema'
import { eq, isNull } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ImportCustomersButton from './import-customers-button'
import SyncQboItemsButton from './sync-qbo-items-button'
import ReminderTestPanel from './reminder-test-panel'
import ChangePasswordForm from './change-password-form'
import InvoiceTestButton from './invoice-test-button'
import ScheduleReminderTestButton from './schedule-reminder-test-button'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { QboSyncHealth } from './qbo-sync-health'
import { ReconcileDocNumbersButton } from './reconcile-doc-numbers-button'
import { TeamAccountsPanel } from './team-accounts-panel'
import { listTeamMembers } from './team-actions'
import { McpTokensPanel } from './mcp-tokens-panel'
import { listMcpTokens } from './mcp-token-actions'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ qbo?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const isManager = user.role === 'owner' || user.role === 'manager'

  // Personal MCP access tokens — self for employees/managers, all for owner.
  const mcpTokenRows = await listMcpTokens()

  // Employees only see the password card — skip all the business data fetching
  if (!isManager) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Settings</h1>
        <div className="space-y-4 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Update your login password.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI access tokens (MCP)</CardTitle>
              <CardDescription>
                Generate a personal token to drive yourboats from an AI client (e.g. Claude Code)
                as yourself. Tokens act with your role and can be revoked anytime.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <McpTokensPanel tokens={mcpTokenRows} />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const { qbo } = await searchParams
  const [tokens] = await db.select().from(qboTokens).where(eq(qboTokens.id, 1)).limit(1)
  const connected = !!tokens

  // Team members — owner only
  const teamMembers = user.role === 'owner' ? await listTeamMembers() : []

  // QBO sync health data — only queried when connected
  const [unsyncedCustomers, staleInvoices] = connected
    ? await Promise.all([
        db
          .select({ id: customers.id, name: customers.name, email: customers.email })
          .from(customers)
          .where(isNull(customers.qboCustomerId)),
        db
          .select({
            id: invoices.id,
            customerName: customers.name,
            serviceDate: services.serviceDate,
            amount: invoices.amount,
            status: invoices.status,
          })
          .from(invoices)
          .innerJoin(services, eq(invoices.serviceId, services.id))
          .innerJoin(customers, eq(services.customerId, customers.id))
          .where(eq(invoices.qboNeedsSync, true)),
      ])
    : [[], []]

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
            <CardTitle>AI access tokens (MCP)</CardTitle>
            <CardDescription>
              Generate a personal token to drive yourboats from an AI client (e.g. Claude Code)
              as yourself. Tokens act with your role and can be revoked anytime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <McpTokensPanel tokens={mcpTokenRows} />
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

        {user.role === 'owner' && (
          <Card>
            <CardHeader>
              <CardTitle>Invoice SMS test</CardTitle>
              <CardDescription>
                Sends a test invoice message to the Google Voice number to verify the single-line format arrives correctly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvoiceTestButton />
            </CardContent>
          </Card>
        )}

        {user.role === 'owner' && (
          <Card>
            <CardHeader>
              <CardTitle>Schedule reminder test</CardTitle>
              <CardDescription>
                Sends a test approval reminder text to Nate. The automated version runs Monday and Tuesday at 10am CST whenever the week is not yet approved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleReminderTestButton />
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

        {connected && user.role === 'owner' && (
          <Card>
            <CardHeader>
              <CardTitle>Reconcile invoice numbers</CardTitle>
              <CardDescription>
                Fetch the real invoice number from QuickBooks for every synced invoice and update
                yourboats to match. Run this once to fix any numbers assigned before this was automated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReconcileDocNumbersButton />
            </CardContent>
          </Card>
        )}

        {connected && (
          <QboSyncHealth
            unsyncedCustomers={unsyncedCustomers}
            staleInvoices={staleInvoices}
          />
        )}

        {user.role === 'owner' && (
          <Card>
            <CardHeader>
              <CardTitle>Team accounts</CardTitle>
              <CardDescription>
                Create logins for new team members or reset a password. Role and tier changes
                take effect immediately for future actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamAccountsPanel members={teamMembers} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
