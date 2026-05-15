import type { ComposeFeature, EnvExampleSection } from '../types.ts'

export const postgresFeature: ComposeFeature = {
	id: 'postgres',
	services: [
		{
			name: 'postgres',
			body: `    image: postgres:17-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-giftwrapt}
      POSTGRES_USER: \${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U \${POSTGRES_USER:-postgres} -d \${POSTGRES_DB:-giftwrapt}']
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped
`,
		},
	],
	volumes: ['postgres_data'],
}

export const databaseEnvSection: EnvExampleSection = {
	id: 'database',
	body: `# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
# [required] PostgreSQL connection string.
# Auto-constructed inside the compose network from POSTGRES_* vars below.
DATABASE_URL=postgresql://postgres:password@postgres:5432/giftwrapt

# Used by the docker/compose.selfhost-*.yaml files to configure the
# Postgres container and construct DATABASE_URL automatically.
POSTGRES_DB=giftwrapt
POSTGRES_USER=postgres
# Generate: openssl rand -base64 24 | tr -d '=+/' | head -c 32
POSTGRES_PASSWORD=changeme-use-a-strong-password
`,
}
