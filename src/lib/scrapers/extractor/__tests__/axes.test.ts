import * as cheerio from 'cheerio/slim'
import { describe, expect, it } from 'vitest'

import { parseAxes } from '../axes'

const FINAL_URL = 'https://www.example.test/products/widget'

function load(html: string) {
	return cheerio.load(html)
}

describe('parseAxes: JSON-LD additionalProperty', () => {
	it('reads additionalProperty[].name directly off the Product node', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'Widget',
					additionalProperty: [
						{ '@type': 'PropertyValue', name: 'Color' },
						{ '@type': 'PropertyValue', name: 'Size' },
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color', 'Size'])
	})

	it('reads additionalProperty off hasVariant[]', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'Widget',
					hasVariant: [
						{
							'@type': 'Product',
							additionalProperty: [
								{ '@type': 'PropertyValue', name: 'Material' },
								{ '@type': 'PropertyValue', name: 'Finish' },
							],
						},
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Material', 'Finish'])
	})

	it('reads additionalProperty off offers[].itemOffered', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					name: 'Widget',
					offers: [
						{
							'@type': 'Offer',
							itemOffered: {
								'@type': 'Product',
								additionalProperty: [{ '@type': 'PropertyValue', name: 'Pattern' }],
							},
						},
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Pattern'])
	})

	it('ignores entries missing a name', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					additionalProperty: [
						{ '@type': 'PropertyValue', value: 'no name here' },
						{ '@type': 'PropertyValue', name: 'Color' },
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
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
					'@type': 'Product',
					additionalProperty: [
						{ '@type': 'PropertyValue', name: 'Color' },
						{ '@type': 'PropertyValue', name: 'Size' },
						{ '@type': 'PropertyValue', name: 'Material' },
						{ '@type': 'PropertyValue', name: 'Style' },
						{ '@type': 'PropertyValue', name: 'Pattern' },
						{ '@type': 'PropertyValue', name: 'Finish' },
						{ '@type': 'PropertyValue', name: 'Length' },
						{ '@type': 'PropertyValue', name: 'Width' },
					],
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
					'@type': 'Product',
					additionalProperty: [
						{ '@type': 'PropertyValue', name: 'Subscription frequency' },
						{ '@type': 'PropertyValue', name: 'Email me about restock' },
						{ '@type': 'PropertyValue', name: 'Color' },
					],
				})}
			</script></head><body></body></html>
		`
		const out = parseAxes(load(html), FINAL_URL)
		expect(out.purchaseVariants).toEqual(['Color'])
	})

	it('dedupes case-insensitively, preserving the first casing seen and Title-Casing the output', () => {
		const html = `
			<html><head><script type="application/ld+json">
				${JSON.stringify({
					'@context': 'https://schema.org',
					'@type': 'Product',
					additionalProperty: [
						{ '@type': 'PropertyValue', name: 'Color' },
						{ '@type': 'PropertyValue', name: 'color' },
						{ '@type': 'PropertyValue', name: 'COLOR' },
					],
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
					'@type': 'Product',
					additionalProperty: [{ '@type': 'PropertyValue', name: 'Color' }],
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
