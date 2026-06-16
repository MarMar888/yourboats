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

export function ElapsedTimer({ clockIn }: { clockIn: Date | string }) {
  const ms = () => Date.now() - new Date(clockIn).getTime()
  const [elapsed, setElapsed] = useState(ms)

  useEffect(() => {
    const id = setInterval(() => setElapsed(ms()), 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockIn])

  return <span>{formatElapsed(elapsed)}</span>
}
