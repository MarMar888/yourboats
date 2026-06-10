import Link from 'next/link'
import { ArrowRight, CalendarDays, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { highlights } from '@/lib/highlights'

function formatHighlightDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function HighlightsPage() {
  const sortedHighlights = highlights
    .map((highlight, index) => ({ highlight, index }))
    .sort((a, b) => b.highlight.date.localeCompare(a.highlight.date) || b.index - a.index)
    .map(({ highlight }) => highlight)

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Product updates
        </div>
        <h1 className="text-2xl font-semibold">Highlights</h1>
        <p className="mt-1 text-muted-foreground">
          Recent changes and where to use them.
        </p>
      </div>

      {sortedHighlights.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No highlights have been added yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedHighlights.map((highlight, index) => (
            <Card key={highlight.slug} className={index === 0 ? 'border-primary/30' : undefined}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={index === 0 ? 'default' : 'secondary'}>{highlight.status}</Badge>
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    {formatHighlightDate(highlight.date)}
                  </span>
                </div>
                <div>
                  <CardTitle className="text-xl">{highlight.title}</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">{highlight.summary}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {highlight.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap gap-2">
                  {highlight.links.map((link) => (
                    <Button key={link.href} asChild variant="outline" size="sm">
                      <Link href={link.href}>
                        {link.label}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
