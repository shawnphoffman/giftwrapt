import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'

import { db } from '@/db'

export const Route = createFileRoute('/api/health')({
	server: {
		handlers: {
			GET: async () => {
				try {
					await db.execute(sql`SELECT 1`)
					return json({ status: 'ok', timestamp: new Date().toISOString() })
				} catch {
					return json({ status: 'error', message: 'Database unreachable' }, { status: 503 })
				}
			},
		},
	},
})
