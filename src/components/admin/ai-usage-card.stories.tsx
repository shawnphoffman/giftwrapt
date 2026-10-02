import type { Meta, StoryObj } from '@storybook/react-vite'

import { AiUsageTable } from './ai-usage-card'

/**
 * The per-feature table on /admin/ai, fed from the `ai_usage` ledger.
 */
const meta = {
	title: 'Admin/AiUsageTable',
	component: AiUsageTable,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof AiUsageTable>

export default meta
type Story = StoryObj<typeof meta>

export const WithUsage: Story = {
	args: {
		summary: {
			days: 30,
			monthToDateCostMicroUsd: 1_840_000,
			features: [
				{ feature: 'intelligence', calls: 412, errors: 3, tokensIn: 1_204_000, tokensOut: 96_500, estimatedCostMicroUsd: 1_686_500 },
				{ feature: 'scrape-provider', calls: 58, errors: 4, tokensIn: 410_000, tokensOut: 11_200, estimatedCostMicroUsd: 466_000 },
				{ feature: 'clean-title', calls: 233, errors: 0, tokensIn: 41_900, tokensOut: 3_500, estimatedCostMicroUsd: 59_400 },
				{ feature: 'photo-extract', calls: 12, errors: 1, tokensIn: 18_300, tokensOut: 1_900, estimatedCostMicroUsd: 27_800 },
				{ feature: 'admin-test', calls: 2, errors: 0, tokensIn: 16, tokensOut: 10, estimatedCostMicroUsd: 66 },
			],
			total: { calls: 717, errors: 8, tokensIn: 1_674_216, tokensOut: 113_110, estimatedCostMicroUsd: 2_239_766 },
		},
	},
}

export const Empty: Story = {
	args: {
		summary: {
			days: 30,
			monthToDateCostMicroUsd: 0,
			features: [],
			total: { calls: 0, errors: 0, tokensIn: 0, tokensOut: 0, estimatedCostMicroUsd: 0 },
		},
	},
}
