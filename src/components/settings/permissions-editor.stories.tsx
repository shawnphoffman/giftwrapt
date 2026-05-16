import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

import { type PermissionRow, PermissionsEditor } from './permissions-editor'

const SAMPLE_ROWS: Array<PermissionRow> = [
	{ id: 'u1', email: 'alice@example.test', name: 'Alice', image: null, access: 'view', sharedWithMe: 'view', cannotBeRestricted: false },
	{ id: 'u2', email: 'bob@example.test', name: 'Bob', image: null, access: 'edit', sharedWithMe: 'edit', cannotBeRestricted: false },
	{
		id: 'u3',
		email: 'carol@example.test',
		name: 'Carol',
		image: null,
		access: 'none',
		sharedWithMe: 'none',
		cannotBeRestricted: false,
	},
	{
		id: 'u4',
		email: 'dave-with-a-much-longer-email@example.test',
		name: 'Dave (partner)',
		image: null,
		access: 'view',
		sharedWithMe: 'view',
		// Partners and guardians can't be set to restricted; the editor
		// disables that toggle.
		cannotBeRestricted: true,
	},
]

const meta = {
	title: 'Settings/PermissionsEditor',
	component: PermissionsEditor,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof PermissionsEditor>

export default meta
type Story = StoryObj<typeof meta>

// Self-service surface: the editor owns the form + Save button.
export const SelfService: Story = {
	args: {
		rows: SAMPLE_ROWS,
		isLoading: false,
		isSaving: false,
		onSave: async () => {},
		showShareIndicator: true,
	},
}

// Empty state: no one to grant permissions to (single-user instance).
export const Empty: Story = {
	args: {
		rows: [],
		isLoading: false,
		isSaving: false,
		onSave: async () => {},
		emptyLabel: 'No other users yet.',
	},
}

// Skeleton state shown until the initial fetch lands.
export const Loading: Story = {
	args: {
		rows: null,
		isLoading: true,
		isSaving: false,
		onSave: async () => {},
	},
}

// Embedded surface (admin Edit User dialog): no internal Save button,
// no green-dot share indicator, and edits bubble via onChange so the
// outer form can persist them on its single Update User submit.
function EmbeddedHarness() {
	const [rows, setRows] = useState<Array<PermissionRow>>(SAMPLE_ROWS)
	return (
		<div className="space-y-3">
			<PermissionsEditor embedded rows={rows} isLoading={false} isSaving={false} onChange={setRows} showShareIndicator={false} />
			<pre className="text-xs text-muted-foreground p-3 rounded-md border bg-muted/40">
				{JSON.stringify(
					rows.map(r => ({ id: r.id, access: r.access })),
					null,
					2
				)}
			</pre>
		</div>
	)
}

export const EmbeddedInAdminForm: StoryObj = {
	render: () => <EmbeddedHarness />,
}
