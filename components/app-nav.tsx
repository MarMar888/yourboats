'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import GlobalCreateModal from '@/components/global-create-modal'
import ReportErrorModal from '@/components/report-error-modal'
import { logout } from '@/app/(auth)/login/actions'
import type { CurrentUser } from '@/lib/auth/get-current-user'
import { AlertTriangle } from 'lucide-react'

const navItems: { href: string; label: string; roles: CurrentUser['role'][] }[] = [
  { href: '/dashboard', label: 'Today', roles: ['owner', 'manager', 'employee'] },
  { href: '/schedule', label: 'Schedule', roles: ['owner', 'manager', 'employee'] },
  { href: '/clock', label: 'Clock', roles: ['owner', 'manager', 'employee'] },
  { href: '/exceptions', label: 'Exceptions', roles: ['owner', 'manager'] },
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
  const [reportOpen, setReportOpen] = useState(false)
  const canCreate = user.role === 'owner' || user.role === 'manager'

  return (
    <>
      <header className="border-b bg-white sticky top-0 z-40 relative">
        <div className="flex h-14 w-full items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="font-semibold text-primary shrink-0">
            yourboats
          </Link>

          {/* Desktop nav */}
          <nav className="hidden xl:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'text-sm px-2 py-2.5 rounded-md transition-colors hover:bg-muted inline-flex items-center min-h-[44px] whitespace-nowrap shrink-0',
                  pathname.startsWith(item.href)
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <Button
              size="icon"
              onClick={() => { setMenuOpen(false); setReportOpen(true) }}
              aria-label="Report error"
              title="Report error"
              className="inline-flex h-9 w-9 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="hidden xl:inline-flex">
                + New
              </Button>
            )}
            <div className="hidden xl:flex items-center gap-2 shrink-0">
              {process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? (
                <Link
                  href="/pick-user"
                  className="max-w-36 truncate whitespace-nowrap text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {user.displayName} ({user.role})
                </Link>
              ) : (
                <span className="max-w-36 truncate whitespace-nowrap text-sm text-muted-foreground">
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
              className="xl:hidden flex items-center justify-center w-10 h-10 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              <span className="text-xl leading-none">{menuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="xl:hidden absolute top-14 left-0 right-0 border-b bg-white shadow-lg z-50 py-2">
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
            <div className="px-4 py-2 border-t mt-1">
              <button
                onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                className="w-full text-left text-sm text-destructive font-medium"
              >
                Report error
              </button>
            </div>
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
      <ReportErrorModal open={reportOpen} onOpenChange={setReportOpen} />
    </>
  )
}
