import { generateText, Output } from 'ai'
import { z } from 'zod'
import { BOAT_TYPES } from './boat-types'

const BOAT_TYPE_KEYS = BOAT_TYPES.map((t) => t.key) as [string, ...string[]]

const BoatGuessSchema = z.object({
  recognized: z.boolean().describe('true if the input looks like a real, identifiable boat make/model'),
  make: z.string().describe('cleaned-up manufacturer name, best guess if uncertain'),
  model: z.string().describe('cleaned-up model name/number, best guess if uncertain'),
  boatTypeKey: z.enum(BOAT_TYPE_KEYS).describe('best-fit boat type from the provided list'),
  lengthFt: z.number().int().min(8).max(120).describe('typical length overall in feet for this model'),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type BoatAiGuess = z.infer<typeof BoatGuessSchema>

/**
 * Last-resort boat identification for free text that doesn't match anything
 * in the `boat_models` catalog. Behind a small/fast model via the AI Gateway
 * so an unlisted model still gets a reasonable type + length estimate
 * instead of forcing the visitor straight to the manual type picker.
 * No-ops (returns null) if AI_GATEWAY_API_KEY isn't configured; this is a
 * bonus, not a hard dependency of the quote flow.
 */
export async function guessBoatFromText(rawInput: string): Promise<BoatAiGuess | null> {
  if (!process.env.AI_GATEWAY_API_KEY) return null
  const input = rawInput.trim()
  if (input.length < 4) return null

  try {
    const typeList = BOAT_TYPES.map((t) => `- ${t.key}: ${t.label} (${t.blurb})`).join('\n')
    const { output } = await generateText({
      model: 'anthropic/claude-haiku-4.5',
      output: Output.object({ schema: BoatGuessSchema }),
      prompt: [
        `A boat cleaning company's customer typed this into a "what's your boat" field: "${input}"`,
        '',
        'Identify the boat make/model if recognizable, and classify it into exactly one of these boat types:',
        typeList,
        '',
        'Estimate its typical length overall in feet. Boat model numbers often encode length (e.g. "Sundancer 320" is about 32ft).',
        'If the input is not a recognizable boat, set recognized to false but still give your best-effort guess for type and length.',
      ].join('\n'),
    })
    return output
  } catch {
    return null
  }
}
