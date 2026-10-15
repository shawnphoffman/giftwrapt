import { useState } from 'react'

import type { ItemWithGifts } from '@/api/lists'
import ItemRow from '@/components/items/item-row'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useTextSize } from '@/hooks/use-text-size'
import { applyTextSize, DEFAULT_TEXT_SIZE, TEXT_SIZE_NAMES, TEXT_SIZE_STEPS, type TextSize } from '@/lib/text-size'

// A made-up wish list item for the preview. Rendered inert, so its Claim and
// menu buttons look real but do nothing.
const SAMPLE_ITEM: ItemWithGifts = {
	id: -1,
	listId: -1,
	groupId: null,
	title: 'Wireless headphones',
	status: 'incomplete',
	availability: 'available',
	availabilityChangedAt: null,
	url: null,
	vendorId: null,
	vendorSource: null,
	imageUrl: null,
	price: '129.00',
	currency: 'USD',
	notes: 'Over-ear, in black or navy. Noise cancelling would be great.',
	ratingValue: null,
	ratingCount: null,
	priority: 'high',
	isArchived: false,
	archivedAt: null,
	pendingDeletionAt: null,
	quantity: 1,
	groupSortOrder: null,
	sortOrder: null,
	createdAt: new Date('2026-09-04T12:00:00Z'),
	updatedAt: new Date('2026-09-04T12:00:00Z'),
	modifiedAt: null,
	gifts: [],
	commentCount: 0,
}

/**
 * The text size slider (plan 30c). Moving it resizes the whole app at once
 * and stores the step in a cookie on this device; the server reads the cookie
 * so the next page load is already at that size.
 */
export function TextSizeSettings() {
	const rendered = useTextSize()
	const [size, setSize] = useState<TextSize>(rendered)

	function choose(next: TextSize) {
		setSize(next)
		applyTextSize(next)
	}

	const index = TEXT_SIZE_STEPS.indexOf(size)

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div>
					<h2 id="text-size-label" className="text-lg font-semibold">
						Text Size
					</h2>
					<p className="text-sm text-muted-foreground">Makes text and controls larger or smaller on this device only.</p>
				</div>
				<div className="flex items-center gap-3">
					<span aria-hidden className="text-sm font-semibold">
						A
					</span>
					<Slider
						min={0}
						max={TEXT_SIZE_STEPS.length - 1}
						step={1}
						value={[index]}
						onValueChange={([i]) => choose(TEXT_SIZE_STEPS[i])}
						aria-labelledby="text-size-label"
						thumbProps={{ 'aria-labelledby': 'text-size-label', 'aria-valuetext': TEXT_SIZE_NAMES[size] }}
					/>
					<span aria-hidden className="text-2xl font-semibold">
						A
					</span>
				</div>
				<div className="flex min-h-8 items-center justify-between gap-3">
					<p className="text-sm font-medium" aria-live="polite">
						{TEXT_SIZE_NAMES[size]}
					</p>
					{size !== DEFAULT_TEXT_SIZE && (
						<Button variant="outline" size="sm" onClick={() => choose(DEFAULT_TEXT_SIZE)}>
							Reset to Default
						</Button>
					)}
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-base font-semibold">Preview</h3>
				<div inert aria-hidden>
					<ItemRow item={SAMPLE_ITEM} />
				</div>
			</section>
		</div>
	)
}
