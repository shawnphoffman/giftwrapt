import { timestamp } from 'drizzle-orm/pg-core'

export const sharedCreatedAt = timestamp('created_at').defaultNow().notNull()

export const sharedUpdatedAt = timestamp('updated_at')
	.defaultNow()
	.$onUpdate(() => /* @__PURE__ */ new Date())
	.notNull()
