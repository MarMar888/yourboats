<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into yourboats. Here's a summary of what was added:

- **Client-side initialization** via `instrumentation-client.ts` (Next.js 15.3+ pattern), with a reverse proxy configured in `next.config.js` to route PostHog traffic through `/ingest` for better ad-blocker resilience.
- **Server-side PostHog client** at `lib/posthog-server.ts`, used by all server actions to capture business-critical events with the authenticated user's ID as the distinct ID.
- **User identification** on every page load via a `PostHogIdentify` client component mounted in `app/(app)/layout.tsx`, which calls `posthog.identify()` with the user's ID, email, name, and role. Server-side identification also fires on login.
- **15 events** instrumented across client and server code covering the full service lifecycle, billing pipeline, complaints, employee time tracking, and QBO integration.
- **Environment variables** written to `.env.local` (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`).

## Events instrumented

| Event | Description | File |
|---|---|---|
| `user_logged_in` | User successfully authenticated via email/password | `app/(auth)/login/actions.ts` |
| `service_created` | A new one-time or recurring service was scheduled | `app/(app)/schedule/new/actions.ts` |
| `service_completed` | A scheduled service was marked complete | `app/(app)/schedule/actions.ts` |
| `service_marked_incomplete` | A completed service was reverted to scheduled | `app/(app)/schedule/actions.ts` |
| `service_rescheduled` | A service was moved to a new date | `app/(app)/schedule/actions.ts` |
| `service_deleted` | A service was deleted (voids QBO invoice if synced) | `app/(app)/schedule/actions.ts` |
| `week_approved` | A week of services was approved for reminder emails | `app/(app)/schedule/actions.ts` |
| `invoice_generated` | A draft invoice was generated from a completed service | `app/(app)/schedule/[id]/actions.ts` |
| `complaint_flagged` | A quality complaint was logged against a service | `app/(app)/schedule/[id]/actions.ts` |
| `invoice_created_in_qbo` | A local draft invoice was pushed to QuickBooks Online | `app/(app)/invoices/actions.ts` |
| `invoice_sent` | An invoice was emailed to the customer via QBO | `app/(app)/invoices/actions.ts` |
| `invoice_deleted` | An invoice was deleted locally (and voided in QBO) | `app/(app)/invoices/actions.ts` |
| `complaint_resolved` | A previously logged complaint was resolved | `app/(app)/complaints/actions.ts` |
| `employee_clocked_in` | An employee clocked in to a service/boat assignment | `app/(app)/clock/clock-client.tsx` |
| `employee_clocked_out` | An employee clocked out of their active time entry | `app/(app)/clock/clock-client.tsx` |
| `qbo_connected` | QuickBooks Online OAuth was completed successfully | `app/api/qbo/callback/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1601230)
- [Services Created vs Completed](/insights/XsmRD8IY) — weekly trend of services scheduled and completed
- [Service → Invoice Conversion Funnel](/insights/kqAk8QDq) — conversion from service creation through to invoice sent
- [Complaints Flagged vs Resolved](/insights/fjbBr83g) — quality monitoring trend
- [Invoices Sent (Last 30 Days)](/insights/eTXrUfGi) — billing activity at a glance
- [Employee Clock-ins Over Time](/insights/ta9JPqb7) — workforce utilization bar chart

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
