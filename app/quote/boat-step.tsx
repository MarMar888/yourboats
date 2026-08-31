'use client'

import { DoorClosed, LayoutGrid, Ship, TowerControl } from 'lucide-react'
import { BOAT_TYPES } from '@/lib/quote/boat-types'
import type { BoatSuggestion } from '@/lib/quote/boat-model-match'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BoatSearch } from './boat-search'

export function BoatStep({
  boatTypeKey,
  onBoatTypeChange,
  lengthFt,
  onLengthFtChange,
  boatNickname,
  onBoatNicknameChange,
  boatMakeModel,
  onBoatMakeModelChange,
  matchedModel,
  onMatchModel,
  onClearMatch,
}: {
  boatTypeKey: string | null
  onBoatTypeChange: (key: string) => void
  lengthFt: string
  onLengthFtChange: (v: string) => void
  boatNickname: string
  onBoatNicknameChange: (v: string) => void
  boatMakeModel: string
  onBoatMakeModelChange: (v: string) => void
  matchedModel: BoatSuggestion | null
  onMatchModel: (row: BoatSuggestion) => void
  onClearMatch: () => void
}) {
  const selected = BOAT_TYPES.find((t) => t.key === boatTypeKey)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tell us about your boat</h2>
        <p className="text-sm text-muted-foreground">
          We use this to price your quote precisely: cabins, carpet, and flybridges all factor in.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="q-boat-search">Your boat</Label>
        <BoatSearch matched={matchedModel} onMatch={onMatchModel} onClear={onClearMatch} />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {matchedModel ? 'Not right? Pick a type' : "Can't find it? Pick a type"}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {BOAT_TYPES.map((type) => {
          const isSelected = boatTypeKey === type.key
          return (
            <button
              key={type.key}
              type="button"
              onClick={() => {
                onBoatTypeChange(type.key)
                if (matchedModel) onClearMatch()
              }}
              className={cn(
                'group flex flex-col items-start gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
                  : 'border-border hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/50 hover:shadow-sm'
              )}
            >
              <Ship className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
              <span className="text-sm font-medium leading-tight">{type.label}</span>
              <span className="text-xs leading-snug text-muted-foreground">{type.blurb}</span>
            </button>
          )
        })}
      </div>

      {selected && (selected.hasCabin || selected.hasCarpet || selected.hasBridge) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-accent px-3.5 py-2.5">
          <span className="text-xs font-medium text-accent-foreground">This boat type usually has:</span>
          {selected.hasCabin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium">
              <DoorClosed className="h-3 w-3" aria-hidden="true" /> Cabin
            </span>
          )}
          {selected.hasCarpet && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium">
              <LayoutGrid className="h-3 w-3" aria-hidden="true" /> Carpet
            </span>
          )}
          {selected.hasBridge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-xs font-medium">
              <TowerControl className="h-3 w-3" aria-hidden="true" /> Flybridge
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="q-length">Length (ft) *</Label>
          <Input
            id="q-length"
            type="number"
            inputMode="numeric"
            min={5}
            max={200}
            value={lengthFt}
            onChange={(e) => onLengthFtChange(e.target.value)}
            placeholder="24"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-makemodel">Make &amp; model</Label>
          <Input
            id="q-makemodel"
            value={boatMakeModel}
            onChange={(e) => onBoatMakeModelChange(e.target.value)}
            placeholder="Make and model"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="q-nickname">Boat name</Label>
        <Input
          id="q-nickname"
          value={boatNickname}
          onChange={(e) => onBoatNicknameChange(e.target.value)}
          placeholder="Anchors Aweigh"
        />
      </div>
    </div>
  )
}
