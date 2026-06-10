'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AlertTriangle, ChevronDown, Menu, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import GlobalCreateModal from '@/components/global-create-modal'
import ReportErrorModal from '@/components/report-error-modal'
import { logout } from '@/app/(auth)/login/actions'
import type { CurrentUser } from '@/lib/auth/get-current-user'

type NavItem = { href: string; label: string; roles: CurrentUser['role'][] }
type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/dashboard', label: 'Today', roles: ['owner', 'manager', 'employee'] },
      { href: '/schedule', label: 'Schedule', roles: ['owner', 'manager', 'employee'] },
      { href: '/clock', label: 'Clock', roles: ['owner', 'manager', 'employee'] },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/customers', label: 'Customers', roles: ['owner', 'manager'] },
      { href: '/reminders', label: 'Reminders', roles: ['owner', 'manager'] },
      { href: '/complaints', label: 'Complaints', roles: ['owner', 'manager'] },
      { href: '/exceptions', label: 'Exceptions', roles: ['owner', 'manager'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/invoices', label: 'Invoices', roles: ['owner', 'manager'] },
      { href: '/pay', label: 'Pay', roles: ['owner', 'manager', 'employee'] },
      { href: '/profit-loss', label: 'P&L', roles: ['owner'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/team', label: 'Team', roles: ['owner'] },
      { href: '/time', label: 'Time', roles: ['owner', 'manager'] },
      { href: '/performance', label: 'Performance', roles: ['owner', 'manager'] },
      { href: '/settings', label: 'Settings', roles: ['owner', 'manager', 'employee'] },
      { href: '/logs', label: 'Logs', roles: ['owner'] },
    ],
  },
]

export default function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(user.role)),
    }))
    .filter((group) => group.items.length > 0)
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const canCreate = user.role === 'owner' || user.role === 'manager'
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <header className="border-b bg-white sticky top-0 z-40 relative">
        <div className="flex h-14 w-full items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="font-semibold text-primary shrink-0">
            yourboats
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
            {visibleGroups.map((group) => (
              <DropdownMenu.Root key={group.label}>
                <DropdownMenu.Trigger
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    group.items.some((item) => isActive(item.href))
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {group.label}
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="start"
                    sideOffset={6}
                    className="z-50 min-w-[190px] rounded-md border bg-white p-1 text-foreground shadow-md"
                  >
                    {group.items.map((item) => (
                      <DropdownMenu.Item key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            'block rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus:bg-muted',
                            isActive(item.href)
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground'
                          )}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
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
              <Button size="sm" onClick={() => setCreateOpen(true)} className="hidden md:inline-flex">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New
              </Button>
            )}
            <div className="hidden md:flex items-center gap-2 shrink-0">
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
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 border-b bg-white shadow-lg z-50 py-2">
            {visibleGroups.map((group) => (
              <div key={group.label} className="py-1">
                <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'block px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                      isActive(item.href)
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
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
                  className="inline-flex w-full items-center gap-2 text-left text-sm font-medium text-primary"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New service
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
