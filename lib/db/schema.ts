import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ['owner', 'manager', 'employee'])

export const employeeTierEnum = pgEnum('employee_tier', ['top', 'mid', 'low'])

// serviceTypeEnum kept for reference only — column migrated to text in 0007
// export const serviceTypeEnum = pgEnum('service_type', [...]) — removed

export const serviceStatusEnum = pgEnum('service_status', [
  'scheduled',
  'complete',
  'cancelled',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'paid',
  'overdue',
  'void',
])

export const severityEnum = pgEnum('severity', ['minor', 'major'])

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: roleEnum('role').notNull().default('employee'),
  active: boolean('active').notNull().default(true),
  tier: employeeTierEnum('tier'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  qboCustomerId: text('qbo_customer_id').unique(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  notes: text('notes'),
  isPrepaid: boolean('is_prepaid').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
})

export const customerReminderContacts = pgTable('customer_reminder_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  label: text('label'), // e.g. "voice number", "secondary email"
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const boats = pgTable('boats', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  makeModel: text('make_model'),
  lengthFt: integer('length_ft'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const recurringSchedules = pgTable('recurring_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  serviceType: text('service_type').notNull(),
  defaultPrice: numeric('default_price', { precision: 10, scale: 2 }),
  frequencyWeeks: integer('frequency_weeks').notNull().default(1),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sun … 6=Sat
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  active: boolean('active').notNull().default(true),
  prepaid: boolean('prepaid').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const tierConfig = pgTable('tier_config', {
  tier: employeeTierEnum('tier').primaryKey(),
  deductionPct: numeric('deduction_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const serviceTypeShares = pgTable('service_type_shares', {
  serviceType: text('service_type').primaryKey(),
  employeeSharePct: numeric('employee_share_pct', { precision: 5, scale: 2 }).notNull(),
})

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  serviceDate: date('service_date').notNull(),
  serviceType: text('service_type').notNull(),
  qboItemId: text('qbo_item_id'),  // QBO product ID for invoice line items
  status: serviceStatusEnum('status').notNull().default('scheduled'),
  notes: text('notes'),
  totalPrice: numeric('total_price', { precision: 10, scale: 2 }),
  tipAmount: numeric('tip_amount', { precision: 10, scale: 2 }),
  recurringScheduleId: uuid('recurring_schedule_id').references(
    () => recurringSchedules.id,
    { onDelete: 'set null' }
  ),
  completedAt: timestamp('completed_at'),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at'),
  approvedByUserId: text('approved_by_user_id'),
  reminderSentAt: timestamp('reminder_sent_at'),
  reminderSuppressed: boolean('reminder_suppressed').notNull().default(false),
  invoiceId: uuid('invoice_id'), // set after invoice created; FK added below via relation
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const rateTypeEnum = pgEnum('rate_type', ['per_ft', 'flat'])

export const serviceBoats = pgTable(
  'service_boats',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    boatId: uuid('boat_id')
      .notNull()
      .references(() => boats.id, { onDelete: 'cascade' }),
    description: text('description'),           // e.g. "Interior, Exterior, Cabin"
    notes: text('notes'),                        // per-boat operational notes
    rateType: rateTypeEnum('rate_type').default('per_ft'),
    rate: numeric('rate', { precision: 10, scale: 2 }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.serviceId, t.boatId] }),
  })
)

export const serviceBoatAssignments = pgTable(
  'service_boat_assignments',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    boatId: uuid('boat_id')
      .notNull()
      .references(() => boats.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(), // text, no FK — dev IDs aren't UUIDs
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.serviceId, t.boatId, t.userId] }),
  })
)

export const serviceAssignments = pgTable(
  'service_assignments',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sharePct: integer('share_pct').notNull().default(100),
  },
  (t) => ({
    pk: primaryKey(t.serviceId, t.userId),
  })
)

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .unique()
    .references(() => services.id, { onDelete: 'cascade' }),
  qboInvoiceId: text('qbo_invoice_id').unique(),
  docNumber: integer('doc_number'),  // human-readable invoice # set explicitly on QBO creation
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  qboNeedsSync: boolean('qbo_needs_sync').notNull().default(false),
  qboPaymentLink: text('qbo_payment_link'),
  sentAt: timestamp('sent_at'),
  paidAt: timestamp('paid_at'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
})

