import { getQboClient } from './client'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'

type QboCustomer = {
  Id: string
  DisplayName: string
  PrimaryEmailAddr?: { Address: string }
  PrimaryPhone?: { FreeFormNumber: string }
  BillAddr?: {
    Line1?: string
    City?: string
    CountrySubDivisionCode?: string
    PostalCode?: string
  }
  Active: boolean
}

function formatAddress(addr: QboCustomer['BillAddr']): string | null {
  if (!addr) return null
  return [addr.Line1, addr.City, addr.CountrySubDivisionCode, addr.PostalCode]
    .filter(Boolean)
    .join(', ')
}

function qboToInsert(c: QboCustomer) {
  return {
    qboCustomerId: c.Id,
    name: c.DisplayName,
    email: c.PrimaryEmailAddr?.Address ?? null,
    phone: c.PrimaryPhone?.FreeFormNumber ?? null,
    address: formatAddress(c.BillAddr),
    notes: null,
    isPrepaid: false,
  }
}

export async function importAllCustomersFromQbo(): Promise<{ imported: number }> {
  const qbo = await getQboClient()

  const data = await new Promise<{ QueryResponse?: { Customer?: QboCustomer[] } }>(
    (resolve, reject) =>
      qbo.findCustomers([{ field: 'fetchAll', value: true }], (err: unknown, result: unknown) =>
        err ? reject(err) : resolve(result as { QueryResponse?: { Customer?: QboCustomer[] } })
      )
  )

  const allCustomers = data?.QueryResponse?.Customer ?? []
  const active = allCustomers.filter((c) => c.Active !== false)

  for (const c of active) {
    const row = qboToInsert(c)
    await db
      .insert(customers)
      .values(row)
      .onConflictDoUpdate({
        target: customers.qboCustomerId,
        set: {
          name: row.name,
          email: row.email,
          phone: row.phone,
          address: row.address,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
  }

  return { imported: active.length }
}
