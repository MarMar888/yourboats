'use client'

import { Camera, DoorClosed, LayoutGrid, Repeat, Sparkles, TowerControl } from 'lucide-react'
import type { QuoteAddonItem, QuoteServiceItem } from '@/lib/quote/catalog'
import type { BoatType } from '@/lib/quote/boat-types'
import { priceForItem } from '@/lib/quote/pricing'
import { cn } from '@/lib/utils'

const ATTRIBUTE_META: Record<string, { label: string; icon: typeof DoorClosed }> = {
  cabin: { label: 'Cabin', icon: DoorClosed },
  carpet: { label: 'Carpet', icon: LayoutGrid },
  bridge: { label: 'Bridge', icon: TowerControl },
}

const UNIT_LABEL: Record<string, string> = { per_ft: '/ft', per_hour: '/hr' }

function addonIsRelevant(addon: QuoteAddonItem, boatType: BoatType | undefined): boolean {
  if (!addon.requiresAttribute) return true
  if (!boatType) return false
  if (addon.requiresAttribute === 'cabin') return boatType.hasCabin
  if (addon.requiresAttribute === 'carpet') return boatType.hasCarpet
  if (addon.requiresAttribute === 'bridge') return boatType.hasBridge
  return true
}

// Shows the native rate (e.g. "$14.00/ft") above the computed line price,
// so the price build is transparent rather than a single opaque number.
function PriceCell({ billingType, rate, price, suffix }: { billingType: string; rate: number; price: number; suffix?: string }) {
  const unit = UNIT_LABEL[billingType]
  return (
    <div className="shrink-0 text-right">
      {unit && <p className="text-xs text-muted-foreground tabular-nums">${rate.toFixed(2)}{unit}</p>}
      <p className="text-sm font-semibold tabular-nums">
        ${price.toFixed(2)}
        {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  )
}

export function ServiceStep({
  services,
  addons,
  boatType,
  lengthFt,
  planType,
  onPlanTypeChange,
  recurringServiceKey,
  onRecurringServiceChange,
  detailServiceKeys,
  onToggleDetailService,
  addonKeys,
  onToggleAddon,
}: {
  services: QuoteServiceItem[]
  addons: QuoteAddonItem[]
  boatType: BoatType | undefined
  lengthFt: number
  planType: 'recurring' | 'detail'
  onPlanTypeChange: (plan: 'recurring' | 'detail') => void
  recurringServiceKey: string | null
  onRecurringServiceChange: (key: string) => void
  detailServiceKeys: Set<string>
  onToggleDetailService: (key: string) => void
  addonKeys: Set<string>
  onToggleAddon: (key: string) => void
}) {
  const recurringPlans = services.filter((s) => s.category === 'recurring')
  const detailServices = services.filter((s) => s.category === 'detail')
  const relevantAddons = addons.filter((a) => addonIsRelevant(a, boatType))
  const selectedNeedsPhotos = detailServices.some(
    (svc) => svc.requiresPhotos && detailServiceKeys.has(svc.key)
  )

  const addonsSection = relevantAddons.length > 0 && (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Add anything else?
      </p>
      {relevantAddons.map((addon) => {
        const price = priceForItem(addon, lengthFt)
        const selected = addonKeys.has(addon.key)
        const attr = addon.requiresAttribute ? ATTRIBUTE_META[addon.requiresAttribute] : null
        return (
          <label
            key={addon.key}
            className={cn(
              'flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors',
              selected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/50'
            )}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleAddon(addon.key)}
                className="mt-1 h-4 w-4 rounded"
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{addon.name}</p>
                  {attr && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                      <attr.icon className="h-3 w-3" aria-hidden="true" />
                      For your {attr.label.toLowerCase()}
                    </span>
                  )}
                </div>
                {addon.description && <p className="text-xs text-muted-foreground">{addon.description}</p>}
              </div>
            </div>
            <PriceCell billingType={addon.billingType} rate={addon.rate} price={price} />
          </label>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Choose your service</h2>
        <p className="text-sm text-muted-foreground">
          Ongoing upkeep or a one-time deep clean. Pick what fits.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onPlanTypeChange('recurring')}
          className={cn(
            'flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3.5 text-left transition-all',
            planType === 'recurring'
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-border hover:border-primary/30 hover:bg-muted/50'
          )}
        >
          <Repeat className={cn('h-4 w-4', planType === 'recurring' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
          <span className="text-sm font-semibold">Recurring wash</span>
          <span className="text-xs text-muted-foreground">Weekly or biweekly upkeep</span>
        </button>
        <button
          type="button"
          onClick={() => onPlanTypeChange('detail')}
          className={cn(
            'flex flex-col items-start gap-1.5 rounded-xl border px-4 py-3.5 text-left transition-all',
            planType === 'detail'
              ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
              : 'border-border hover:border-primary/30 hover:bg-muted/50'
          )}
        >
          <Sparkles className={cn('h-4 w-4', planType === 'detail' ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
          <span className="text-sm font-semibold">One-time detail</span>
          <span className="text-xs text-muted-foreground">Deep clean, buffing, and more</span>
        </button>
      </div>

      {planType === 'recurring' ? (
        <div className="space-y-5">
          <div className="space-y-2">
            {recurringPlans.map((plan) => {
              const price = priceForItem(plan, lengthFt)
              const selected = recurringServiceKey === plan.key
              return (
                <label
                  key={plan.key}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors',
                    selected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="recurringPlan"
                      checked={selected}
                      onChange={() => onRecurringServiceChange(plan.key)}
                      className="mt-1 h-4 w-4"
                    />
                    <div>
                      <p className="text-sm font-medium">{plan.name}</p>
                      {plan.description && <p className="text-xs text-muted-foreground">{plan.description}</p>}
                    </div>
                  </div>
                  <PriceCell billingType={plan.billingType} rate={plan.rate} price={price} suffix="/visit" />
                </label>
              )
            })}
          </div>

          {addonsSection}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detail services</p>
            {detailServices.map((svc) => {
              const price = priceForItem(svc, lengthFt)
              const selected = detailServiceKeys.has(svc.key)
              return (
                <label
                  key={svc.key}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-4 py-3 transition-colors',
                    selected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleDetailService(svc.key)}
                      className="mt-1 h-4 w-4 rounded"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{svc.name}</p>
                        {svc.requiresPhotos && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                            <Camera className="h-3 w-3" aria-hidden="true" />
                            Photos required
                          </span>
                        )}
                      </div>
                      {svc.description && <p className="text-xs text-muted-foreground">{svc.description}</p>}
                    </div>
                  </div>
                  <PriceCell billingType={svc.billingType} rate={svc.rate} price={price} />
                </label>
              )
            })}
            {selectedNeedsPhotos && (
              <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                A few photos of your boat help us confirm this price. You&apos;ll get the chance to
                add them right after you submit, no rush if you don&apos;t have them handy.
              </p>
            )}
          </div>

          {addonsSection}
        </div>
      )}
    </div>
  )
}
