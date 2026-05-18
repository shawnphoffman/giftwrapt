import type { Meta, StoryObj } from '@storybook/react-vite'

import type { StorageObjectRow, StorageSummary } from '@/api/admin-storage'

import { StorageFilterPills, StorageSummaryBar, StorageTable } from './storage-browser-view'

// Pure-view stories for /admin/storage. The orchestrating component
// (storage-browser.tsx) wires server fns; here we exercise the table
// rendering, summary numbers, and filter pill states with fixtures.

function StorageView({
	summary,
	rows,
	loading = false,
}: {
	summary: StorageSummary | null
	rows: Array<StorageObjectRow>
	loading?: boolean
}) {
	return (
		<div className="space-y-4">
			<StorageSummaryBar summary={summary} loading={loading} />
			<StorageFilterPills active="all" onChange={() => undefined} />
			<StorageTable rows={rows} />
		</div>
	)
}

const meta = {
	title: 'Admin/Storage Browser',
	component: StorageView,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof StorageView>

export default meta
type Story = StoryObj<typeof meta>

const placeholderImg =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="%23334155"/><text x="50%" y="50%" font-family="monospace" font-size="10" fill="white" text-anchor="middle" dominant-baseline="middle">img</text></svg>'
	)

const fixedDate = new Date('2026-04-26T19:48:00Z')

const attachedAvatar: StorageObjectRow = {
	key: 'avatars/user-abc-aaaaaaaa.webp',
	url: placeholderImg,
	size: 18_432,
	lastModified: fixedDate,
	kind: 'avatar',
	status: 'attached',
	owner: { id: 'user-abc', name: 'Ada Lovelace', email: 'ada@example.com' },
	target: { kind: 'user', id: 'user-abc', label: 'Ada Lovelace' },
}

const orphanAvatar: StorageObjectRow = {
	key: 'avatars/user-abc-bbbbbbbb.webp',
	url: placeholderImg,
	size: 16_204,
	lastModified: new Date(fixedDate.getTime() - 1000 * 60 * 60 * 24 * 3),
	kind: 'avatar',
	status: 'orphan',
	owner: { id: 'user-abc', name: 'Ada Lovelace', email: 'ada@example.com' },
	target: { kind: 'user', id: 'user-abc', label: 'Ada Lovelace' },
}

const attachedItem: StorageObjectRow = {
	key: 'items/42/abcdef0123.webp',
	url: placeholderImg,
	size: 184_320,
	lastModified: fixedDate,
	kind: 'item',
	status: 'attached',
	owner: { id: 'user-xyz', name: 'Bea Carver', email: 'bea@example.com' },
	target: { kind: 'item', id: 42, label: 'Espresso machine', listId: 7, listName: "Bea's wishlist", deleted: false },
}

const deletedItemImage: StorageObjectRow = {
	key: 'items/99/zzzzzzzzzz.webp',
	url: placeholderImg,
	size: 220_000,
	lastModified: new Date(fixedDate.getTime() - 1000 * 60 * 60 * 24 * 30),
	kind: 'item',
	status: 'orphan',
	owner: null,
	target: { kind: 'item', id: 99, label: '(item #99)', listId: -1, listName: null, deleted: true },
}

const unknownObject: StorageObjectRow = {
	key: 'misc/legacy-thumb.png',
	url: placeholderImg,
	size: 9_400,
	lastModified: new Date(fixedDate.getTime() - 1000 * 60 * 60 * 24 * 365),
	kind: 'unknown',
	status: 'unknown',
	owner: null,
	target: null,
}

const attachedPurchaseImage: StorageObjectRow = {
	key: 'purchases/claim/12/abc123def456.webp',
	url: placeholderImg,
	size: 102_400,
	lastModified: fixedDate,
	kind: 'purchase',
	status: 'attached',
	owner: { id: 'user-xyz', name: 'Bea Carver', email: 'bea@example.com' },
	target: {
		kind: 'purchase',
		purchaseKind: 'claim',
		id: 12,
		label: 'Espresso machine',
		gifterId: 'user-xyz',
		gifterName: 'Bea Carver',
		deleted: false,
	},
}

const attachedPurchasePdf: StorageObjectRow = {
	key: 'purchases/addon/4/abcdef654321.pdf',
	url: '#',
	size: 64_512,
	lastModified: fixedDate,
	kind: 'purchase',
	status: 'attached',
	owner: { id: 'user-xyz', name: 'Bea Carver', email: 'bea@example.com' },
	target: {
		kind: 'purchase',
		purchaseKind: 'addon',
		id: 4,
		label: 'Gift card',
		gifterId: 'user-xyz',
		gifterName: 'Bea Carver',
		deleted: false,
	},
}

const orphanPurchaseImage: StorageObjectRow = {
	key: 'purchases/claim/99/orphan9876ab.webp',
	url: placeholderImg,
	size: 80_000,
	lastModified: new Date(fixedDate.getTime() - 1000 * 60 * 60 * 24 * 7),
	kind: 'purchase',
	status: 'orphan',
	owner: null,
	target: {
		kind: 'purchase',
		purchaseKind: 'claim',
		id: 99,
		label: '(purchase #99)',
		gifterId: '',
		gifterName: null,
		deleted: true,
	},
}

export const Empty: Story = {
	args: {
		summary: { totalCount: 0, totalBytes: 0, orphanCount: 0, orphanBytes: 0, truncated: false },
		rows: [],
	},
	parameters: {
		docs: { description: { story: 'Fresh bucket. No objects, no orphans, the bulk-delete button is disabled.' } },
	},
}

export const MixedAttachedAndOrphan: Story = {
	args: {
		summary: { totalCount: 5, totalBytes: 448_356, orphanCount: 2, orphanBytes: 236_204, truncated: false },
		rows: [attachedAvatar, orphanAvatar, attachedItem, deletedItemImage, unknownObject],
	},
	parameters: {
		docs: {
			description: {
				story:
					'Typical state: a couple of healthy attached objects, an orphan avatar replaced by a newer upload, an item-image whose item row was deleted, plus a legacy unknown-prefix object.',
			},
		},
	},
}

export const Purchases: Story = {
	args: {
		summary: { totalCount: 3, totalBytes: 246_912, orphanCount: 1, orphanBytes: 80_000, truncated: false },
		rows: [attachedPurchaseImage, attachedPurchasePdf, orphanPurchaseImage],
	},
	parameters: {
		docs: {
			description: {
				story:
					'Purchase attachments: an image receipt attached to a claim, a PDF gift receipt on an addon, and an orphan whose underlying claim was deleted.',
			},
		},
	},
}

export const AllOrphans: Story = {
	args: {
		summary: { totalCount: 3, totalBytes: 254_636, orphanCount: 3, orphanBytes: 254_636, truncated: false },
		rows: [orphanAvatar, deletedItemImage, unknownObject],
	},
	parameters: {
		docs: { description: { story: 'After a long run without cleanup. Every row is reclaimable; bulk-delete should clear the bucket.' } },
	},
}

export const Loading: Story = {
	args: {
		summary: null,
		rows: [],
		loading: true,
	},
	parameters: {
		docs: { description: { story: 'Initial load. Summary placeholders show "…" while the bucket walk is in flight.' } },
	},
}
