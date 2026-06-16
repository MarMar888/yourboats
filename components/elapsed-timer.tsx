'use client'

import { useEffect, useState } from 'react'

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function ElapsedTimer({ clockIn }: { clockIn: Date }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - clockIn.getTime())

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - clockIn.getTime()), 1000)
    return () => clearInterval(id)
  }, [clockIn])

  return <span>{formatElapsed(elapsed)}</span>
}
