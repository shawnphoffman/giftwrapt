import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

config()

const url = process.env.DATABASE_URL
if (!url) {
	console.error('DATABASE_URL is not set')
	process.exit(1)
}

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

try {
	await migrate(db, { migrationsFolder: './drizzle' })
	console.log('Migrations applied.')
} finally {
	await pool.end()
}
