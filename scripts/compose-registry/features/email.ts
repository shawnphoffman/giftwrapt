import type { EnvExampleSection } from '../types.ts'

export const emailEnvSection: EnvExampleSection = {
	id: 'email',
	body: `# -----------------------------------------------------------------------------
# Email (Resend) - optional
# -----------------------------------------------------------------------------
# Sign up at https://resend.com for an API key.
# Without these, email features (comments, birthdays) are silently disabled.
# RESEND_API_KEY=re_xxxxxxxxxx
# RESEND_FROM_EMAIL=noreply@your-domain.com
# RESEND_FROM_NAME=GiftWrapt
# RESEND_BCC_ADDRESS=admin@your-domain.com
`,
}
