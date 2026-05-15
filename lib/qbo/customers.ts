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

  const allCustomers: QboCustomer[] = []
  const pageSize = 100
  let startPos = 1

  while (true) {
    const page = await new Promise<QboCustomer[]>((resolve, reject) => {
      qbo.findCustomers(
        { startPosition: startPos, maxResults: pageSize },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: any, data: any) => {
          if (err) return reject(new Error(err.Fault?.Error?.[0]?.Detail ?? JSON.stringify(err)))
          resolve(data?.QueryResponse?.Customer ?? [])
        }
      )
    })

    allCustomers.push(...page)
    if (page.length < pageSize) break
    startPos += pageSize
  }

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
