export default function AppLoading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
