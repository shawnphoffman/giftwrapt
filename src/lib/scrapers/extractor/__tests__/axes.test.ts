import * as cheerio from 'cheerio/slim'
import { describe, expect, it } from 'vitest'

import { parseAxes } from '../axes'

const FINAL_URL = 'https://www.example.test/products/widget'

function load(html: string) {
	return cheerio.load(html)
}

describe('parseAxes: JSON-LD variant signals', () => {
	it('reads ProductGroup.variesBy[] as the explicit axis list', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					name: 'Widget',
					variesBy: ['Color', 'Size'],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color', 'Size'])
	})

	it('humanizes variesBy entries that are schema.org URLs or fragments', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					variesBy: ['https://schema.org/color', '#size'],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color', 'Size'])
	})

	it('infers an axis from a property whose value varies across hasVariant[]', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					name: 'Widget',
					hasVariant: [
						{
							'@type': 'Product',
							additionalProperty: [
								{ '@type': 'PropertyValue', name: 'Color', value: 'Red' },
								{ '@type': 'PropertyValue', name: 'Material', value: 'Cotton' },
							],
						},
						{
							'@type': 'Product',
							additionalProperty: [
								{ '@type': 'PropertyValue', name: 'Color', value: 'Blue' },
								{ '@type': 'PropertyValue', name: 'Material', value: 'Cotton' },
							],
						},
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		// Color varies (Red/Blue) → axis; Material is constant (Cotton) → spec.
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('infers an axis from a property whose value varies across offers[].itemOffered', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'Widget',
					offers: [
						{
							'@type': 'Offer',
							itemOffered: { '@type': 'Product', additionalProperty: [{ '@type': 'PropertyValue', name: 'Size', value: 'S' }] },
						},
						{
							'@type': 'Offer',
							itemOffered: { '@type': 'Product', additionalProperty: [{ '@type': 'PropertyValue', name: 'Size', value: 'M' }] },
						},
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Size'])
	})

	it('ignores top-level Product.additionalProperty (a spec bag, not buyer choices)', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'Chainsaw',
					additionalProperty: [
						{ '@type': 'PropertyValue', name: 'Bar Length (inches)', value: '20' },
						{ '@type': 'PropertyValue', name: 'Package Quantity', value: '1' },
						{ '@type': 'PropertyValue', name: 'Color', value: 'Green' },
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out).toEqual({})
	})

	it('does not treat a single non-varying variant property as an axis', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					hasVariant: [
						{
							'@type': 'Product',
							additionalProperty: [{ '@type': 'PropertyValue', name: 'Material', value: 'Steel' }],
						},
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out).toEqual({})
	})
})

describe('parseAxes: HTML form heuristics', () => {
	it('derives axis name from <label for=...> when present', () => {
		const html = `
			<html><body>
				<label for="size-picker">Size</label>
				<select id="size-picker" name="something-else"></select>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Size'])
	})

	it('falls back to aria-label on the select when no label[for] match', () => {
		const html = `
			<html><body>
				<select aria-label="Color"></select>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('falls back to name attribute (dashes/underscores → spaces) when no label or aria-label', () => {
		const html = `
			<html><body>
				<select name="product_color"></select>
				<select name="band-size"></select>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Product Color', 'Band Size'])
	})

	it('reads <fieldset><legend> for radio groups', () => {
		const html = `
			<html><body>
				<fieldset>
					<legend>Color</legend>
					<input type="radio" name="c" value="red">
					<input type="radio" name="c" value="blue">
				</fieldset>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('reads role="radiogroup" + aria-label', () => {
		const html = `
			<html><body>
				<div role="radiogroup" aria-label="Material">
					<input type="radio" name="m" value="cotton">
					<input type="radio" name="m" value="wool">
				</div>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Material'])
	})

	it('reads Amazon twister variation blocks via the label text', () => {
		const html = `
			<html><body>
				<div id="twister">
					<div id="variation_color_name">
						<label class="a-form-label">Color:</label>
						<span class="selection">White/Grey/Black</span>
					</div>
					<div id="variation_size_name">
						<label class="a-form-label">Size:</label>
					</div>
				</div>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color', 'Size'])
	})

	it('falls back to the twister id slug when no a-form-label is present', () => {
		const html = `
			<html><body>
				<div id="variation_pattern_name"></div>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Pattern'])
	})

	it('skips the cart-quantity <select name="quantity">', () => {
		const html = `
			<html><body>
				<label for="quantity">Quantity:</label>
				<select id="quantity" name="quantity" aria-label="Quantity"><option>1</option></select>
				<select aria-label="Color"></select>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('strips trailing colons from labels so notes render without doubled punctuation', () => {
		const html = `
			<html><body>
				<label for="color-picker">Color:</label>
				<select id="color-picker"></select>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('reads data-option-name / data-attribute-name / data-swatch-type', () => {
		const html = `
			<html><body>
				<div data-option-name="Material"></div>
				<div data-attribute-name="Pattern"></div>
				<div data-swatch-type="Color"></div>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Material', 'Pattern', 'Color'])
	})
})

describe('parseAxes: filtering and shaping', () => {
	it('returns {} (not an empty array) when no signals are present', () => {
		const html = `<html><body><p>nothing</p></body></html>`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out).toEqual({})
	})

	it('caps the output at 6 axes', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					variesBy: ['Color', 'Size', 'Material', 'Style', 'Pattern', 'Finish', 'Fit', 'Scent'],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toHaveLength(6)
		expect(out.purchaseVariants).toEqual(['Color', 'Size', 'Material', 'Style', 'Pattern', 'Finish'])
	})

	it('filters off-vocabulary names', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					variesBy: ['Subscription frequency', 'Email me about restock', 'Color'],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('filters dimensional / packaging spec words even when they vary across variants', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					hasVariant: [
						{
							'@type': 'Product',
							additionalProperty: [
								{ name: 'Bar Length (inches)', value: '16' },
								{ name: 'Color', value: 'Green' },
							],
						},
						{
							'@type': 'Product',
							additionalProperty: [
								{ name: 'Bar Length (inches)', value: '20' },
								{ name: 'Color', value: 'Orange' },
							],
						},
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		// Both vary, but "Bar Length (inches)" is off-vocabulary; only Color survives.
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('dedupes case-insensitively, preserving the first casing seen and Title-Casing the output', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					variesBy: ['Color', 'color', 'COLOR'],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('unions JSON-LD axes with HTML form axes, deduping across sources', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'ProductGroup',
					variesBy: ['Color'],
				})}
			</script></head><body>
				<select aria-label="Size"></select>
				<select aria-label="color"></select>
			</body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color', 'Size'])
	})
})
