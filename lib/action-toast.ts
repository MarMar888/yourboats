'use client'

import { toast } from 'sonner'

type ToastableResult =
  | void
  | null
  | undefined
  | { ok?: boolean; error?: string; message?: string }

type UndoConfig = {
  label?: string
  action: () => Promise<ToastableResult>
  success: string
  error?: string
}

type ActionToastOptions = {
  success: string
  error?: string
  undo?: UndoConfig
}

export function actionResultError(result: ToastableResult): string | null {
  if (!result || typeof result !== 'object') return null
  if ('ok' in result && result.ok === false) return result.error ?? result.message ?? 'Action failed'
  return result.error ?? null
}

export function errorMessage(error: unknown, fallback = 'Action failed') {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export function toastActionResult(result: ToastableResult, options: ActionToastOptions): boolean {
  const message = actionResultError(result)
  if (message) {
    toast.error(message || options.error || 'Action failed')
    return false
  }

  toast.success(options.success, options.undo ? {
    action: {
      label: options.undo.label ?? 'Undo',
      onClick: async () => {
        try {
          const undoResult = await options.undo!.action()
          const undoError = actionResultError(undoResult)
          if (undoError) {
            toast.error(undoError || options.undo!.error || 'Undo failed')
            return
          }
          toast.success(options.undo!.success)
        } catch (err) {
          toast.error(errorMessage(err, options.undo!.error ?? 'Undo failed'))
        }
      },
    },
  } : undefined)
  return true
}

export async function runToastAction(
  action: () => Promise<ToastableResult>,
  options: ActionToastOptions
): Promise<boolean> {
  try {
    const result = await action()
    return toastActionResult(result, options)
  } catch (err) {
    toast.error(errorMessage(err, options.error ?? 'Action failed'))
    return false
  }
}
