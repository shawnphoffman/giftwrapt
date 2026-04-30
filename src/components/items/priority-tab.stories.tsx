import type { Meta, StoryObj } from '@storybook/react-vite'

import { priorityEnumValues } from '@/db/schema/enums'

import { withItemFrame } from './_stories/decorators'
import { makeItemWithGifts, placeholderImages } from './_stories/fixtures'
import ItemRow from './item-row'

/**
 * The colored "peek" tab on the left edge of an item or group communicates
 * its priority. The tab is rendered inline in `ItemRow`, `ItemEditRow`,
 * `GroupBlock`, and a few other surfaces, so this story exercises it
 * through `ItemRow`.
 *
 * Tab anchors to the top of the row and extends down to match the row
 * height, capped at 64px so very tall rows (long notes, large image) do
 * not produce an oversized tab.
 */

const meta = {
	title: 'Items/Components/PriorityTab',
	component: ItemRow,
	parameters: { layout: 'fullscreen' },
	decorators: [withItemFrame],
} satisfies Meta<typeof ItemRow>

export default meta
type Story = StoryObj<typeof meta>

const longNotes = [
	'**Color preferences:** neutral tones only, no saturated brights.',
	'',
	'Cream, sage, stone, oat, or warm white are all great. Anything in the',
	'cool-toned blue or grey family is a hard no.',
	'',
	'**Sizing:** the 12oz size fits the cabinet shelf, the 16oz does not.',
	'',
	'**Care:** dishwasher safe is required, hand-wash only is a deal',
	'breaker for daily-use items in this house.',
	'',
	'**Where to find:** the Etsy shop has the closest match to what we',
	'already own, but the maker on Instagram occasionally restocks a',
	'limited run that is even nicer.',
].join('\n')

export const AllPriorities: Story = {
	args: { item: makeItemWithGifts() },
	render: () => (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-3">
				<h3 className="text-sm font-medium text-muted-foreground">Standard rows</h3>
				<div className="flex flex-col gap-4">
					{priorityEnumValues.map(priority => (
						<ItemRow
							key={priority}
							item={makeItemWithGifts({
								priority,
								title: `Priority: ${priority}`,
								url: null,
								price: null,
							})}
						/>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h3 className="text-sm font-medium text-muted-foreground">Tall rows (priority tab caps at 64px)</h3>
				<div className="flex flex-col gap-4">
					{(['low', 'high', 'very-high'] as const).map(priority => (
						<ItemRow
							key={priority}
							item={makeItemWithGifts({
								priority,
								title: `Tall ${priority} priority item with detailed notes`,
								url: 'https://www.etsy.com/listing/12345/handmade-mug',
								imageUrl: placeholderImages.square,
								price: '129',
								notes: longNotes,
							})}
						/>
					))}
				</div>
			</section>
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					'Top section shows each priority level on a normal-height row so the tab fills the row. Bottom section uses long notes and an image to push the row well past 64px tall, so the tab caps and stays anchored at the top of the card.',
			},
		},
	},
}
