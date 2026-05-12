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
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', ['owner', 'manager', 'employee'])

export const serviceTypeEnum = pgEnum('service_type', [
  'recurring',
  'detailing',
  'buffing_waxing',
  'acid_washing',
  'powerwashing',
  'gelcoat_wetsanding',
  'captaining',
  'other',
])

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
  serviceType: serviceTypeEnum('service_type').notNull(),
  defaultPrice: numeric('default_price', { precision: 10, scale: 2 }),
  frequencyWeeks: integer('frequency_weeks').notNull().default(1),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sun … 6=Sat
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  serviceDate: date('service_date').notNull(),
  serviceType: serviceTypeEnum('service_type').notNull(),
  status: serviceStatusEnum('status').notNull().default('scheduled'),
  notes: text('notes'),
  totalPrice: numeric('total_price', { precision: 10, scale: 2 }),
  recurringScheduleId: uuid('recurring_schedule_id').references(
    () => recurringSchedules.id,
    { onDelete: 'set null' }
  ),
  completedAt: timestamp('completed_at'),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  invoiceId: uuid('invoice_id'), // set after invoice created; FK added below via relation
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const serviceBoats = pgTable(
  'service_boats',
  {
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    boatId: uuid('boat_id')
      .notNull()
      .references(() => boats.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey(t.serviceId, t.boatId),
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
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  sentAt: timestamp('sent_at'),
  paidAt: timestamp('paid_at'),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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

export const qboTokens = pgTable('qbo_tokens', {
  id: integer('id').primaryKey().default(1), // single row
  realmId: text('realm_id').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type QboTokens = typeof qboTokens.$inferSelect

// ─── Relations ────────────────────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  boats: many(boats),
  services: many(services),
  recurringSchedules: many(recurringSchedules),
  complaints: many(complaints),
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

export const serviceBoatsRelations = relations(serviceBoats, ({ one }) => ({
  service: one(services, { fields: [serviceBoats.serviceId], references: [services.id] }),
  boat: one(boats, { fields: [serviceBoats.boatId], references: [boats.id] }),
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

export const recurringSchedulesRelations = relations(recurringSchedules, ({ one, many }) => ({
  customer: one(customers, {
    fields: [recurringSchedules.customerId],
    references: [customers.id],
  }),
  services: many(services),
}))

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
