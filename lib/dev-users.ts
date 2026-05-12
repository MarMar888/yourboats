import type { User } from '@/lib/db/schema'

export const DEV_USERS: Pick<User, 'id' | 'displayName' | 'role' | 'email'>[] = [
  { id: 'dev-owner', displayName: 'Marley (Owner)', role: 'owner', email: 'owner@yourboats.dev' },
  { id: 'dev-manager', displayName: 'Sam (Manager)', role: 'manager', email: 'manager@yourboats.dev' },
  { id: 'dev-employee', displayName: 'JD (Employee)', role: 'employee', email: 'employee@yourboats.dev' },
]

export const DEV_USER_COOKIE = 'dev_user'
