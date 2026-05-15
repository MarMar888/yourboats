'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateBoatAssignments } from '@/app/(app)/schedule/[id]/actions'

export interface BoatAssignment {
  boatId: string
  nickname: string
  assignedIds: string[]
}

export interface Employee {
  id: string
  displayName: string
}

interface AssignInlineProps {
  serviceId: string
  boats: BoatAssignment[]
  employees: Employee[]
}

export default function AssignInline({ serviceId, boats, employees }: AssignInlineProps) {
  const [open, setOpen] = useState(false)
  // Track per-boat assignment state locally; key = boatId
  const [assignments, setAssignments] = useState<Record<string, string[]>>(
    () => Object.fromEntries(boats.map((b) => [b.boatId, b.assignedIds]))
  )
  const [isPending, startTransition] = useTransition()

  function toggle(boatId: string, userId: string) {
    const current = assignments[boatId] ?? []
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]

    setAssignments((prev) => ({ ...prev, [boatId]: next }))

    startTransition(async () => {
      await updateBoatAssignments(serviceId, boatId, next)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors mt-1"
      >
        Assign employees
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-3">
      {boats.map((boat) => (
        <div key={boat.boatId}>
          {boats.length > 1 && (
            <p className="text-xs font-medium text-muted-foreground mb-1">{boat.nickname}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {employees.map((emp) => {
              const assigned = (assignments[boat.boatId] ?? []).includes(emp.id)
              return (
                <button
                  key={emp.id}
                  disabled={isPending}
                  onClick={() => toggle(boat.boatId, emp.id)}
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    assigned
                      ? 'bg-primary text-primary-foreground border-transparent'
                      : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground',
                    isPending && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {emp.displayName}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Done
      </button>
    </div>
  )
}
