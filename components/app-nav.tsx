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
  { href: '/clock', label: 'Clock', roles: ['owner', 'manager', 'employee'] },
  { href: '/reminders', label: 'Reminders', roles: ['owner', 'manager'] },
  { href: '/customers', label: 'Customers', roles: ['owner', 'manager'] },
  { href: '/invoices', label: 'Invoices', roles: ['owner', 'manager'] },
  { href: '/complaints', label: 'Complaints', roles: ['owner', 'manager'] },
  { href: '/team', label: 'Team', roles: ['owner'] },
  { href: '/time', label: 'Time', roles: ['owner', 'manager'] },
  { href: '/pay', label: 'Pay', roles: ['owner', 'manager', 'employee'] },
  { href: '/performance', label: 'Performance', roles: ['owner', 'manager'] },
  { href: '/settings', label: 'Settings', roles: ['owner', 'manager', 'employee'] },
  { href: '/profit-loss', label: 'P&L', roles: ['owner'] },
  { href: '/logs', label: 'Logs', roles: ['owner'] },
]

export default function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const visible = navItems.filter((item) => item.roles.includes(user.role))
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const canCreate = user.role === 'owner' || user.role === 'manager'

  return (
    <>
      <header className="border-b bg-background sticky top-0 z-40 relative">
        <div className="container flex h-14 items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-primary shrink-0">
            yourboats
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
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

          <div className="flex items-center gap-3 ml-auto">
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="hidden md:inline-flex">
                + New
              </Button>
            )}
            <div className="hidden md:flex items-center gap-3">
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

            {/* Hamburger for mobile */}
            <button
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              <span className="text-xl leading-none">{menuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 border-b bg-background shadow-lg z-50 py-2">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'block px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                  pathname.startsWith(item.href)
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
            {canCreate && (
              <div className="px-4 py-2 border-t mt-1">
                <button
                  onClick={() => { setMenuOpen(false); setCreateOpen(true) }}
                  className="w-full text-left text-sm text-primary font-medium"
                >
                  + New service
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <GlobalCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