export const complaints = pgTable('complaints', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id')
    .notNull()
    .references(() => services.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  severity: severityEnum('severity').notNull(),
  resolved: boolean('resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at'),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const logs = pgTable('logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id'),           // dev user id or future auth user id
  action: text('action').notNull(),  // e.g. 'create_service', 'push_invoice_qbo'
  entityType: text('entity_type'),   // 'service' | 'invoice' | 'customer' | 'boat'
  entityId: text('entity_id'),
  metadata: text('metadata'),        // JSON string — extra context
  error: text('error'),              // set if the action failed
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const qboTokens = pgTable('qbo_tokens', {
  id: integer('id').primaryKey().default(1), // single row
  realmId: text('realm_id').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const timeEntries = pgTable('time_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  boatId: uuid('boat_id').references(() => boats.id, { onDelete: 'set null' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clockIn: timestamp('clock_in').notNull(),
  clockOut: timestamp('clock_out'),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const qboItems = pgTable('qbo_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  qboItemId: text('qbo_item_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
})

export type QboTokens = typeof qboTokens.$inferSelect

// ─── Relations ────────────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  boats: many(boats),
  services: many(services),
  recurringSchedules: many(recurringSchedules),
  complaints: many(complaints),
  reminderContacts: many(customerReminderContacts),
}))

export const customerReminderContactsRelations = relations(customerReminderContacts, ({ one }) => ({
  customer: one(customers, { fields: [customerReminderContacts.customerId], references: [customers.id] }),
}))

export const boatsRelations = relations(boats, ({ one, many }) => ({
  customer: one(customers, { fields: [boats.customerId], references: [customers.id] }),
  serviceBoats: many(serviceBoats),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  customer: one(customers, { fields: [services.customerId], references: [customers.id] }),
  completedBy: one(users, { fields: [services.completedByUserId], references: [users.id] }),
  recurringSchedule: one(recurringSchedules, {
    fields: [services.recurringScheduleId],
    references: [recurringSchedules.id],
  }),
  serviceBoats: many(serviceBoats),
  assignments: many(serviceAssignments),
  invoice: one(invoices, { fields: [services.invoiceId], references: [invoices.id] }),
  complaints: many(complaints),
}))

export const serviceBoatsRelations = relations(serviceBoats, ({ one, many }) => ({
  service: one(services, { fields: [serviceBoats.serviceId], references: [services.id] }),
  boat: one(boats, { fields: [serviceBoats.boatId], references: [boats.id] }),
  assignments: many(serviceBoatAssignments),
}))

export const serviceBoatAssignmentsRelations = relations(serviceBoatAssignments, ({ one }) => ({
  service: one(services, { fields: [serviceBoatAssignments.serviceId], references: [services.id] }),
  boat: one(boats, { fields: [serviceBoatAssignments.boatId], references: [boats.id] }),
}))

export const serviceAssignmentsRelations = relations(serviceAssignments, ({ one }) => ({
  service: one(services, { fields: [serviceAssignments.serviceId], references: [services.id] }),
  user: one(users, { fields: [serviceAssignments.userId], references: [users.id] }),
}))

export const invoicesRelations = relations(invoices, ({ one }) => ({
  service: one(services, { fields: [invoices.serviceId], references: [services.id] }),
}))

export const complaintsRelations = relations(complaints, ({ one }) => ({
  service: one(services, { fields: [complaints.serviceId], references: [services.id] }),
  customer: one(customers, { fields: [complaints.customerId], references: [customers.id] }),
  createdBy: one(users, { fields: [complaints.createdByUserId], references: [users.id] }),
}))

// ─── Payroll ──────────────────────────────────────────────────────────────────

// Persisted pay records — one row per employee per service.
// Written by managers/owners from the Pay review page.
export const payroll = pgTable(
  'payroll',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .references(() => invoices.id, { onDelete: 'set null' }),
    userId: text('user_id').notNull(),             // employee (text, matches serviceBoatAssignments)
    displayName: text('display_name').notNull(),   // snapshot at save time
    // Denormalised for self-contained payroll reports
    serviceDate: date('service_date').notNull(),
    serviceType: text('service_type').notNull(),
    customerName: text('customer_name').notNull(),
    // Pay math — all stored as decimals (strings via numeric type)
    totalPrice: numeric('total_price', { precision: 10, scale: 2 }),
    employeePool: numeric('employee_pool', { precision: 10, scale: 2 }),
    splitPct: numeric('split_pct', { precision: 5, scale: 2 }).notNull(),
    deductionPct: numeric('deduction_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    effectivePct: numeric('effective_pct', { precision: 5, scale: 2 }).notNull(),
    netPay: numeric('net_pay', { precision: 10, scale: 2 }).notNull(),
    tipShare: numeric('tip_share', { precision: 10, scale: 2 }),
    totalPay: numeric('total_pay', { precision: 10, scale: 2 }).notNull(),
    savedByUserId: text('saved_by_user_id'),
    savedAt: timestamp('saved_at').defaultNow().notNull(),
    approvedAt: timestamp('approved_at'),
    approvedByUserId: text('approved_by_user_id'),
    approvedByName: text('approved_by_name'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.serviceId, t.userId] }),
  })
)

