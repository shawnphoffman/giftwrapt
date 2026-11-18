import { useState } from 'react'

import type { ItemWithGifts } from '@/api/lists'
import ItemRow from '@/components/items/item-row'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useTextSize } from '@/hooks/use-text-size'
import { applyTextSize, DEFAULT_TEXT_SIZE, TEXT_SIZE_STEPS, type TextSize, textSizeName } from '@/lib/text-size'
import { m } from '@/paraglide/messages.js'

// A made-up wish list item for the preview. Rendered inert, so its Claim and
// menu buttons look real but do nothing. A function, not a constant: its text
// has to be in the language of the page that is rendering.
const sampleItem = (): ItemWithGifts => ({
	id: -1,
	listId: -1,
	groupId: null,
	title: m.settings_text_size_sample_title(),
	status: 'incomplete',
	availability: 'available',
	availabilityChangedAt: null,
	url: null,
	vendorId: null,
	vendorSource: null,
	imageUrl: null,
	price: '129.00',
	currency: 'USD',
	notes: m.settings_text_size_sample_notes(),
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
})

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
						{m.settings_text_size_title()}
					</h2>
					<p className="text-sm text-muted-foreground">{m.settings_text_size_description()}</p>
				</div>
				<div className="flex items-center gap-3">
					<span aria-hidden className="text-sm font-semibold">
						A
					</span>
					<Slider
						min={0}
						max={TEXT_SIZE_STEPS.length - 1}
						step={1}
						ticks
						value={[index]}
						onValueChange={([i]) => choose(TEXT_SIZE_STEPS[i])}
						aria-labelledby="text-size-label"
						thumbProps={{ 'aria-labelledby': 'text-size-label', 'aria-valuetext': textSizeName(size) }}
					/>
					<span aria-hidden className="text-2xl font-semibold">
						A
					</span>
				</div>
				<div className="flex min-h-8 items-center justify-between gap-3">
					<p className="text-sm font-medium" aria-live="polite">
						{textSizeName(size)}
					</p>
					{size !== DEFAULT_TEXT_SIZE && (
						<Button variant="outline" size="sm" onClick={() => choose(DEFAULT_TEXT_SIZE)}>
							{m.settings_text_size_reset()}
						</Button>
					)}
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="text-base font-semibold">{m.settings_text_size_preview()}</h3>
				<div inert aria-hidden>
					<ItemRow item={sampleItem()} />
				</div>
			</section>
		</div>
	)
}
