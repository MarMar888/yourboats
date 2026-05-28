'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { refreshServicePayroll } from '@/lib/pay/payroll-projection'

export async function addTip(serviceId: string, tipAmount: number): Promise<void> {
  const user = await getCurrentUser()
  if (!user || (user.role !== 'owner' && user.role !== 'manager')) {
    throw new Error('Unauthorized')
  }

  await db
    .update(services)
    .set({ tipAmount: String(tipAmount) })
    .where(eq(services.id, serviceId))

  await refreshServicePayroll(serviceId, 'service_tip_updated')
  revalidatePath(`/schedule/${serviceId}`)
  revalidatePath('/pay')
}
