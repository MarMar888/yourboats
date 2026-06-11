'use client'

import { Toaster } from 'sonner'

export function AppToaster() {
  return (
    <Toaster
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{
        duration: 5000,
      }}
    />
  )
}
