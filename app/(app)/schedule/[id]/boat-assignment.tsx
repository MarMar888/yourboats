'use client'

import { useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateBoatAssignments } from './actions'

type Employee = { id: string; displayName: string }

type Props = {
  serviceId: string
  boatId: string
  employees: Employee[]
  assignedIds: string[]
}

export function BoatAssignment({ serviceId, boatId, employees, assignedIds }: Props) {
  const [isPending, startTransition] = useTransition()

  const toggle = (uid: string) => {
    const next = assignedIds.includes(uid)
      ? assignedIds.filter((id) => id !== uid)
      : [...assignedIds, uid]
    startTransition(() => updateBoatAssignments(serviceId, boatId, next))
  }

  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1.5 transition-opacity', isPending && 'opacity-50')}>
      {employees.map((emp) => {
        const active = assignedIds.includes(emp.id)
        return (
          <button
            key={emp.id}
            type="button"
            onClick={() => toggle(emp.id)}
            disabled={isPending}
            className={cn(
              'min-w-0 max-w-full truncate px-2.5 py-0.5 rounded-full border text-xs font-medium transition-colors',
              active
                ? 'bg-foreground text-background border-transparent shadow-sm'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {emp.displayName}
          </button>
        )
      })}
    </div>
  )
}
