import { createServerFn } from '@tanstack/react-start'
import QRCode from 'qrcode'
import { z } from 'zod'

import { authMiddleware } from '@/middleware/auth'

// Server-side QR generation for the 2FA enrollment flow. Lives here
// (not in the client bundle) so the `qrcode` library - which uses
// `Function(...)` internally - never reaches the browser. Lets us
// drop `'unsafe-eval'` from the production CSP. See
// `.notes/security/2026-05-checklist-audit.md` §34.

const inputSchema = z.object({
	totpURI: z.string().startsWith('otpauth://').max(2048),
})

export const getTotpQrSvg = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.inputValidator((data: z.infer<typeof inputSchema>) => inputSchema.parse(data))
	.handler(async ({ data }): Promise<{ svg: string }> => {
		const svg = await QRCode.toString(data.totpURI, {
			type: 'svg',
			margin: 1,
			width: 240,
		})
		return { svg }
	})
