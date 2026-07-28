// node-quickbooks' error callbacks pass through the raw axios error, whose
// `.message` is a generic "Request failed with status code 4xx" — the actual
// reason (e.g. "Duplicate Name Exists Error") lives in the QBO Fault payload
// on the response body. Surface that instead when it's available.
export function extractQboErrorMessage(err: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyErr = err as any
  const fault = anyErr?.response?.data?.Fault ?? anyErr?.Fault
  const first = fault?.Error?.[0]
  if (first?.Message) {
    return first.Detail ? `${first.Message}: ${first.Detail}` : first.Message
  }
  return err instanceof Error ? err.message : String(err)
}
