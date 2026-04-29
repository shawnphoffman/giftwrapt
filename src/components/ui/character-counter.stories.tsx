import type { Meta, StoryObj } from '@storybook/react-vite'

import { CharacterCounter } from './character-counter'

const meta = {
	title: 'UI/Character Counter',
	component: CharacterCounter,
	parameters: { layout: 'padded' },
	args: { max: 60 },
} satisfies Meta<typeof CharacterCounter>

export default meta
type Story = StoryObj<typeof meta>

const repeat = (n: number) => 'x'.repeat(n)

export const Empty: Story = {
	args: { value: '' },
	parameters: {
		docs: { description: { story: 'Default muted color when the field is empty or comfortably under the cap.' } },
	},
}

export const Comfortable: Story = {
	args: { value: repeat(20) },
	parameters: {
		docs: { description: { story: 'Well under the cap (33%) - stays muted.' } },
	},
}

export const Approaching: Story = {
	args: { value: repeat(54) },
	parameters: {
		docs: { description: { story: 'At 90% of the cap - flips to amber to warn the user before they hit the wall.' } },
	},
}

export const AtLimit: Story = {
	args: { value: repeat(60) },
	parameters: {
		docs: {
			description: {
				story: 'Exactly at the cap - still amber, not destructive (the input would refuse further keystrokes via maxLength).',
			},
		},
	},
}

export const Over: Story = {
	args: { value: repeat(72) },
	parameters: {
		docs: {
			description: {
				story:
					'Reachable only via paste-then-submit when native maxLength is somehow bypassed (e.g., programmatic value, test fixture). Goes destructive red so the schema-level error feels obvious.',
			},
		},
	},
}

export const LongMax: Story = {
	args: { value: repeat(4800), max: 5000 },
	parameters: {
		docs: { description: { story: 'Long-form text cap (item notes, comments). Numbers stay readable thanks to localeString grouping.' } },
	},
}
