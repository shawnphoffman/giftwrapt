import type { Meta, StoryObj } from '@storybook/react-vite'

import type { AiUsageSummary } from '@/lib/ai-usage'

import { AiUsageDetails, AiUsageTable } from './ai-usage-card'

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

const usage: AiUsageSummary = {
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
	sources: [
		{ source: 'cron', calls: 398, estimatedCostMicroUsd: 1_630_000 },
		{ source: 'web', calls: 241, estimatedCostMicroUsd: 402_000 },
		{ source: 'mcp', calls: 41, estimatedCostMicroUsd: 151_000 },
		{ source: 'import', calls: 22, estimatedCostMicroUsd: 38_000 },
		{ source: 'mobile', calls: 13, estimatedCostMicroUsd: 18_700 },
		{ source: 'admin', calls: 2, estimatedCostMicroUsd: 66 },
	],
	recent: [
		{
			id: 5,
			createdAt: '2026-10-02T15:04:00.000Z',
			feature: 'scrape-provider',
			source: 'mcp',
			userName: 'Kate Smith',
			model: 'claude-haiku-4-5',
			tokensIn: 7100,
			tokensOut: 190,
			estimatedCostMicroUsd: 8050,
			outcome: 'ok',
		},
		{
			id: 4,
			createdAt: '2026-10-02T14:51:00.000Z',
			feature: 'clean-title',
			source: 'web',
			userName: 'Jeff Smith',
			model: 'claude-haiku-4-5',
			tokensIn: 180,
			tokensOut: 15,
			estimatedCostMicroUsd: 255,
			outcome: 'ok',
		},
		{
			id: 3,
			createdAt: '2026-10-02T14:50:00.000Z',
			feature: 'photo-extract',
			source: 'web',
			userName: 'Jeff Smith',
			model: 'claude-haiku-4-5',
			tokensIn: 0,
			tokensOut: 0,
			estimatedCostMicroUsd: 0,
			outcome: 'error',
		},
		{
			id: 2,
			createdAt: '2026-10-02T07:00:00.000Z',
			feature: 'intelligence',
			source: 'cron',
			userName: 'Kate Smith',
			model: 'claude-haiku-4-5',
			tokensIn: 2900,
			tokensOut: 240,
			estimatedCostMicroUsd: 4100,
			outcome: 'ok',
		},
		{
			id: 1,
			createdAt: '2026-10-01T22:10:00.000Z',
			feature: 'scrape-provider',
			source: 'import',
			userName: null,
			model: 'claude-haiku-4-5',
			tokensIn: 6800,
			tokensOut: 170,
			estimatedCostMicroUsd: 7650,
			outcome: 'ok',
		},
	],
}

export const WithUsage: Story = { args: { summary: usage } }

/** The collapsible under the table: where calls came from, and the latest calls. */
export const Details: Story = {
	render: () => <AiUsageDetails summary={usage} />,
	args: { summary: usage },
}

export const Empty: Story = {
	args: {
		summary: {
			days: 30,
			monthToDateCostMicroUsd: 0,
			features: [],
			sources: [],
			recent: [],
			total: { calls: 0, errors: 0, tokensIn: 0, tokensOut: 0, estimatedCostMicroUsd: 0 },
		},
	},
}
