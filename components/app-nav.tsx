'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import GlobalCreateModal from '@/components/global-create-modal'
import { logout } from '@/app/(auth)/login/actions'
import type { CurrentUser } from '@/lib/auth/get-current-user'

const navItems: { href: string; label: string; roles: CurrentUser['role'][] }[] = [
  { href: '/dashboard', label: 'Today', roles: ['owner', 'manager', 'employee'] },
  { href: '/schedule', label: 'Schedule', roles: ['owner', 'manager', 'employee'] },
  { href: '/reminders', label: 'Reminders', roles: ['owner', 'manager'] },
  { href: '/customers', label: 'Customers', roles: ['owner', 'manager'] },
  { href: '/invoices', label: 'Invoices', roles: ['owner', 'manager'] },
  { href: '/complaints', label: 'Complaints', roles: ['owner', 'manager'] },
  { href: '/team', label: 'Team', roles: ['owner'] },
  { href: '/pay', label: 'Pay', roles: ['owner', 'manager'] },
  { href: '/settings', label: 'Settings', roles: ['owner'] },
]

export default function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const visible = navItems.filter((item) => item.roles.includes(user.role))
  const [createOpen, setCreateOpen] = useState(false)
  const canCreate = user.role === 'owner' || user.role === 'manager'

  return (
    <>
      <header className="border-b bg-background sticky top-0 z-40">
        <div className="container flex h-14 items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-primary">
            yourboats
          </Link>

          <nav className="flex items-center gap-1 flex-1">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-sm px-3 py-2.5 rounded-md transition-colors hover:bg-muted inline-flex items-center min-h-[44px]',
                  pathname.startsWith(item.href)
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                + New
              </Button>
            )}
            {process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? (
              <Link
                href="/pick-user"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {user.displayName} ({user.role})
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">
                {user.displayName}
              </span>
            )}
            {process.env.NEXT_PUBLIC_DEV_AUTH !== 'true' && (
              <form action={logout}>
                <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
                  Sign out
                </Button>
              </form>
            )}
          </div>
        </div>
      </header>

      <GlobalCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
