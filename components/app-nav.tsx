'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Plus, X } from 'lucide-react'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const canCreate = user.role === 'owner' || user.role === 'manager'

  return (
    <>
      <header className="border-b bg-background sticky top-0 z-40">
        <div className="container flex min-h-14 items-center gap-3 px-4 py-2 sm:px-6 lg:gap-6">
          <Link href="/dashboard" className="shrink-0 font-semibold text-primary">
            yourboats
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex min-h-[44px] shrink-0 items-center rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted',
                  pathname.startsWith(item.href)
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="shrink-0 gap-1.5">
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}
            {process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? (
              <Link
                href="/pick-user"
                className="hidden max-w-40 truncate text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                {user.displayName} ({user.role})
              </Link>
            ) : (
              <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:block">
                {user.displayName}
              </span>
            )}
            {process.env.NEXT_PUBLIC_DEV_AUTH !== 'true' && (
              <form action={logout} className="hidden sm:block">
                <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
                  Sign out
                </Button>
              </form>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="px-2 md:hidden"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t md:hidden">
            <nav className="container grid gap-1 px-4 py-3">
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted',
                    pathname.startsWith(item.href)
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 border-t pt-3 text-sm text-muted-foreground">
                <p className="capitalize">{user.role}</p>
                {process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? (
                  <Link href="/pick-user" className="font-medium text-foreground">
                    {user.displayName}
                  </Link>
                ) : (
                  <p className="font-medium text-foreground">{user.displayName}</p>
                )}
                {process.env.NEXT_PUBLIC_DEV_AUTH !== 'true' && (
                  <form action={logout} className="mt-2">
                    <Button variant="outline" size="sm" type="submit">
                      Sign out
                    </Button>
                  </form>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <GlobalCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
