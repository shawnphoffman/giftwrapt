// Browser-safe AI config types and constants. Kept separate from
// `ai-config.ts` because the latter pulls in server-only crypto via the
// stored API key envelope and would otherwise leak `node:crypto` into the
// client bundle.

export type ProviderType = 'openai' | 'openai-compatible' | 'anthropic'

export const PROVIDER_TYPES: ReadonlyArray<ProviderType> = ['openai', 'openai-compatible', 'anthropic']

export const DEFAULT_MAX_OUTPUT_TOKENS = 4096

export type FieldSource = 'env' | 'db' | 'default' | 'missing'

// One entry in a provider's live model catalogue. `label` is the provider's
// own display name when it publishes one (Anthropic, OpenRouter); the id is
// always what gets saved as the model setting.
export type ProviderModel = { id: string; label?: string }
