import { db } from '@/lib/db'
import { tierConfig } from '@/lib/db/schema'

async function main() {
  console.log('Seeding tier_config defaults...')

  await db
    .insert(tierConfig)
    .values([
      { tier: 'top', deductionPct: '0' },
      { tier: 'mid', deductionPct: '2.5' },
      { tier: 'low', deductionPct: '5' },
    ])
    .onConflictDoNothing()

  console.log('Done.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
