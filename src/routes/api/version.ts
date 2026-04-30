import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { auth } from '@/lib/auth'
import { BUILD_INFO } from '@/lib/build-info'

// Authenticated build identity. Clients poll this to detect when the server
// has rolled to a new deploy while their tab still holds the old bundle, so
// they can prompt a reload.
//
// Auth-gated to avoid letting unauthenticated scanners fingerprint the
// running deploy (mirrors /api/health's intent: see sec-review H3).
//
// Cache-Control: no-store so a CDN can't serve a stale commit hash and
// defeat the whole point of the check.
export const Route = createFileRoute('/api/version')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					return json({ error: 'Unauthorized' }, { status: 401 })
				}
				return json(
					{
						commit: BUILD_INFO.commit,
						version: BUILD_INFO.version,
						buildTime: BUILD_INFO.buildTime,
					},
					{
						headers: {
							'Cache-Control': 'no-store, no-cache, must-revalidate',
						},
					}
				)
			},
		},
	},
})