export const payrollRelations = relations(payroll, ({ one }) => ({
  service: one(services, { fields: [payroll.serviceId], references: [services.id] }),
  invoice: one(invoices, { fields: [payroll.invoiceId], references: [invoices.id] }),
}))

// ─── Salaried automations ─────────────────────────────────────────────────────

// Rules define a repeating salary/bonus line for a specific employee.
// One row per rule (e.g. "Nate GM salary" or "Nate quality bonus").
export const salariedRules = pgTable('salaried_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  displayName: text('display_name').notNull(),            // snapshot at rule creation
  type: text('type').notNull(),                            // 'gm_salary' | 'quality_bonus'
  amountPerWeek: numeric('amount_per_week', { precision: 10, scale: 2 }), // for gm_salary
  amountFlat: numeric('amount_flat',   { precision: 10, scale: 2 }),      // for quality_bonus
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo:   date('effective_to').notNull(),
  requiresApproval: boolean('requires_approval').notNull().default(false),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// One row per rule per pay period — auto-generated when the period is loaded.
// GM salary is auto-approved; quality bonus starts as 'pending' awaiting Marley.
export const salariedPayroll = pgTable('salaried_payroll', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').notNull().references(() => salariedRules.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  displayName: text('display_name').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  type: text('type').notNull(),                    // 'gm_salary' | 'quality_bonus'
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'denied' | 'ineligible'
  ineligibleReason: text('ineligible_reason'),
  notes: text('notes'),
  approvedByUserId: text('approved_by_user_id'),
  approvedByName: text('approved_by_name'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('salaried_payroll_rule_period_uniq').on(t.ruleId, t.periodStart),
])

export const recurringSchedulesRelations = relations(recurringSchedules, ({ one, many }) => ({
  customer: one(customers, {
    fields: [recurringSchedules.customerId],
    references: [customers.id],
  }),
  services: many(services),
}))

// ─── Calendar events ──────────────────────────────────────────────────────────

// Custom events added to the calendar (not tied to services/customers).
export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  eventDate: date('event_date').notNull(),
  endDate: date('end_date'),          // optional multi-day end
  color: text('color').notNull().default('blue'), // 'blue' | 'green' | 'red' | 'yellow' | 'purple'
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Boat = typeof boats.$inferSelect
export type NewBoat = typeof boats.$inferInsert
export type Service = typeof services.$inferSelect
export type NewService = typeof services.$inferInsert
export type RecurringSchedule = typeof recurringSchedules.$inferSelect
export type NewRecurringSchedule = typeof recurringSchedules.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type Complaint = typeof complaints.$inferSelect
export type NewComplaint = typeof complaints.$inferInsert
export type CustomerReminderContact = typeof customerReminderContacts.$inferSelect
export type SalariedRule = typeof salariedRules.$inferSelect
export type NewSalariedRule = typeof salariedRules.$inferInsert
export type SalariedPayroll = typeof salariedPayroll.$inferSelect
export type NewSalariedPayroll = typeof salariedPayroll.$inferInsert
export type NewCustomerReminderContact = typeof customerReminderContacts.$inferInsert
export type QboItem = typeof qboItems.$inferSelect
export type NewQboItem = typeof qboItems.$inferInsert
export type TimeEntry = typeof timeEntries.$inferSelect
export type NewTimeEntry = typeof timeEntries.$inferInsert
export type ServiceTypeShare = typeof serviceTypeShares.$inferSelect
export type Payroll = typeof payroll.$inferSelect
export type NewPayroll = typeof payroll.$inferInsert
