import type { Meta, StoryObj } from '@storybook/react-vite'

import { TwoFactorPanelContent } from './two-factor-panel'

const SAMPLE_TOTP_URI =
	'otpauth://totp/GiftWrapt:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GiftWrapt&algorithm=SHA1&digits=6&period=30'

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
		enrollment: { totpURI: SAMPLE_TOTP_URI, backupCodes: [...SAMPLE_BACKUP_CODES] },
	},
}

export const EnrollmentError: Story = {
	args: {
		status: 'enrolling',
		enrollment: { totpURI: SAMPLE_TOTP_URI, backupCodes: [...SAMPLE_BACKUP_CODES] },
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
