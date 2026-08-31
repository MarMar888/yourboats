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

export const serviceRequestTypeEnum = pgEnum('service_request_type', [
  'reschedule',
  'cancel',
  'note',
  'new_service',
])

export const serviceRequestStatusEnum = pgEnum('service_request_status', [
  'pending',
  'approved',
  'denied',
])

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

// Effective-dated pay-rate history. Both the crew-pool share (per service type)
// and the tier deduction are stored here as dated rows; the value for a service
// is the row with the greatest effective_from on/before that service's date.
// serviceTypeShares/tierConfig above hold the *current* value for UI display.
export const rateChanges = pgTable(
  'rate_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),             // 'service_type_share' | 'tier_deduction'
    key: text('key').notNull(),               // service type name, or employee tier
    pct: numeric('pct', { precision: 5, scale: 2 }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    note: text('note'),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    uniq: uniqueIndex('rate_changes_kind_key_from_uniq').on(t.kind, t.key, t.effectiveFrom),
  })
)

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
  completionPhotoUrl: text('completion_photo_url'),
  invoiceId: uuid('invoice_id'), // set after invoice created; FK added below via relation
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const completionPhotos = pgTable('completion_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  blobUrl: text('blob_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const rateTypeEnum = pgEnum('rate_type', ['per_ft', 'flat'])

// Separate from rateTypeEnum (used by service_boats' per-boat rate overrides,
// unrelated to the quote tool) so the quote catalog's billing types can
// evolve on their own, e.g. adding 'per_hour' for labor-based add-ons.
export const quoteRateTypeEnum = pgEnum('quote_rate_type', ['per_ft', 'flat', 'per_hour'])

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

// One-time codes emailed to a customer to open the client corner. Never a raw
// login secret at rest, only the hash is stored (same approach as mcpTokens).
export const clientOtpCodes = pgTable('client_otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Client-corner requests (reschedule/cancel/note/new service) awaiting staff
// review. Deliberately shaped like `complaints`: customer-linked, staff-triaged.
export const serviceRequests = pgTable('service_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  serviceId: uuid('service_id').references(() => services.id, { onDelete: 'cascade' }), // null for new_service
  type: serviceRequestTypeEnum('type').notNull(),
  requestedDate: date('requested_date'),
  serviceType: text('service_type'), // for new_service requests
  message: text('message'),
  status: serviceRequestStatusEnum('status').notNull().default('pending'),
  staffResponse: text('staff_response'),
  resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at'),
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

// Personal Access Tokens for the remote HTTP MCP server. Each token is bound to a
// user; the raw bearer is shown once and only its SHA-256 hash is stored.
export const mcpTokens = pgTable('mcp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(), // first chars, for display only
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),          // null = no expiry
  revokedAt: timestamp('revoked_at'),
})

// ─── Quote tool ─────────────────────────────────────────────────────────────

// Business-editable catalog of recurring plans and one-time detail services
// offered on the public /quote signup link. billingType 'per_ft' multiplies
// rate by the submitted boat length; 'flat' uses rate as-is. minPrice floors
// the computed price (useful for small boats on a per-ft plan).
export const quoteServices = pgTable('quote_services', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  category: text('category').notNull(), // 'recurring' | 'detail'
  name: text('name').notNull(),
  description: text('description'),
  billingType: quoteRateTypeEnum('billing_type').notNull().default('flat'),
  rate: numeric('rate', { precision: 10, scale: 2 }).notNull(),
  minPrice: numeric('min_price', { precision: 10, scale: 2 }),
  requiresPhotos: boolean('requires_photos').notNull().default(false), // e.g. buffing/waxing, acid wash: priced more precisely with boat photos
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Add-ons offered alongside a detail service. requiresAttribute gates which
// boat types see it recommended on the public wizard ('cabin' | 'carpet' |
// 'bridge'), null means it's offered to every boat type.
export const quoteAddons = pgTable('quote_addons', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  billingType: quoteRateTypeEnum('billing_type').notNull().default('flat'),
  rate: numeric('rate', { precision: 10, scale: 2 }).notNull(),
  minPrice: numeric('min_price', { precision: 10, scale: 2 }),
  requiresAttribute: text('requires_attribute'), // 'cabin' | 'carpet' | 'bridge' | null
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Business-editable catalog of known make/model boats, searched by the public
// quote wizard's "type your boat" field. A match auto-fills length and the
// boat-type key (for cabin/carpet/bridge attribute inference) instead of
// making the visitor pick a generic type. No third-party boat-specs API has
// a viable free tier for anonymous public traffic (checked 2026-08-28:
// VehDB requires a paid key, Marinebase is sailboat-only private beta); this
// catalog is the first-party substitute, grown over time from real requests.
export const boatModels = pgTable('boat_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  make: text('make').notNull(),
  model: text('model').notNull(),
  boatTypeKey: text('boat_type_key').notNull(), // matches a key in lib/quote/boat-types.ts
  lengthFt: integer('length_ft').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// One row per signup submitted on the public /quote link. quotedPrice and
// quotedPriceBreakdown are computed server-side from the catalog at submit
// time; never trust a client-supplied price.
export const quoteRequests = pgTable('quote_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull().default('new'), // 'new' | 'contacted' | 'converted' | 'declined'
  customerName: text('customer_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  boatTypeKey: text('boat_type_key').notNull(),
  boatNickname: text('boat_nickname'),
  boatMakeModel: text('boat_make_model'),
  boatLengthFt: integer('boat_length_ft').notNull(),
  boatModelId: uuid('boat_model_id').references(() => boatModels.id, { onDelete: 'set null' }),
  planType: text('plan_type').notNull(), // 'recurring' | 'detail'
  recurringServiceKey: text('recurring_service_key'),
  detailServiceKeys: text('detail_service_keys'), // JSON array string
  addonKeys: text('addon_keys'), // JSON array string
  notes: text('notes'),
  message: text('message'), // freeform questions/comments from the visitor, separate from operational notes
  preferredStartDate: date('preferred_start_date'),
  preferredEndDate: date('preferred_end_date'),
  photoUrls: text('photo_urls'), // JSON array string: boat photos for services that need them (buffing/waxing, acid wash)
  quotedPrice: numeric('quoted_price', { precision: 10, scale: 2 }).notNull(),
  quotedPriceBreakdown: text('quoted_price_breakdown'), // JSON array string of {key,name,price}
  convertedCustomerId: uuid('converted_customer_id').references(() => customers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  contactedAt: timestamp('contacted_at'),
})

export type QuoteService = typeof quoteServices.$inferSelect
export type NewQuoteService = typeof quoteServices.$inferInsert
export type QuoteAddon = typeof quoteAddons.$inferSelect
export type NewQuoteAddon = typeof quoteAddons.$inferInsert
export type QuoteRequest = typeof quoteRequests.$inferSelect
export type NewQuoteRequest = typeof quoteRequests.$inferInsert
export type BoatModel = typeof boatModels.$inferSelect
export type NewBoatModel = typeof boatModels.$inferInsert

export type McpToken = typeof mcpTokens.$inferSelect
export type NewMcpToken = typeof mcpTokens.$inferInsert

export type QboTokens = typeof qboTokens.$inferSelect

// ─── Relations ────────────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  boats: many(boats),
  services: many(services),
  recurringSchedules: many(recurringSchedules),
  complaints: many(complaints),
  reminderContacts: many(customerReminderContacts),
  serviceRequests: many(serviceRequests),
  otpCodes: many(clientOtpCodes),
}))

export const clientOtpCodesRelations = relations(clientOtpCodes, ({ one }) => ({
  customer: one(customers, { fields: [clientOtpCodes.customerId], references: [customers.id] }),
}))

export const serviceRequestsRelations = relations(serviceRequests, ({ one }) => ({
  customer: one(customers, { fields: [serviceRequests.customerId], references: [customers.id] }),
  service: one(services, { fields: [serviceRequests.serviceId], references: [services.id] }),
  resolvedBy: one(users, { fields: [serviceRequests.resolvedByUserId], references: [users.id] }),
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
  serviceRequests: many(serviceRequests),
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
    staleAt: timestamp('stale_at'),
    staleReason: text('stale_reason'),
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
  approvalRole: text('approval_role').notNull().default('owner_or_manager'), // 'owner' | 'owner_or_manager'
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

// ─── Manual payroll lines ─────────────────────────────────────────────────────

// One-off manual pay entries (bonuses, adjustments, unreported jobs) that
// aren't tied to a service record. Scoped to a pay period via period_start/end.
export const manualPayrollLines = pgTable('manual_payroll_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  displayName: text('display_name').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  createdByUserId: text('created_by_user_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
  approvedByUserId: text('approved_by_user_id'),
  approvedByName: text('approved_by_name'),
})

// ─── Pay period notes ─────────────────────────────────────────────────────────

// One row per pay period — freeform notes visible to all employees for that period.
export const payrollPeriodNotes = pgTable('payroll_period_notes', {
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  notes: text('notes').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedByUserId: text('updated_by_user_id'),
}, (t) => ({
  pk: primaryKey({ columns: [t.periodStart, t.periodEnd] }),
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
export type RateChange = typeof rateChanges.$inferSelect
export type NewRateChange = typeof rateChanges.$inferInsert
export type Payroll = typeof payroll.$inferSelect
export type NewPayroll = typeof payroll.$inferInsert
export type ManualPayrollLine = typeof manualPayrollLines.$inferSelect
export type NewManualPayrollLine = typeof manualPayrollLines.$inferInsert
export type ClientOtpCode = typeof clientOtpCodes.$inferSelect
export type NewClientOtpCode = typeof clientOtpCodes.$inferInsert
export type ServiceRequest = typeof serviceRequests.$inferSelect
export type NewServiceRequest = typeof serviceRequests.$inferInsert
