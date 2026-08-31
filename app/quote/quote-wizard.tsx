'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getBoatType } from '@/lib/quote/boat-types'
import { computeQuote, selectionNeedsPhotos } from '@/lib/quote/pricing'
import type { QuoteAddonItem, QuoteServiceItem } from '@/lib/quote/catalog'
import type { BoatSuggestion } from '@/lib/quote/boat-model-match'
import { BoatStep } from './boat-step'
import { ServiceStep } from './service-step'
import { TimingStep } from './timing-step'
import { ContactStep } from './contact-step'
import { QuoteSummaryPanel } from './quote-summary-panel'
import { PhotoUploadWidget } from './photo-upload-widget'
import { submitQuoteRequest } from './actions'

const STEPS = ['Your boat', 'Service', 'Timing', 'Your info'] as const

export function QuoteWizard({
  services,
  addons,
  appUrl,
}: {
  services: QuoteServiceItem[]
  addons: QuoteAddonItem[]
  appUrl: string
}) {
  const [step, setStep] = useState(0)

  const [boatTypeKey, setBoatTypeKey] = useState<string | null>(null)
  const [lengthFt, setLengthFt] = useState('')
  const [boatNickname, setBoatNickname] = useState('')
  const [boatMakeModel, setBoatMakeModel] = useState('')
  const [matchedModel, setMatchedModel] = useState<BoatSuggestion | null>(null)

  const [planType, setPlanType] = useState<'recurring' | 'detail'>('recurring')
  const [recurringServiceKey, setRecurringServiceKey] = useState<string | null>(
    services.find((s) => s.category === 'recurring')?.key ?? null
  )
  const [detailServiceKeys, setDetailServiceKeys] = useState<Set<string>>(new Set())
  const [addonKeys, setAddonKeys] = useState<Set<string>>(new Set())

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [preferredStartDate, setPreferredStartDate] = useState('')
  const [preferredEndDate, setPreferredEndDate] = useState('')

  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [submitResult, setSubmitResult] = useState<{ id: string; total: number; needsPhotos: boolean } | null>(null)

  const boatType = getBoatType(boatTypeKey ?? '')
  const lengthFtNum = Number(lengthFt) || 0

  // Drop any selected add-on that stops being relevant if the boat type changes
  // (e.g. picked "Carpet Shampoo" then switched to a boat type with no carpet).
  useEffect(() => {
    setAddonKeys((prev) => {
      const next = new Set(
        Array.from(prev).filter((key) => {
          const addon = addons.find((a) => a.key === key)
          if (!addon?.requiresAttribute) return true
          if (!boatType) return false
          if (addon.requiresAttribute === 'cabin') return boatType.hasCabin
          if (addon.requiresAttribute === 'carpet') return boatType.hasCarpet
          if (addon.requiresAttribute === 'bridge') return boatType.hasBridge
          return true
        })
      )
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boatTypeKey])

  const quote = useMemo(
    () =>
      lengthFtNum > 0
        ? computeQuote(
            {
              lengthFt: lengthFtNum,
              planType,
              recurringServiceKey,
              detailServiceKeys: Array.from(detailServiceKeys),
              addonKeys: Array.from(addonKeys),
            },
            { services, addons }
          )
        : { lineItems: [], total: 0 },
    [lengthFtNum, planType, recurringServiceKey, detailServiceKeys, addonKeys, services, addons]
  )

  function handleMatchModel(row: BoatSuggestion) {
    setMatchedModel(row)
    setBoatTypeKey(row.boatTypeKey)
    setLengthFt(String(row.lengthFt))
    setBoatMakeModel(`${row.make} ${row.model}`)
  }

  function toggleDetailService(key: string) {
    setDetailServiceKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAddon(key: string) {
    setAddonKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function canAdvance(): string | null {
    if (step === 0) {
      if (!boatTypeKey) return 'Pick a boat type to continue.'
      if (!lengthFtNum || lengthFtNum < 5 || lengthFtNum > 200) return 'Enter your boat length in feet.'
    }
    if (step === 1) {
      if (planType === 'recurring' && !recurringServiceKey) return 'Pick a wash plan.'
      if (planType === 'detail' && detailServiceKeys.size === 0) return 'Pick at least one detail service.'
    }
    if (step === 2) {
      if (preferredStartDate && preferredEndDate && preferredEndDate < preferredStartDate) {
        return 'Latest date must be on or after the earliest date.'
      }
    }
    return null
  }

  function goNext() {
    const blocked = canAdvance()
    if (blocked) {
      setError(blocked)
      return
    }
    setError('')
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function goBack() {
    setError('')
    setStep((s) => Math.max(s - 1, 0))
  }

  function handleSubmit() {
    if (!name.trim()) return setError('Enter your name.')
    if (!phone.trim()) return setError('Enter your phone number.')
    setError('')

    const formData = new FormData()
    formData.set('name', name.trim())
    formData.set('phone', phone.trim())
    if (email.trim()) formData.set('email', email.trim())
    if (address.trim()) formData.set('address', address.trim())
    formData.set('boatTypeKey', boatTypeKey ?? '')
    if (boatNickname.trim()) formData.set('boatNickname', boatNickname.trim())
    if (boatMakeModel.trim()) formData.set('boatMakeModel', boatMakeModel.trim())
    if (matchedModel?.id) formData.set('boatModelId', matchedModel.id)
    formData.set('boatLengthFt', String(lengthFtNum))
    formData.set('planType', planType)
    if (recurringServiceKey) formData.set('recurringServiceKey', recurringServiceKey)
    Array.from(detailServiceKeys).forEach((key) => formData.append('detailServiceKeys', key))
    Array.from(addonKeys).forEach((key) => formData.append('addonKeys', key))
    if (notes.trim()) formData.set('notes', notes.trim())
    if (message.trim()) formData.set('message', message.trim())
    if (preferredStartDate) formData.set('preferredStartDate', preferredStartDate)
    if (preferredEndDate) formData.set('preferredEndDate', preferredEndDate)

    startTransition(async () => {
      const result = await submitQuoteRequest(formData)
      if (result.ok) {
        setSubmitResult({ id: result.id, total: result.total, needsPhotos: result.needsPhotos })
      } else {
        setError(result.error)
      }
    })
  }

  if (submitResult) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_16px_40px_hsl(var(--foreground)/0.08)]">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <h2 className="mt-4 text-xl font-semibold">Quote sent! Thanks, {name.split(' ')[0]}.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your estimate is <span className="font-semibold text-foreground">${submitResult.total.toFixed(2)}</span>.
        </p>
        <div className="mt-6 rounded-lg bg-muted/50 p-4 text-left">
          <ul className="space-y-1.5 text-sm">
            {quote.lineItems.map((li) => (
              <li key={li.key} className="flex justify-between">
                <span className="text-muted-foreground">{li.name}</span>
                <span className="tabular-nums font-medium">${li.price.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-lg border border-primary/20 bg-accent px-4 py-3 text-left text-sm text-accent-foreground">
          <p className="flex items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">What&apos;s next:</span> we&apos;ll email you a QuickBooks estimate for
              this quote. Please approve it there, and we&apos;ll call or text you at {phone} to confirm scheduling.
            </span>
          </p>
        </div>

        {submitResult.needsPhotos && (
          <div className="mt-6 text-left">
            <p className="text-sm font-medium">Add a few photos of your boat</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This helps us confirm your price precisely. No rush, you can skip this and add photos anytime later
              at <span className="font-medium text-foreground">{appUrl}/quote/photos/{submitResult.id}</span>.
            </p>
            <PhotoUploadWidget quoteRequestId={submitResult.id} className="mt-3" />
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          Questions? Call or text us anytime.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 rounded-xl border bg-card p-6 shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_16px_40px_hsl(var(--foreground)/0.08)] sm:p-8">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-colors duration-200',
                    i <= step ? 'bg-primary' : 'bg-muted'
                  )}
                />
                <span
                  className={cn(
                    'hidden text-xs font-medium sm:block',
                    i === step ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {step === 0 && (
          <BoatStep
            boatTypeKey={boatTypeKey}
            onBoatTypeChange={setBoatTypeKey}
            lengthFt={lengthFt}
            onLengthFtChange={setLengthFt}
            boatNickname={boatNickname}
            onBoatNicknameChange={setBoatNickname}
            boatMakeModel={boatMakeModel}
            onBoatMakeModelChange={setBoatMakeModel}
            matchedModel={matchedModel}
            onMatchModel={handleMatchModel}
            onClearMatch={() => setMatchedModel(null)}
          />
        )}

        {step === 1 && (
          <ServiceStep
            services={services}
            addons={addons}
            boatType={boatType}
            lengthFt={lengthFtNum}
            planType={planType}
            onPlanTypeChange={setPlanType}
            recurringServiceKey={recurringServiceKey}
            onRecurringServiceChange={setRecurringServiceKey}
            detailServiceKeys={detailServiceKeys}
            onToggleDetailService={toggleDetailService}
            addonKeys={addonKeys}
            onToggleAddon={toggleAddon}
          />
        )}

        {step === 2 && (
          <TimingStep
            startDate={preferredStartDate}
            onStartDateChange={setPreferredStartDate}
            endDate={preferredEndDate}
            onEndDateChange={setPreferredEndDate}
          />
        )}

        {step === 3 && (
          <ContactStep
            name={name}
            onNameChange={setName}
            phone={phone}
            onPhoneChange={setPhone}
            email={email}
            onEmailChange={setEmail}
            address={address}
            onAddressChange={setAddress}
            notes={notes}
            onNotesChange={setNotes}
            message={message}
            onMessageChange={setMessage}
          />
        )}

        {/* Mobile-only live total, shown above nav once there's something to price */}
        {step > 0 && (
          <div className="mt-6 flex items-baseline justify-between border-t pt-4 lg:hidden">
            <span className="text-sm font-medium text-muted-foreground">Estimated total</span>
            <span className="text-xl font-bold tabular-nums text-primary">${quote.total.toFixed(2)}</span>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={goBack} disabled={step === 0 || isPending}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={goNext}>
              Continue
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Sending…' : `Get my quote for $${quote.total.toFixed(2)}`}
            </Button>
          )}
        </div>
      </div>

      <div
        aria-hidden={step === 0}
        className={cn(
          'hidden shrink-0 overflow-hidden transition-all duration-300 ease-out lg:block',
          step > 0 ? 'lg:w-80 lg:opacity-100' : 'lg:w-0 lg:opacity-0'
        )}
      >
        <div className="sticky top-6 w-80">
          <QuoteSummaryPanel lineItems={quote.lineItems} total={quote.total} boatLabel={boatType?.label} />
        </div>
      </div>
    </div>
  )
}
