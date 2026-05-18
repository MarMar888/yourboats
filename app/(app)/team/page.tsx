import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { updateUserRole, toggleUserActive, updateUserTier } from './actions'

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  employee: 'Employee',
}

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  manager: 'secondary',
  employee: 'outline',
}

export default async function TeamPage() {
  const [currentUser, allUsers] = await Promise.all([
    getCurrentUser(),
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        active: users.active,
        tier: users.tier,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt)),
  ])

  const isOwner = currentUser?.role === 'owner'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Team</h1>
      </div>

      {allUsers.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No team members yet.
        </div>
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {allUsers.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-4 p-4">
              {/* User info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{user.displayName}</p>
                  <Badge variant={ROLE_BADGE_VARIANT[user.role] ?? 'outline'}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                  {user.tier && (
                    <span className={
                      `text-xs rounded-full px-2 py-0.5 font-medium ` +
                      (user.tier === 'top'
                        ? 'bg-green-100 text-green-800'
                        : user.tier === 'mid'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-orange-100 text-orange-800')
                    }>
                      {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)} tier
                    </span>
                  )}
                  {!user.active && (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              </div>

              {/* Owner-only controls */}
              {isOwner && (
                <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                  {/* Tier selector */}
                  <form
                    action={async (formData: FormData) => {
                      'use server'
                      const rawTier = formData.get('tier') as string
                      const tier = rawTier ? rawTier as 'top' | 'mid' | 'low' : null
                      await updateUserTier(user.id, tier)
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <label className="text-xs text-muted-foreground">Tier</label>
                    <select
                      name="tier"
                      defaultValue={user.tier ?? ''}
                      className="text-sm rounded-md border border-input bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">—</option>
                      <option value="top">Top</option>
                      <option value="mid">Mid</option>
                      <option value="low">Low</option>
                    </select>
                    <button type="submit" className="text-xs text-primary hover:underline">
                      Save
                    </button>
                  </form>

                  {/* Role selector */}
                  <form
                    action={async (formData: FormData) => {
                      'use server'
                      const role = formData.get('role') as 'owner' | 'manager' | 'employee'
                      await updateUserRole(user.id, role)
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <label className="text-xs text-muted-foreground">Role</label>
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="text-sm rounded-md border border-input bg-background px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                    <button type="submit" className="text-xs text-primary hover:underline">
                      Save
                    </button>
                  </form>

                  {/* Active toggle */}
                  <form
                    action={async () => {
                      'use server'
                      await toggleUserActive(user.id)
                    }}
                  >
                    <button
                      type="submit"
                      className={cn(
                        'text-xs hover:underline',
                        user.active ? 'text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {user.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
