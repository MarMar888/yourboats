'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { DEV_USERS } from '@/lib/dev-users'

type DevUser = (typeof DEV_USERS)[number]

const navItems: { href: string; label: string; roles: DevUser['role'][] }[] = [
  { href: '/dashboard', label: 'Today', roles: ['owner', 'manager', 'employee'] },
  { href: '/schedule', label: 'Schedule', roles: ['owner', 'manager', 'employee'] },
  { href: '/customers', label: 'Customers', roles: ['owner', 'manager'] },
  { href: '/invoices', label: 'Invoices', roles: ['owner', 'manager'] },
  { href: '/complaints', label: 'Complaints', roles: ['owner', 'manager'] },
  { href: '/team', label: 'Team', roles: ['owner'] },
  { href: '/settings', label: 'Settings', roles: ['owner'] },
]

export default function AppNav({ user }: { user: DevUser }) {
  const pathname = usePathname()
  const visible = navItems.filter((item) => item.roles.includes(user.role))

  return (
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
                'text-sm px-3 py-1.5 rounded-md transition-colors hover:bg-muted',
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
          <span className="text-sm text-muted-foreground capitalize">{user.role}</span>
          <Link
            href="/pick-user"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {user.displayName}
          </Link>
        </div>
      </div>
    </header>
  )
}
