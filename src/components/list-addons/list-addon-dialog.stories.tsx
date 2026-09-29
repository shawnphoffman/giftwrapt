import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'

import type { AddonOnList } from '@/api/lists'
import { placeholderImages, viewerUser } from '@/components/items/_stories/fixtures'
import type { ScrapeUiState } from '@/lib/use-scrape-url'

import { ListAddonDialog } from './list-addon-dialog'

/**
 * Gifter's Off-List Gift dialog. The URL field mirrors the item form: leaving
 * it scrapes, the scraped title fills an empty description, and scraped
 * images are offered in the picker. Total cost is never prefilled from a
 * scrape (it's what the gifter paid). Scrape behavior is scripted through the
 * `scrape` and `cachedScrapeImages` story parameters.
 */

const NOW = new Date('2026-09-29T00:00:00Z')

const scrapedImages = [placeholderImages.square, placeholderImages.tall, placeholderImages.wide]

const scraping: ScrapeUiState = {
	phase: 'scraping',
	providers: [{ providerId: 'fetch-provider', status: 'in_progress' }],
	providerNames: {},
	elapsedMs: 1400,
	totalTimeoutMs: 20_000,
}

const scrapeDone: ScrapeUiState = {
	phase: 'done',
	providers: [{ providerId: 'fetch-provider', status: 'done' }],
	providerNames: {},
	elapsedMs: 2100,
	result: {
		title: 'Olive Wood Salad Servers, Set of 2',
		price: '28.00',
		imageUrls: scrapedImages,
		purchaseVariants: ['Size'],
	},
}

function makeAddon(overrides: Partial<AddonOnList> = {}): AddonOnList {
	return {
		id: 1,
		listId: 1,
		userId: viewerUser.id,
		description: 'Olive wood salad servers',
		totalCost: '28.00',
		notes: 'Ordered, arriving Friday.',
		url: 'https://www.etsy.com/listing/1566789/olive-wood-salad-servers',
		imageUrl: placeholderImages.square,
		createdAt: NOW,
		user: viewerUser,
		...overrides,
	}
}

const meta = {
	title: 'List Addons/Addon Dialog',
	component: ListAddonDialog,
	parameters: {
		layout: 'fullscreen',
		session: { user: viewerUser },
	},
	args: {
		open: true,
		onOpenChange: fn(),
		listId: 1,
	},
} satisfies Meta<typeof ListAddonDialog>

export default meta
type Story = StoryObj<typeof meta>

export const CreateEmpty: Story = {}

export const CreateScraping: Story = {
	parameters: { scrape: { initial: scraping } },
	args: { initialValues: { url: 'https://www.etsy.com/listing/1566789/olive-wood-salad-servers' } },
}

export const CreateScrapeFillsDescriptionAndImage: Story = {
	parameters: {
		scrape: { onStart: scrapeDone },
		docs: {
			description: {
				story:
					'Leaving the URL field scrapes; the title fills the empty description and the first image is picked. Total cost stays empty.',
			},
		},
	},
	play: async () => {
		const body = within(document.body)
		await userEvent.type(body.getByLabelText('URL (optional)'), 'https://www.etsy.com/listing/1566789/olive-wood-salad-servers')
		await userEvent.tab()
		await waitFor(() => expect(body.getByLabelText('What is it?')).toHaveValue('Olive Wood Salad Servers, Set of 2'))
		await expect(body.getByRole('radiogroup', { name: 'Product image' })).toBeInTheDocument()
		await expect(body.getByLabelText('Total cost (optional)')).toHaveValue(null)
		await expect(body.getByLabelText('Notes (optional)')).toHaveValue('')
	},
}

export const CreateScrapeKeepsTypedDescription: Story = {
	parameters: { scrape: { onStart: scrapeDone } },
	play: async () => {
		const body = within(document.body)
		await userEvent.type(body.getByLabelText('What is it?'), 'Salad servers for Linda')
		await userEvent.type(body.getByLabelText('URL (optional)'), 'https://www.etsy.com/listing/1566789/olive-wood-salad-servers')
		await userEvent.tab()
		await waitFor(() => expect(body.getByRole('radiogroup', { name: 'Product image' })).toBeInTheDocument())
		await expect(body.getByLabelText('What is it?')).toHaveValue('Salad servers for Linda')
	},
}

export const EditWithCachedImages: Story = {
	args: { mode: 'edit', addon: makeAddon() },
	parameters: {
		cachedScrapeImages: scrapedImages,
		docs: { description: { story: 'Editing re-offers the images the saved URL was scraped with (cache-only, no new scrape).' } },
	},
	play: async () => {
		const body = within(document.body)
		await waitFor(() => expect(body.getByRole('radiogroup', { name: 'Product image' })).toBeInTheDocument())
	},
}

export const EditWithoutUrlOrImage: Story = {
	args: { mode: 'edit', addon: makeAddon({ url: null, imageUrl: null, notes: null }) },
}

export const CreatePrefilledSkipsScrape: Story = {
	args: {
		initialValues: {
			description: 'Framed watercolor of the lake house dock at sunset',
			totalCost: '85',
			notes: 'She mentioned the dock at Thanksgiving.',
			url: 'https://www.etsy.com/listing/1567234901/custom-watercolor-house-portrait',
			imageUrl: placeholderImages.wide,
		},
	},
	parameters: {
		// If the prefilled URL were scraped, the description would flip to this title.
		scrape: { onStart: scrapeDone },
		cachedScrapeImages: scrapedImages,
		docs: {
			description: {
				story:
					'Opened prefilled (the gift-idea entry point). The prefilled URL counts as already scraped: leaving the field does not scrape, but its cached images are offered.',
			},
		},
	},
	play: async () => {
		const body = within(document.body)
		await userEvent.click(body.getByLabelText('URL (optional)'))
		await userEvent.tab()
		await waitFor(() => expect(body.getByRole('radiogroup', { name: 'Product image' })).toBeInTheDocument())
		await expect(body.getByLabelText('What is it?')).toHaveValue('Framed watercolor of the lake house dock at sunset')
		await expect(body.getByLabelText('Total cost (optional)')).toHaveValue(85)
	},
}
