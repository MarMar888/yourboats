'use client'

import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
      { href: '/highlights', label: 'Highlights', roles: ['owner', 'manager', 'employee'] },
      { href: '/settings', label: 'Settings', roles: ['owner', 'manager', 'employee'] },
      { href: '/logs', label: 'Logs', roles: ['owner'] },
    ],
  },
]

export default function AppNav({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const visibleGroups = useMemo(
    () => navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.roles.includes(user.role)),
      }))
      .filter((group) => group.items.length > 0),
    [user.role]
  )
  const visibleHrefs = useMemo(
    () => Array.from(new Set(visibleGroups.flatMap((group) => group.items.map((item) => item.href)))),
    [visibleGroups]
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const canCreate = user.role === 'owner' || user.role === 'manager'
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const isPending = (href: string) => pendingHref === href

  useEffect(() => {
    const prefetchRoutes = () => {
      for (const href of visibleHrefs) {
        if (pathname !== href && !pathname.startsWith(`${href}/`)) router.prefetch(href)
      }
    }

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetchRoutes, { timeout: 1500 })
      return () => window.cancelIdleCallback(id)
    }

    const timeout = globalThis.setTimeout(prefetchRoutes, 250)
    return () => globalThis.clearTimeout(timeout)
  }, [pathname, router, visibleHrefs])

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  useEffect(() => {
    if (!pendingHref) return
    const timeout = globalThis.setTimeout(() => setPendingHref(null), 8000)
    return () => globalThis.clearTimeout(timeout)
  }, [pendingHref])

  function startNavigation(href: string) {
    if (!isActive(href)) setPendingHref(href)
  }

  function startNavigationFromEvent(
    href: string,
    event: MouseEvent<HTMLAnchorElement> | PointerEvent<HTMLAnchorElement>
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    startNavigation(href)
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/78">
        <div className="flex h-14 w-full items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            onClick={(event) => startNavigationFromEvent('/dashboard', event)}
            onPointerDown={(event) => startNavigationFromEvent('/dashboard', event)}
            className={cn(
              'group flex shrink-0 items-center gap-2 font-semibold text-foreground transition-opacity',
              isPending('/dashboard') && 'opacity-70'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] transition-shadow group-hover:shadow-[0_0_0_6px_hsl(var(--primary)/0.16)]" />
            <span className="tracking-tight">yourboats</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
            {visibleGroups.map((group) => (
              <DropdownMenu.Root key={group.label}>
                <DropdownMenu.Trigger
                  className={cn(
                    'inline-flex min-h-[40px] items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    group.items.some((item) => isActive(item.href) || isPending(item.href))
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
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
                    className="z-50 min-w-[200px] rounded-lg border bg-card p-1.5 text-foreground shadow-[0_16px_40px_hsl(var(--foreground)/0.14)]"
                  >
                    {group.items.map((item) => (
                      <DropdownMenu.Item key={item.href} asChild>
                        <Link
                          href={item.href}
                          aria-busy={isPending(item.href) || undefined}
                          onFocus={() => router.prefetch(item.href)}
                          onMouseEnter={() => router.prefetch(item.href)}
                          onClick={(event) => startNavigationFromEvent(item.href, event)}
                          onPointerDown={(event) => startNavigationFromEvent(item.href, event)}
                          className={cn(
                            'block rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-muted focus:bg-muted',
                            isActive(item.href)
                              ? 'bg-primary/10 font-semibold text-primary'
                              : isPending(item.href)
                              ? 'bg-accent font-semibold text-accent-foreground'
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
              className="inline-flex h-9 w-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                  className="max-w-40 truncate whitespace-nowrap rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {user.displayName} ({user.role})
                </Link>
              ) : (
                <span className="max-w-40 truncate whitespace-nowrap text-sm text-muted-foreground">
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
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="absolute left-0 right-0 top-14 z-50 border-b bg-card shadow-[0_18px_40px_hsl(var(--foreground)/0.16)] md:hidden">
            <div className="border-b bg-muted/35 px-4 py-3">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
            </div>
            {visibleGroups.map((group) => (
              <div key={group.label} className="py-1">
                <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-busy={isPending(item.href) || undefined}
                    onFocus={() => router.prefetch(item.href)}
                    onMouseEnter={() => router.prefetch(item.href)}
                    onClick={(event) => {
                      startNavigationFromEvent(item.href, event)
                      setMenuOpen(false)
                    }}
                    onPointerDown={(event) => startNavigationFromEvent(item.href, event)}
                    className={cn(
                      'block px-4 py-2.5 text-sm transition-colors hover:bg-muted',
                      isActive(item.href)
                        ? 'border-l-2 border-primary bg-primary/10 font-semibold text-primary'
                        : isPending(item.href)
                        ? 'border-l-2 border-accent-foreground bg-accent font-semibold text-accent-foreground'
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
                className="w-full rounded-md px-2 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                Report error
              </button>
            </div>
            {canCreate && (
              <div className="px-4 py-2 border-t mt-1">
                <button
                  onClick={() => { setMenuOpen(false); setCreateOpen(true) }}
                  className="inline-flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New service
                </button>
              </div>
            )}
          </div>
        )}
        {pendingHref && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary/10" aria-hidden="true">
            <div className="h-full w-1/3 animate-nav-progress rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.45)]" />
          </div>
        )}
      </header>

      <GlobalCreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <ReportErrorModal open={reportOpen} onOpenChange={setReportOpen} />
    </>
  )
}
