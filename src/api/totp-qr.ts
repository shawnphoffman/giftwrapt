import { createServerFn } from '@tanstack/react-start'
import QRCode from 'qrcode'
import { z } from 'zod'

import { authMiddleware } from '@/middleware/auth'

// Server-side QR generation for the 2FA enrollment flow. Lives here
// (not in the client bundle) so the `qrcode` library - which uses
// `Function(...)` internally - never reaches the browser. Lets us
// drop `'unsafe-eval'` from the production CSP. See
// `.notes/security/2026-05-checklist-audit.md` §34.

export const totpQrInputSchema = z.object({
	totpURI: z.string().startsWith('otpauth://').max(2048),
})

export type TotpQrInput = z.infer<typeof totpQrInputSchema>

// Pure handler exposed for unit tests. The `createServerFn` wrapper below
// just composes auth middleware + input validation + this function; pulling
// it out keeps the test target dependency-free.
export async function renderTotpQrSvg(input: TotpQrInput): Promise<{ svg: string }> {
	const svg = await QRCode.toString(input.totpURI, {
		type: 'svg',
		margin: 1,
		width: 240,
	})
	return { svg }
}

export const getTotpQrSvg = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: TotpQrInput) => totpQrInputSchema.parse(data))
	.handler(({ data }): Promise<{ svg: string }> => renderTotpQrSvg(data))
