// Pure HTML extractor for Amazon wishlists. Walks the wishlist DOM with
// cheerio and pulls each item's title, url, image, and price text into
// `ItemDraft[]`. Both the URL-fetched path and the user-pasted-HTML
// fallback feed the same parser so the rest of the import flow stays
// uniform.
//
// The selectors target the rendered wishlist markup as of late 2025/2026
// (`li[data-itemid]` rows with `a[id^="itemName_"]` and an inner
// product image). Amazon iterates layout often, so this is best-effort:
// when selectors stop matching we return [] from the URL path and the
// dialog falls through to the paste-HTML fallback. Both branches accept
// arbitrary input (the parser never throws on shape mismatches).

import type { CheerioAPI } from 'cheerio'
import * as cheerio from 'cheerio/slim'

import type { ItemDraft } from '@/api/import'
import { httpsUpgradeOrNull } from '@/lib/image-url'

// Item rows have a stable `data-itemid` attribute even when the rest of
// the styling shifts. Anchoring on it lets us tolerate class-name churn.
const ROW_SELECTOR = 'li[data-itemid], li.g-item-sortable, [id^="item_"]'
const TITLE_LINK_SELECTOR = 'a[id^="itemName_"], a[href*="/dp/"]'
const IMAGE_SELECTOR = 'img[data-a-hires], img[src]'
// Amazon stashes the canonical price in `.a-offscreen` for screen
// readers; that's the cleanest target. We fall back through bigger
// containers when it's missing.
const PRICE_SELECTORS = ['.a-price .a-offscreen', '.a-offscreen', '.a-price', '[data-price]'] as const

function absolutize(url: string | undefined, base: string | URL): string | null {
	if (!url) return null
	try {
		return new URL(url, base).toString()
	} catch {
		return null
	}
}

export function parseAmazonWishlist(html: string, baseUrl: string = 'https://www.amazon.com'): Array<ItemDraft> {
	if (!html || html.length === 0) return []
	let $: CheerioAPI
	try {
		$ = cheerio.load(html)
	} catch {
		return []
	}

	const out: Array<ItemDraft> = []
	const seen = new Set<string>()
	$(ROW_SELECTOR).each((_, el) => {
		const $row = $(el)

		const titleAnchor = $row.find(TITLE_LINK_SELECTOR).first()
		const rawHref = titleAnchor.attr('href')?.trim() ?? null
		const url = absolutize(rawHref ?? undefined, baseUrl)
		// Amazon frequently shows a `title` attribute on the link with the
		// full product name even when the visible text is truncated.
		const title = (titleAnchor.attr('title') ?? '').trim() || titleAnchor.text().replace(/\s+/g, ' ').trim() || null

		// Image: prefer the high-res variant when present.
		const imgEl = $row.find(IMAGE_SELECTOR).first()
		const rawImg = imgEl.attr('data-a-hires') ?? imgEl.attr('src')
		const imageUrl = httpsUpgradeOrNull(absolutize(rawImg, baseUrl))

		let priceText: string | null = null
		for (const sel of PRICE_SELECTORS) {
			const t = $row.find(sel).first().text().replace(/\s+/g, ' ').trim()
			if (t) {
				priceText = t
				break
			}
		}

		// Drop rows that have neither a URL nor a title; those are layout
		// shells (e.g. "Add items" placeholder rows).
		if (!url && !title) return

		// De-dupe by URL when present; otherwise by title.
		const dedupeKey = url ?? title ?? ''
		if (seen.has(dedupeKey)) return
		seen.add(dedupeKey)

		out.push({
			title,
			url,
			price: priceText,
			currency: null,
			imageUrl,
			notes: null,
		})
	})

	return out
}
