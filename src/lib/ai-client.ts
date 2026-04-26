import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import type { ProviderType } from './ai-config'

export type CreateAiModelArgs = {
	providerType: ProviderType
	apiKey: string
	model: string
	baseUrl?: string
}

export function createAiModel({ providerType, apiKey, model, baseUrl }: CreateAiModelArgs): LanguageModel {
	switch (providerType) {
		case 'openai':
			return createOpenAI({ apiKey })(model)
		case 'anthropic':
			return createAnthropic({ apiKey })(model)
		case 'openai-compatible':
			if (!baseUrl) throw new Error('openai-compatible provider requires a baseUrl')
			return createOpenAICompatible({ name: 'custom', baseURL: baseUrl, apiKey })(model)
	}
}
