// Helpers shared by `/api/mobile/*` REST routes consumed by the iOS
// companion app. Browser/web clients don't use these endpoints; the web
// app continues to call server functions directly.

import { json } from '@tanstack/react-start'

import { auth } from '@/lib/auth'

export type MobileSession = Awaited<ReturnType<typeof auth.api.getSession>>

export async function requireMobileSession(
	request: Request
): Promise<{ ok: true; session: NonNullable<MobileSession> } | { ok: false; response: Response }> {
	const session = await auth.api.getSession({ headers: request.headers })
	if (!session?.user.id) {
		return { ok: false, response: json({ error: 'unauthorized' }, { status: 401 }) }
	}
	return { ok: true, session }
}

export function jsonError(reason: string, status: number): Response {
	return json({ error: reason }, { status })
}
