import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { TwoFactorPanelContent } from './two-factor-panel'

const SAMPLE_TOTP_URI =
	'otpauth://totp/GiftWrapt:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GiftWrapt&algorithm=SHA1&digits=6&period=30'

// Minimal valid SVG with the same dimensions our server fn returns
// (`qrcode.toString` with `width: 240`). Stand-in for the real
// server-rendered QR so the story renders deterministically without
// running a server function.
const SAMPLE_QR_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" width="240" height="240"><rect width="25" height="25" fill="#fff"/><rect x="2" y="2" width="21" height="21" fill="none" stroke="#000" stroke-width="1"/><text x="12.5" y="14" text-anchor="middle" font-size="3" fill="#000">QR FIXTURE</text></svg>'

const SAMPLE_BACKUP_CODES = [
	'a1b2-c3d4',
	'e5f6-g7h8',
	'i9j0-k1l2',
	'm3n4-o5p6',
	'q7r8-s9t0',
	'u1v2-w3x4',
	'y5z6-a7b8',
	'c9d0-e1f2',
	'g3h4-i5j6',
	'k7l8-m9n0',
] as const

const meta = {
	title: 'Settings/Two Factor Panel',
	component: TwoFactorPanelContent,
	parameters: { layout: 'padded' },
	args: {
		status: 'disabled',
		enrollment: null,
		pendingBackupCodes: null,
		error: null,
		busy: false,
		onStartEnrollment: async () => {},
		onVerifyEnrollment: async () => {},
		onCancelEnrollment: () => {},
		onDisable: async () => {},
		onRegenerateBackupCodes: async () => {},
		onDismissBackupCodes: () => {},
	},
} satisfies Meta<typeof TwoFactorPanelContent>

export default meta
type Story = StoryObj<typeof meta>

export const Disabled: Story = {}

export const Enrolling: Story = {
	args: {
		status: 'enrolling',
		enrollment: { totpURI: SAMPLE_TOTP_URI, backupCodes: [...SAMPLE_BACKUP_CODES], qrSvg: SAMPLE_QR_SVG },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// The server-rendered SVG is delivered as a `data:image/svg+xml;utf8,…`
		// payload on an <img> tag. If this assertion ever flips to `data:image/png`
		// we've regressed back to client-side `qrcode.toDataURL`, which would
		// require `'unsafe-eval'` in the CSP again. See `vite.config.ts`.
		const img = await canvas.findByAltText('TOTP QR code')
		await expect(img).toBeInTheDocument()
		await expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;utf8,/)
		// The fixture SVG embeds the literal "QR FIXTURE" string; if the
		// img is showing it, our parent-driven data flow is wired correctly.
		const decoded = decodeURIComponent(img.getAttribute('src') ?? '')
		await expect(decoded).toContain('QR FIXTURE')
	},
}

export const EnrollingLoadingQR: Story = {
	args: {
		status: 'enrolling',
		enrollment: { totpURI: SAMPLE_TOTP_URI, backupCodes: [...SAMPLE_BACKUP_CODES], qrSvg: null },
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// In flight: no <img>, fallback text instead.
		await expect(canvas.queryByAltText('TOTP QR code')).toBeNull()
		await expect(canvas.getByText(/Generating QR/i)).toBeInTheDocument()
	},
}

export const EnrollmentError: Story = {
	args: {
		status: 'enrolling',
		enrollment: { totpURI: SAMPLE_TOTP_URI, backupCodes: [...SAMPLE_BACKUP_CODES], qrSvg: SAMPLE_QR_SVG },
		error: "Code didn't match. Check your authenticator and try again.",
	},
}

export const Enabled: Story = {
	args: { status: 'enabled' },
}

export const EnabledWithFreshBackupCodes: Story = {
	args: { status: 'enabled', pendingBackupCodes: [...SAMPLE_BACKUP_CODES] },
}

export const Busy: Story = {
	args: { status: 'disabled', busy: true },
}
