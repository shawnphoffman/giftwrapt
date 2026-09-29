import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import { parseChangelog } from '@/lib/changelog'

import changelogMarkdown from '../../../CHANGELOG.md?raw'
import { ChangelogPageContent } from './changelog-page'

const releases = parseChangelog(changelogMarkdown)

const meta = {
	title: 'Pages/Changelog',
	component: ChangelogPageContent,
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof ChangelogPageContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: { releases, currentVersion: releases[0]?.version ?? '0.0.0' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		expect(canvas.getByText('Your version')).toBeInTheDocument()
		await userEvent.click(canvas.getByRole('button', { name: /older releases/ }))
		expect(canvas.queryByRole('button', { name: /older releases/ })).not.toBeInTheDocument()
	},
}

export const OlderVersion: Story = {
	args: { releases, currentVersion: releases[2]?.version ?? '0.0.0' },
}
