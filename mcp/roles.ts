// Central role-authorization matrix for MCP tools.
//
// Tools NOT listed here are callable by any authenticated actor (reads + employee
// field ops: list/get, mark_complete, create/resolve complaint).
// Everything that mutates billing/scheduling/customer data, or reads payroll, is
// owner/manager only — mirroring the web app's role gates. Enforced in one place,
// the tool() wrapper in tools/_util.ts.
import type { Role } from './actor'

export const TOOL_REQUIRED_ROLES: Record<string, Role[]> = {
  // Payroll figures
  get_pay_period_summary: ['owner', 'manager'],

  // Scheduling / pricing / data writes
  create_service: ['owner', 'manager'],
  create_recurring_schedule: ['owner', 'manager'],
  add_tip: ['owner', 'manager'], // affects payroll splits
  update_service: ['owner', 'manager'],
  reschedule_service: ['owner', 'manager'],
  cancel_service: ['owner', 'manager'],
  // mark_complete stays open (field crews complete their own jobs), but reversing
  // a completion is a manager action — mirrors the web app's markIncomplete gate.
  mark_incomplete: ['owner', 'manager'],
  approve_week: ['owner', 'manager'],
  create_customer: ['owner', 'manager'],
  update_customer: ['owner', 'manager'],
  create_boat: ['owner', 'manager'],
  update_boat: ['owner', 'manager'],

  // Financial / QBO / customer-facing (also excluded from the HTTP server in v1)
  create_qbo_invoice: ['owner', 'manager'],
  sync_invoice_to_qbo: ['owner', 'manager'],
  send_invoice: ['owner', 'manager'],
  void_invoice: ['owner', 'manager'],
}
