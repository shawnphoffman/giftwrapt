import { describe, expect, it } from 'vitest'

import { parseAmazonWishlist } from '../amazon-wishlist'

// Fixtures below are hand-crafted to mirror Amazon wishlist DOM shape
// without copying any real product titles or images. The structural
// classes / data attributes (`data-itemid`, `id^="itemName_"`,
// `.a-offscreen`) are the load-bearing parts and match the rendered
// page as of late 2025/2026.

const NORMAL_FIXTURE = `
<html><body>
	<ul>
		<li class="g-item-sortable" data-itemid="abc123">
			<div>
				<a id="itemName_abc123" href="/dp/B00FAKE001/ref=lst_wl?tag=test" title="Generic Bluetooth Headphones - Black, Over Ear">
					Generic Bluetooth Headphones...
				</a>
				<img src="//m.media-amazon.com/images/I/fake1._SL160_.jpg" data-a-hires="https://m.media-amazon.com/images/I/fake1._SL400_.jpg" />
				<span class="a-price"><span class="a-offscreen">$49.99</span><span aria-hidden="true">$49.99</span></span>
			</div>
		</li>
		<li class="g-item-sortable" data-itemid="def456">
			<a id="itemName_def456" href="https://www.amazon.com/dp/B00FAKE002" title="Stainless Steel Coffee Grinder">Stainless Steel Coffee Grinder</a>
			<img src="https://m.media-amazon.com/images/I/fake2.jpg" />
			<span class="a-price"><span class="a-offscreen">$29.50</span></span>
		</li>
		<li class="g-item-sortable" data-itemid="ghi789">
			<!-- No title link, layout shell. Should be skipped. -->
			<div class="placeholder"></div>
		</li>
	</ul>
</body></html>
`

const EMPTY_FIXTURE = `
<html><body>
	<div class="empty-wishlist-message">No items in this list yet.</div>
</body></html>
`

const MALFORMED_FIXTURE = '<html><body><div>Just a string, no list rows.</div></body></html>'

describe('parseAmazonWishlist', () => {
	it('extracts title, url, image, and price from a normal wishlist', () => {
		const out = parseAmazonWishlist(NORMAL_FIXTURE)
		expect(out).toHaveLength(2)

		expect(out[0]).toMatchObject({
			title: 'Generic Bluetooth Headphones - Black, Over Ear',
			url: 'https://www.amazon.com/dp/B00FAKE001/ref=lst_wl?tag=test',
			price: '$49.99',
		})
		// Prefers data-a-hires (high-res) over src.
		expect(out[0].imageUrl).toBe('https://m.media-amazon.com/images/I/fake1._SL400_.jpg')

		expect(out[1]).toMatchObject({
			title: 'Stainless Steel Coffee Grinder',
			url: 'https://www.amazon.com/dp/B00FAKE002',
			price: '$29.50',
			imageUrl: 'https://m.media-amazon.com/images/I/fake2.jpg',
		})
	})

	it('returns empty array for an empty wishlist page', () => {
		expect(parseAmazonWishlist(EMPTY_FIXTURE)).toEqual([])
	})

	it('returns empty array for malformed input without throwing', () => {
		expect(parseAmazonWishlist(MALFORMED_FIXTURE)).toEqual([])
		expect(parseAmazonWishlist('')).toEqual([])
	})

	it('uses the title attribute over truncated visible text', () => {
		const html = `
			<li data-itemid="abc">
				<a id="itemName_abc" href="/dp/X" title="Full Product Name Here">Full Produ...</a>
			</li>
		`
		const out = parseAmazonWishlist(html)
		expect(out[0].title).toBe('Full Product Name Here')
	})

	it('absolutizes relative URLs against the base', () => {
		const html = `
			<li data-itemid="abc">
				<a id="itemName_abc" href="/dp/X" title="Item">Item</a>
				<img src="/images/r.jpg" />
			</li>
		`
		const out = parseAmazonWishlist(html, 'https://www.amazon.co.uk/hz/wishlist/foo')
		expect(out[0].url).toBe('https://www.amazon.co.uk/dp/X')
		expect(out[0].imageUrl).toBe('https://www.amazon.co.uk/images/r.jpg')
	})

	it('de-dupes rows with the same URL', () => {
		const html = `
			<li data-itemid="a"><a id="itemName_a" href="/dp/X" title="A">A</a></li>
			<li data-itemid="b"><a id="itemName_b" href="/dp/X" title="A again">A again</a></li>
		`
		const out = parseAmazonWishlist(html)
		expect(out).toHaveLength(1)
	})
})
