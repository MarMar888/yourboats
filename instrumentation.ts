import { PostHog } from 'posthog-node'

export async function onRequestError(
  err: { digest: string } & Error,
  request: {
    path: string
    method: string
    headers: Record<string, string>
  },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routeType: 'render' | 'route' | 'action' | 'middleware'
    routePath: string
    routeSubPageType?: 'client' | 'server'
    revalidateReason?: 'on-demand' | 'stale'
  }
) {
  const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    flushAt: 1,
    flushInterval: 0,
  })

  posthog.capture({
    distinctId: 'server',
    event: '$exception',
    properties: {
      $exception_message: err.message,
      $exception_type: err.name,
      $exception_stack_trace_raw: err.stack,
      digest: err.digest,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      routeSubPageType: context.routeSubPageType,
    },
  })

  await posthog.shutdown()
}
