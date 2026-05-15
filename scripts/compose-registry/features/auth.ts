import type { ComposeFeature, EnvExampleSection } from '../types.ts'

export const authFeature: ComposeFeature = {
	id: 'auth',
}

export const authEnvSection: EnvExampleSection = {
	id: 'auth',
	body: `# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------
# [required] Secret key for Better Auth session signing.
# Generate: openssl rand -base64 32
BETTER_AUTH_SECRET=change-me-to-a-random-secret

# [required for non-localhost deployments] Public URL the app is served from.
# Used for the session cookie domain and better-auth's trusted-origin check.
# Must include protocol, host, and port, e.g. http://192.168.1.137:3888 or
# https://giftwrapt.example.com. If unset, defaults to http://localhost:3001
# and sign-in/sign-up will fail from any other origin.
BETTER_AUTH_URL=http://localhost:3001
`,
}
