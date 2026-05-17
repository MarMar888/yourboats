'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '@/lib/auth/get-current-user'
import { Button } from '@/components/ui/button'
import GlobalCreateModal from '@/components/global-create-modal'

type UserRole = CurrentUser['role']

const navItems: { href: string; label: string; roles: UserRole[] }[] = [
  { href: '/dashboard', label: 'Today', roles: ['owner', 'manager', 'employee'] },
  { href: '/schedule', label: 'Schedule', roles: ['owner', 'manager', 'employee'] },
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
                  'shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted',
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
            <span className="hidden text-sm text-muted-foreground capitalize lg:inline">{user.role}</span>
            {process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? (
              <Link
                href="/pick-user"
                className="hidden max-w-36 truncate text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                {user.displayName}
              </Link>
            ) : (
              <span className="hidden max-w-36 truncate text-sm font-medium text-muted-foreground sm:block">
                {user.displayName}
              </span>
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
              </div>
            </nav>
          </div>
        )}
      </header>

      {canCreate && (
        <GlobalCreateModal open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </>
  )
}
