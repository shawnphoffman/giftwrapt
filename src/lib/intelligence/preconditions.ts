import type { Database } from '@/db'
import { resolveAiConfig } from '@/lib/ai-config'
import type { AppSettings } from '@/lib/settings'

export type Preconditions = {
	enabled: boolean
	providerConfigured: boolean
	skipReason: 'disabled' | 'no-provider' | null
}

// Cheap pre-flight check before opening a run row. Cron uses this to
// short-circuit users without burning DB writes; the manual server fn
// surfaces the same state as a 4xx-style refusal.
export async function checkPreconditions(args: { db: Database; settings: AppSettings }): Promise<Preconditions> {
	const enabled = args.settings.intelligenceEnabled
	if (!enabled) return { enabled: false, providerConfigured: false, skipReason: 'disabled' }
	const ai = await resolveAiConfig(args.db)
	if (!ai.isValid) return { enabled: true, providerConfigured: false, skipReason: 'no-provider' }
	return { enabled: true, providerConfigured: true, skipReason: null }
}
