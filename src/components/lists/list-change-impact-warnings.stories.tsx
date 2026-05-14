// Stories per warning condition. Bucketed under `Lists / List change impact`
// so screenshots cover each case `evaluateListChangeImpact` can produce.

import type { Meta, StoryObj } from '@storybook/react-vite'

import { ListChangeImpactWarnings } from './list-change-impact-warnings'

const meta = {
	title: 'Lists/ListChangeImpactWarnings',
	component: ListChangeImpactWarnings,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="max-w-md">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ListChangeImpactWarnings>

export default meta
type Story = StoryObj<typeof meta>

// Negative: no warnings → renders nothing.
export const NoWarnings: Story = {
	args: { warnings: [] },
}

// Type change away from a matching type and no backup list covers the
// event. The most-common warning condition for this analyzer.
export const TypeAway: Story = {
	args: {
		warnings: [
			{
				kind: 'type-away',
				text: 'Birthday is in 14 days. After this change, no list will auto-reveal on that day.',
			},
		],
	},
}

// customHolidayId change away from an in-window holiday with no backup.
export const CustomHolidayAway: Story = {
	args: {
		warnings: [
			{
				kind: 'customHolidayId-away',
				text: 'Easter is in 20 days. After this change, no list will auto-reveal on that day.',
			},
		],
	},
}

// Archive flow (isActive=false) for the only list covering an in-window event.
export const Archive: Story = {
	args: {
		warnings: [
			{
				kind: 'archive',
				text: "Christmas is in 12 days and this is the only list set up to auto-reveal on that day. Archiving means gifts won't auto-reveal.",
			},
		],
	},
}

// Delete flow — same trigger as archive, slightly more final phrasing.
export const Delete: Story = {
	args: {
		warnings: [
			{
				kind: 'delete',
				text: "Birthday is in 7 days and this is the only list set up to auto-reveal on that day. Deleting means gifts won't auto-reveal.",
			},
		],
	},
}

// Multiple events affected at once: type-away triggers a warning per
// uncovered in-window event.
export const MultipleEvents: Story = {
	args: {
		warnings: [
			{
				kind: 'type-away',
				text: 'Birthday is in 14 days. After this change, no list will auto-reveal on that day.',
			},
			{
				kind: 'type-away',
				text: 'Easter is in 32 days. After this change, no list will auto-reveal on that day.',
			},
		],
	},
}

// Day-of phrasing edge cases (tomorrow / today).
export const Tomorrow: Story = {
	args: {
		warnings: [{ kind: 'type-away', text: 'Christmas is tomorrow. After this change, no list will auto-reveal on that day.' }],
	},
}

export const Today: Story = {
	args: {
		warnings: [
			{
				kind: 'delete',
				text: "Birthday is today and this is the only list set up to auto-reveal on that day. Deleting means gifts won't auto-reveal.",
			},
		],
	},
}
