'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
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
    startTransition(async () => {
      try {
        await updateBoatAssignments(serviceId, boatId, next)
        toast.success('Assignment updated')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update assignment')
      }
    })
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5 transition-opacity', isPending && 'opacity-50')}>
      {employees.map((emp) => {
        const active = assignedIds.includes(emp.id)
        return (
          <button
            key={emp.id}
            type="button"
            onClick={() => toggle(emp.id)}
            disabled={isPending}
            className={cn(
              'px-2.5 py-0.5 rounded-full border text-xs font-medium transition-colors',
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
