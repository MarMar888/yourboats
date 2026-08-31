import { afterEach, describe, expect, it, vi } from 'vitest'
import { guessBoatFromText } from '@/lib/quote/boat-ai-lookup'

describe('guessBoatFromText', () => {
  const originalKey = process.env.AI_GATEWAY_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY
    else process.env.AI_GATEWAY_API_KEY = originalKey
  })

  it('no-ops without AI_GATEWAY_API_KEY configured', async () => {
    delete process.env.AI_GATEWAY_API_KEY
    await expect(guessBoatFromText('Boston Whaler 305 Conquest')).resolves.toBeNull()
  })

  it('no-ops for input too short to be a real boat name, even with a key', async () => {
    process.env.AI_GATEWAY_API_KEY = 'test-key'
    await expect(guessBoatFromText('abc')).resolves.toBeNull()
  })
})
