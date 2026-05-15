import { version } from '@/package.json'

export default function AppFooter() {
  return (
    <footer className="border-t py-3 px-6">
      <p className="text-xs text-muted-foreground text-center">
        yourboats v{version}
      </p>
    </footer>
  )
}
