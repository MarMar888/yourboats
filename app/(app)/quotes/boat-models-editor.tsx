'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BOAT_TYPES } from '@/lib/quote/boat-types'
import type { BoatModel } from '@/lib/db/schema'
import { createBoatModelItem, updateBoatModelItem } from './actions'

function BoatTypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {BOAT_TYPES.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  )
}

function BoatModelRow({ model }: { model: BoatModel }) {
  const [make, setMake] = useState(model.make)
  const [modelName, setModelName] = useState(model.model)
  const [boatTypeKey, setBoatTypeKey] = useState(model.boatTypeKey)
  const [lengthFt, setLengthFt] = useState(String(model.lengthFt))
  const [active, setActive] = useState(model.active)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError('')
    setSaved(false)
    const formData = new FormData()
    formData.set('make', make)
    formData.set('model', modelName)
    formData.set('boatTypeKey', boatTypeKey)
    formData.set('lengthFt', lengthFt)
    if (active) formData.set('active', 'on')
    startTransition(async () => {
      const result = await updateBoatModelItem(model.id, formData)
      if (result.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 1600)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 last:border-b-0">
      <input
        value={make}
        onChange={(e) => setMake(e.target.value)}
        className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <input
        value={modelName}
        onChange={(e) => setModelName(e.target.value)}
        className="h-8 min-w-[140px] flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <BoatTypeSelect value={boatTypeKey} onChange={setBoatTypeKey} />
      <input
        type="number"
        min={5}
        max={200}
        value={lengthFt}
        onChange={(e) => setLengthFt(e.target.value)}
        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded accent-primary"
        />
        Active
      </label>
      <Button size="sm" variant="outline" onClick={handleSave} disabled={isPending}>
        {saved ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {isPending ? 'Saving…' : saved ? 'Saved' : 'Save'}
      </Button>
      {error && <p className="w-full text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

function AddBoatModelForm() {
  const [make, setMake] = useState('')
  const [modelName, setModelName] = useState('')
  const [boatTypeKey, setBoatTypeKey] = useState(BOAT_TYPES[0].key)
  const [lengthFt, setLengthFt] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    setError('')
    const formData = new FormData()
    formData.set('make', make)
    formData.set('model', modelName)
    formData.set('boatTypeKey', boatTypeKey)
    formData.set('lengthFt', lengthFt)
    startTransition(async () => {
      const result = await createBoatModelItem(formData)
      if (result.ok) {
        setMake('')
        setModelName('')
        setLengthFt('')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Make</label>
        <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Sea Ray" className="h-8 w-32" />
      </div>
      <div className="min-w-[160px] flex-1 space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Model</label>
        <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Sundancer 320" className="h-8" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Type</label>
        <BoatTypeSelect value={boatTypeKey} onChange={setBoatTypeKey} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Length (ft)</label>
        <Input
          type="number"
          min={5}
          max={200}
          value={lengthFt}
          onChange={(e) => setLengthFt(e.target.value)}
          placeholder="24"
          className="h-8 w-20"
        />
      </div>
      <Button size="sm" onClick={handleAdd} disabled={isPending}>
        {isPending ? 'Adding…' : 'Add'}
      </Button>
      {error && <p className="w-full text-xs font-medium text-destructive">{error}</p>}
    </div>
  )
}

export function BoatModelsEditor({ boatModels }: { boatModels: BoatModel[] }) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return boatModels
    return boatModels.filter((m) => `${m.make} ${m.model}`.toLowerCase().includes(q))
  }, [filter, boatModels])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Add a boat model</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Add a model here whenever a customer&apos;s boat isn&apos;t found by the search on the public quote link.
        </p>
        <AddBoatModelForm />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Catalog ({boatModels.length})
          </h2>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by make or model…"
            className="h-8 w-56"
          />
        </div>
        <div className="max-h-[560px] overflow-y-auto rounded-lg border bg-card">
          {filtered.map((m) => (
            <BoatModelRow key={m.id} model={m} />
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches.</p>
          )}
        </div>
      </div>
    </div>
  )
}
