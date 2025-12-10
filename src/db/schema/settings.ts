import { jsonb, pgTable, text } from 'drizzle-orm/pg-core'

import { timestamps } from './shared'

export const appSettings = pgTable('app_settings', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	...timestamps,
})

export type AppSetting = typeof appSettings.$inferSelect
export type NewAppSetting = typeof appSettings.$inferInsert
