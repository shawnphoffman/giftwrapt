// Browser-safe catalogue of providers the admin UI knows about, kept out of
// the editor so Storybook can drive the same list the real form uses.

import type { ProviderType } from './ai-types'

// Each entry maps a friendly name to a (providerType, baseUrl) pair plus a
// curated model list. Adding an entry surfaces it in the provider dropdown.
export type Provider = {
	id: string
	name: string
	providerType: ProviderType
	baseUrl: string // empty string for openai/anthropic (SDK default)
	models: ReadonlyArray<string>
}

export const CUSTOM_PROVIDER_ID = 'custom'

export const PROVIDERS: ReadonlyArray<Provider> = [
	{
		id: 'openai',
		name: 'OpenAI',
		providerType: 'openai',
		baseUrl: '',
		models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3', 'o3-mini'],
	},
	{
		id: 'anthropic',
		name: 'Anthropic',
		providerType: 'anthropic',
		baseUrl: '',
		models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
	},
	{
		id: 'openrouter',
		name: 'OpenRouter',
		providerType: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		models: [
			'openai/gpt-4o-mini',
			'anthropic/claude-3.5-sonnet',
			'meta-llama/llama-3.3-70b-instruct',
			'google/gemini-2.0-flash-exp:free',
			'deepseek/deepseek-chat',
		],
	},
	{
		id: 'groq',
		name: 'Groq',
		providerType: 'openai-compatible',
		baseUrl: 'https://api.groq.com/openai/v1',
		models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
	},
	{
		id: 'together',
		name: 'Together AI',
		providerType: 'openai-compatible',
		baseUrl: 'https://api.together.xyz/v1',
		models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
	},
	{
		id: 'mistral',
		name: 'Mistral',
		providerType: 'openai-compatible',
		baseUrl: 'https://api.mistral.ai/v1',
		models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
	},
	{
		id: 'deepseek',
		name: 'DeepSeek',
		providerType: 'openai-compatible',
		baseUrl: 'https://api.deepseek.com/v1',
		models: ['deepseek-chat', 'deepseek-reasoner'],
	},
	{
		id: 'ollama',
		name: 'Ollama (localhost)',
		providerType: 'openai-compatible',
		baseUrl: 'http://localhost:11434/v1',
		models: [],
	},
	{
		id: 'lmstudio',
		name: 'LM Studio (localhost)',
		providerType: 'openai-compatible',
		baseUrl: 'http://localhost:1234/v1',
		models: [],
	},
]

export function findProviderMatch(providerType: ProviderType | undefined, baseUrl: string | undefined): Provider | undefined {
	if (!providerType) return undefined
	if (providerType === 'openai') return PROVIDERS.find(p => p.providerType === 'openai')
	if (providerType === 'anthropic') return PROVIDERS.find(p => p.providerType === 'anthropic')
	if (!baseUrl) return undefined
	return PROVIDERS.find(p => p.providerType === 'openai-compatible' && p.baseUrl === baseUrl)
}
