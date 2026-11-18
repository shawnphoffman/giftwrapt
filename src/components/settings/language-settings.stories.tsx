import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import { LanguageSettingsContent } from './language-settings'

const meta = {
	title: 'Settings/Language',
	component: LanguageSettingsContent,
	args: {
		locales: ['en', 'fr'],
		value: 'auto',
		onChange: fn(),
	},
} satisfies Meta<typeof LanguageSettingsContent>

export default meta
type Story = StoryObj<typeof meta>

export const Automatic: Story = {}

export const English: Story = { args: { value: 'en' } }

export const French: Story = { args: { value: 'fr' } }

// Before hydration the stored choice is unknown, so the picker waits.
export const Loading: Story = { args: { value: null } }

export const Saving: Story = { args: { value: 'fr', busy: true } }

export const SaveFailed: Story = { args: { value: 'en', error: "Couldn't change the language. Try again." } }

// Each language is listed under its own name, and picking one reports its
// locale code.
export const PicksALanguage: Story = {
	play: async ({ canvasElement, args }) => {
		await userEvent.click(within(canvasElement).getByRole('combobox'))
		const listbox = within(await within(document.body).findByRole('listbox'))
		await expect(listbox.getByRole('option', { name: 'English' })).toBeInTheDocument()
		await userEvent.click(listbox.getByRole('option', { name: 'Français' }))
		await expect(args.onChange).toHaveBeenCalledWith('fr')
	},
}
