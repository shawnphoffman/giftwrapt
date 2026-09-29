import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { encodeMentionDraft, type MentionRef } from '@/lib/comment-mentions'

import { type MentionCandidate, MentionTextarea } from './mention-textarea'

/**
 * Comment composer with an @mention typeahead. Type `@` to open the list of
 * people who can see the list, keep typing to filter, then pick with the
 * mouse or arrow keys + Enter/Tab. Escape dismisses. The "Stored as" line
 * shows the token text the server receives.
 */

const PEOPLE: Array<MentionCandidate> = [
	{ id: 'u-jo', name: 'Aunt Jo', email: 'jo@example.com', image: null },
	{ id: 'u-mom', name: 'Mom', email: 'mom@example.com', image: null },
	{ id: 'u-dad', name: 'Dad', email: 'dad@example.com', image: null },
	{ id: 'u-sam', name: 'Sam Sibling', email: 'sam@example.com', image: null },
	{ id: 'u-noname', name: null, email: 'robin@example.com', image: null },
]

function ControlledDemo({ candidates, initial = '' }: { candidates: Array<MentionCandidate> | undefined; initial?: string }) {
	const [value, setValue] = useState(initial)
	const [mentions, setMentions] = useState<Array<MentionRef>>([])
	return (
		<div className="max-w-md flex flex-col gap-3">
			<MentionTextarea
				aria-label="Write a comment"
				placeholder="Write a comment. Type @ to mention someone..."
				rows={2}
				value={value}
				onValueChange={setValue}
				mentions={mentions}
				onMentionsChange={setMentions}
				candidates={candidates}
				className="text-base md:text-sm"
			/>
			<p className="text-xs text-muted-foreground break-all">
				Stored as: <code data-testid="encoded">{encodeMentionDraft(value, mentions)}</code>
			</p>
		</div>
	)
}

const meta = {
	title: 'Items/Components/MentionTextarea',
	component: ControlledDemo,
	parameters: { layout: 'padded' },
	args: { candidates: PEOPLE },
} satisfies Meta<typeof ControlledDemo>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PickWithKeyboard: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const body = within(canvasElement.ownerDocument.body)
		const textarea = canvas.getByRole<HTMLTextAreaElement>('combobox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, 'ask @sa')
		// The popover portals to <body>.
		await waitFor(() => expect(body.getByRole('option', { name: /Sam Sibling/ })).toBeInTheDocument())
		await userEvent.keyboard('{Enter}')
		await expect(textarea.value).toBe('ask @Sam Sibling ')
		await userEvent.type(textarea, 'about size')
		await expect(canvas.getByTestId('encoded').textContent).toBe('ask @[Sam Sibling](u-sam) about size')
	},
}

export const PickWithMouse: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const body = within(canvasElement.ownerDocument.body)
		const textarea = canvas.getByRole<HTMLTextAreaElement>('combobox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, '@')
		const option = await body.findByRole('option', { name: /Dad/ })
		await userEvent.pointer({ keys: '[MouseLeft]', target: option })
		await expect(textarea.value).toBe('@Dad ')
		await expect(canvas.getByTestId('encoded').textContent).toBe('@[Dad](u-dad) ')
	},
}

export const EscapeDismisses: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const body = within(canvasElement.ownerDocument.body)
		const textarea = canvas.getByRole<HTMLTextAreaElement>('combobox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, '@mo')
		await body.findByRole('option', { name: /Mom/ })
		await userEvent.keyboard('{Escape}')
		await waitFor(() => expect(body.queryByRole('option')).not.toBeInTheDocument())
		// Hand-typed @Name without a pick stays plain text.
		await expect(canvas.getByTestId('encoded').textContent).toBe('@mo')
	},
}

export const EmailFallbackName: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		const textarea = within(canvasElement).getByRole<HTMLTextAreaElement>('combobox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, '@robin')
		// A user with no display name is matched and shown by email.
		await expect(await body.findByRole('option', { name: /robin@example.com/ })).toBeInTheDocument()
	},
}

export const Loading: Story = {
	args: { candidates: undefined },
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		const textarea = within(canvasElement).getByRole<HTMLTextAreaElement>('combobox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, '@')
		await expect(await body.findByText('Loading people...')).toBeInTheDocument()
	},
}

export const NoMatchesStaysClosed: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body)
		const textarea = within(canvasElement).getByRole<HTMLTextAreaElement>('combobox')
		await userEvent.click(textarea)
		await userEvent.type(textarea, '@zzz')
		// `@` alone opens the list; it closes (after its exit animation) once nothing matches.
		await waitFor(() => expect(body.queryByRole('listbox')).not.toBeInTheDocument())
		await expect(textarea).toHaveAttribute('aria-expanded', 'false')
	},
}
