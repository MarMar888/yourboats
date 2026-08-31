'use client'

import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bell,
  Calendar,
  CalendarDays,
  CircleAlert,
  Clock,
  FileText,
  House,
  Inbox,
  Link2,
  Plus,
  ScrollText,
  Settings,
  Star,
  Timer,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import GlobalCreateModal from '@/components/global-create-modal'
import ReportErrorModal from '@/components/report-error-modal'
import { logout } from '@/app/(auth)/login/actions'
import type { CurrentUser } from '@/lib/auth/get-current-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'

type NavItem = { href: string; label: string; roles: CurrentUser['role'][]; icon: LucideIcon }
type NavGroup = { label: string; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { href: '/dashboard', label: 'Today', roles: ['owner', 'manager', 'employee'], icon: House },
      { href: '/schedule', label: 'Schedule', roles: ['owner', 'manager', 'employee'], icon: CalendarDays },
      { href: '/clock', label: 'Clock', roles: ['owner', 'manager', 'employee'], icon: Clock },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/customers', label: 'Customers', roles: ['owner', 'manager'], icon: Users },
      { href: '/quotes', label: 'Quotes', roles: ['owner', 'manager'], icon: Link2 },
      { href: '/client-requests', label: 'Client requests', roles: ['owner', 'manager'], icon: Inbox },
      { href: '/reminders', label: 'Reminders', roles: ['owner', 'manager'], icon: Bell },
      { href: '/complaints', label: 'Complaints', roles: ['owner', 'manager'], icon: CircleAlert },
      { href: '/exceptions', label: 'Exceptions', roles: ['owner', 'manager'], icon: Calendar },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/invoices', label: 'Invoices', roles: ['owner', 'manager'], icon: FileText },
      { href: '/pay', label: 'Pay', roles: ['owner', 'manager', 'employee'], icon: Banknote },
      { href: '/profit-loss', label: 'P&L', roles: ['owner'], icon: TrendingUp },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/team', label: 'Team', roles: ['owner'], icon: Users },
      { href: '/time', label: 'Time', roles: ['owner', 'manager'], icon: Timer },
      { href: '/performance', label: 'Performance', roles: ['owner', 'manager'], icon: Activity },
      { href: '/highlights', label: 'Highlights', roles: ['owner', 'manager', 'employee'], icon: Star },
      { href: '/settings', label: 'Settings', roles: ['owner', 'manager', 'employee'], icon: Settings },
      { href: '/logs', label: 'Logs', roles: ['owner'], icon: ScrollText },
    ],
  },
]

export function AppSidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const visibleGroups = useMemo(
    () =>
      navGroups
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
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <div className="flex items-center gap-2 px-1 py-1 min-h-[40px]">
            <Link
              href="/dashboard"
              onClick={(e) => startNavigationFromEvent('/dashboard', e)}
              onPointerDown={(e) => startNavigationFromEvent('/dashboard', e)}
              className={cn(
                'group flex items-center gap-2 font-semibold text-foreground transition-opacity group-data-[collapsible=icon]:hidden',
                isPending('/dashboard') && 'opacity-70'
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)] transition-shadow group-hover:shadow-[0_0_0_6px_hsl(var(--primary)/0.16)]" />
              <span className="tracking-tight truncate">Yourboats</span>
            </Link>
            <SidebarTrigger className="ml-auto shrink-0" />
          </div>
        </SidebarHeader>

        <SidebarContent>
          {visibleGroups.map((group, i) => (
            <SidebarGroup key={group.label} className={i > 0 ? 'pt-0' : undefined}>
              {i > 0 && <SidebarSeparator className="mb-3" />}
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    const pending = isPending(item.href)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className={cn(pending && !active && 'text-accent-foreground bg-accent')}
                        >
                          <Link
                            href={item.href}
                            aria-busy={pending || undefined}
                            onFocus={() => router.prefetch(item.href)}
                            onMouseEnter={() => router.prefetch(item.href)}
                            onClick={(e) => startNavigationFromEvent(item.href, e)}
                            onPointerDown={(e) => startNavigationFromEvent(item.href, e)}
                          >
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t gap-1 py-3">
          {canCreate && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setCreateOpen(true)} tooltip="New service">
                  <Plus />
                  <span>New</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setReportOpen(true)}
                tooltip="Report error"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <AlertTriangle />
                <span>Report error</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarSeparator />

          <div className="px-2 py-1 flex items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
            <div className="min-w-0">
              {process.env.NEXT_PUBLIC_DEV_AUTH === 'true' ? (
                <Link
                  href="/pick-user"
                  className="block truncate text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {user.displayName}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium text-foreground">{user.displayName}</p>
              )}
              <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
            </div>
            {process.env.NEXT_PUBLIC_DEV_AUTH !== 'true' && (
              <form action={logout}>
                <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground shrink-0">
                  Sign out
                </Button>
              </form>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <GlobalCreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <ReportErrorModal open={reportOpen} onOpenChange={setReportOpen} />
    </>
  )
}
