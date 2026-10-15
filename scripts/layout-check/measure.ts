/**
 * In-page layout measurement for the layout check (plan 30a).
 *
 * `measurePage` runs inside the browser via `page.evaluate`, so it must be
 * self-contained: no imports, no closures over module scope. It records four
 * kinds of finding at the page's current root font size and tags every
 * offending element with `data-layout-check` so the screenshot taken next
 * outlines it.
 *
 * Findings carry a `key` built from the element's DOM path. The check never
 * reloads between font sizes, so the same element has the same key at every
 * size, which is what diff mode compares.
 */

export type FindingKind = 'page-overflow' | 'clipped' | 'overlap' | 'button-variant'

export interface ElementInfo {
	/** DOM path from <body>, with data-slot and nth-of-type where needed. */
	path: string
	tag: string
	slot: string | null
	text: string
	className: string
	rect: { x: number; y: number; w: number; h: number }
}

export interface Finding {
	kind: FindingKind
	/** Stable across font sizes for the same element (or pair). */
	key: string
	/** Groups repeats of the same component (e.g. one per list row). */
	signature: string
	message: string
	elements: Array<ElementInfo>
	detail: Record<string, unknown>
	/** Set when the finding matches an entry in intended.ts. */
	intended?: string
}

export interface MeasureResult {
	rootPx: number
	viewportWidth: number
	scrollWidth: number
	scope: 'page' | 'dialog'
	findings: Array<Finding>
}

/** The `size` variants in src/components/ui/button.tsx, in rem. */
export interface ButtonSizeSpec {
	h: number
	/** Square sizes (`icon*`) also fix the width. */
	w?: number
	/** Horizontal padding with no inline icon. */
	px: number
	/** Padding on the side that has a `data-icon=inline-start|end` child. */
	pxIcon: number
	/** The sizing classes this variant applies itself, so they are not reported as overrides. */
	tokens: Array<string>
}

export const BUTTON_SIZES: Record<string, ButtonSizeSpec> = {
	default: { h: 2.25, px: 0.625, pxIcon: 0.5, tokens: ['h-9', 'px-2.5'] },
	xs: { h: 1.5, px: 0.5, pxIcon: 0.375, tokens: ['h-6', 'px-2', 'text-xs'] },
	sm: { h: 2, px: 0.625, pxIcon: 0.375, tokens: ['h-8', 'px-2.5'] },
	lg: { h: 2.5, px: 0.625, pxIcon: 0.5, tokens: ['h-10', 'px-2.5'] },
	icon: { h: 2.25, w: 2.25, px: 0, pxIcon: 0, tokens: ['size-9'] },
	'icon-xs': { h: 1.5, w: 1.5, px: 0, pxIcon: 0, tokens: ['size-6'] },
	'icon-sm': { h: 2, w: 2, px: 0, pxIcon: 0, tokens: ['size-8'] },
	'icon-lg': { h: 2.5, w: 2.5, px: 0, pxIcon: 0, tokens: ['size-10'] },
}

/** Every Button is semibold (src/styles.css, `.group\/button`). */
export const BUTTON_WEIGHT = '600'

export function measurePage(args: { buttonSizes: Record<string, ButtonSizeSpec>; buttonWeight: string }): MeasureResult {
	const FLAG = 'data-layout-check'
	const CONTROL_SEL = [
		'button',
		'a[href]',
		'input:not([type="hidden"])',
		'select',
		'textarea',
		'[role="button"]',
		'[role="checkbox"]',
		'[role="switch"]',
		'[role="tab"]',
		'[role="radio"]',
		'[role="combobox"]',
		'[data-slot="badge"]',
	].join(', ')
	// Utility classes worth showing next to a Button finding: the ones that
	// size it. The tokens the button's own variant applies are filtered out below.
	const SIZING_TOKEN = /^(?:(?:sm|md|lg|xl|2xl|max-sm|max-md):)?!?-?(?:h|min-h|max-h|w|min-w|size|p|px|py|pl|pr|pt|pb|text|font|leading)-/
	// Base classes every Button carries; each size adds its own `tokens`.
	const BUTTON_BASE_TOKENS = ['text-sm', 'font-medium']

	document.querySelectorAll(`[${FLAG}]`).forEach(el => el.removeAttribute(FLAG))

	const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize)
	const vw = document.documentElement.clientWidth
	const findings: Array<Finding> = []

	// With a modal open, Radix hides the rest of the page from assistive
	// tech and it sits behind the overlay; measure only the open dialogs.
	const openDialogs = Array.from(
		document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
	)
	const scopes: Array<HTMLElement> = openDialogs.length > 0 ? openDialogs : [document.body]

	const all: Array<HTMLElement> = []
	for (const scope of scopes) {
		all.push(scope)
		scope.querySelectorAll('*').forEach(el => {
			if (el instanceof HTMLElement) all.push(el)
		})
	}

	const pathOf = (el: Element): string => {
		const parts: Array<string> = []
		let node: Element | null = el
		while (node && node !== document.body && node !== document.documentElement) {
			let part = node.tagName.toLowerCase()
			const slot = node.getAttribute('data-slot')
			if (slot) part += `[data-slot=${slot}]`
			const parent: Element | null = node.parentElement
			if (parent) {
				const same = Array.from(parent.children).filter(c => c.tagName === node!.tagName)
				if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`
			}
			parts.unshift(part)
			node = parent
		}
		return parts.join(' > ')
	}

	const textOf = (el: Element): string => {
		const label = el.getAttribute('aria-label')
		const text = el.textContent.replace(/\s+/g, ' ').trim()
		const value = label ? `[${label}] ${text}` : text
		return value.length > 80 ? `${value.slice(0, 77)}...` : value
	}

	const infoOf = (el: Element): ElementInfo => {
		const r = el.getBoundingClientRect()
		const cls = typeof el.className === 'string' ? el.className : ''
		return {
			path: pathOf(el),
			tag: el.tagName.toLowerCase(),
			slot: el.getAttribute('data-slot'),
			text: textOf(el),
			className: cls.length > 400 ? `${cls.slice(0, 397)}...` : cls,
			rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
		}
	}

	const signatureOf = (el: Element): string => {
		const cls = typeof el.className === 'string' ? el.className : ''
		return `${el.tagName.toLowerCase()}|${el.getAttribute('data-slot') ?? ''}|${cls}`
	}

	const isShown = (el: HTMLElement): boolean => {
		if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false
		const r = el.getBoundingClientRect()
		return r.width > 2 && r.height > 2
	}

	const isSrOnly = (el: HTMLElement, cs: CSSStyleDeclaration): boolean =>
		el.classList.contains('sr-only') || (cs.position === 'absolute' && cs.clip !== 'auto' && cs.clip !== '')

	const clipsX = (cs: CSSStyleDeclaration) => cs.overflowX !== 'visible'
	const clipsY = (cs: CSSStyleDeclaration) => cs.overflowY !== 'visible'

	/** The element's rect intersected with every clipping ancestor's rect. */
	const visibleRect = (el: HTMLElement): DOMRect | null => {
		const r = el.getBoundingClientRect()
		let left = r.left
		let top = r.top
		let right = r.right
		let bottom = r.bottom
		let node = el.parentElement
		while (node && node !== document.body && node !== document.documentElement) {
			const cs = getComputedStyle(node)
			if (clipsX(cs) || clipsY(cs)) {
				const pr = node.getBoundingClientRect()
				if (clipsX(cs)) {
					left = Math.max(left, pr.left)
					right = Math.min(right, pr.right)
				}
				if (clipsY(cs)) {
					top = Math.max(top, pr.top)
					bottom = Math.min(bottom, pr.bottom)
				}
			}
			if (cs.position === 'fixed') break
			node = node.parentElement
		}
		if (right - left <= 1 || bottom - top <= 1) return null
		return new DOMRect(left, top, right - left, bottom - top)
	}

	/** Nearest fixed or sticky ancestor: elements in different layers only overlap at some scroll offsets. */
	const layerOf = (el: HTMLElement): Element | null => {
		let node: HTMLElement | null = el
		while (node && node !== document.body) {
			const pos = getComputedStyle(node).position
			if (pos === 'fixed' || pos === 'sticky') return node
			node = node.parentElement
		}
		return null
	}

	const flag = (el: Element) => el.setAttribute(FLAG, '')

	// ---------------------------------------------------------------
	// 1. Horizontal page overflow
	// ---------------------------------------------------------------
	const scrollWidth = document.documentElement.scrollWidth
	{
		const offenders: Array<HTMLElement> = []
		for (const el of all) {
			const r = el.getBoundingClientRect()
			if (r.width === 0 || r.height === 0) continue
			if (r.right <= vw + 0.5 && r.left >= -0.5) continue
			let clipped = false
			let node = el.parentElement
			while (node && node !== document.body) {
				const cs = getComputedStyle(node)
				if (cs.position === 'fixed' && node.getBoundingClientRect().right <= vw + 0.5) {
					clipped = true
					break
				}
				if (clipsX(cs)) {
					const pr = node.getBoundingClientRect()
					if (pr.right <= vw + 0.5 && pr.left >= -0.5) {
						clipped = true
						break
					}
				}
				node = node.parentElement
			}
			if (clipped) continue
			if (getComputedStyle(el).position === 'fixed') continue
			if (!el.checkVisibility({ visibilityProperty: true })) continue
			offenders.push(el)
		}
		// Report the innermost offenders: the wrappers around them overflow
		// only because they do.
		const leaves = offenders.filter(el => !offenders.some(o => o !== el && el.contains(o)))
		if (scrollWidth > vw || leaves.length > 0) {
			leaves.forEach(flag)
			findings.push({
				kind: 'page-overflow',
				key: 'page-overflow',
				signature: 'page-overflow',
				message:
					scrollWidth > vw
						? `Page is ${scrollWidth - vw}px wider than the ${vw}px viewport`
						: `${leaves.length} element${leaves.length === 1 ? '' : 's'} past the viewport edge, cut off (page does not scroll)`,
				elements: leaves.slice(0, 8).map(infoOf),
				detail: { scrollWidth, viewportWidth: vw, offenders: leaves.length },
			})
		}
	}

	// ---------------------------------------------------------------
	// 2. Clipped text in fixed-size elements
	// ---------------------------------------------------------------
	// Measured from the text's own line boxes, not scrollWidth/Height:
	// those also count absolutely positioned children and pseudo-elements
	// (the `after:-inset-*` hit areas on Switch and Checkbox), and the
	// glyph overhang of `leading-none` text, none of which is clipping.
	//
	// Text inside a descendant that truncates, line-clamps, scrolls, or is
	// taken out of flow is skipped; it does that on purpose.
	const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'svg', 'BR', 'HR'])
	const managesOwnOverflow = (cs: CSSStyleDeclaration): boolean => {
		const clamp = cs.getPropertyValue('-webkit-line-clamp')
		return (
			cs.textOverflow === 'ellipsis' ||
			(clamp !== '' && clamp !== 'none') ||
			cs.overflowX === 'auto' ||
			cs.overflowX === 'scroll' ||
			cs.overflowY === 'auto' ||
			cs.overflowY === 'scroll'
		)
	}
	const range = document.createRange()
	for (const el of all) {
		if (SKIP_TAGS.has(el.tagName)) continue
		const hasText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '')
		const isControl = el.matches(CONTROL_SEL)
		if (!hasText && !isControl) continue
		const cs = getComputedStyle(el)
		if (cs.display === 'inline' || cs.display === 'contents' || cs.display === 'none') continue
		if (isSrOnly(el, cs) || managesOwnOverflow(cs)) continue
		if (!isShown(el)) continue

		const box = el.getBoundingClientRect()
		const left = box.left + el.clientLeft
		const top = box.top + el.clientTop
		const right = left + el.clientWidth
		const bottom = top + el.clientHeight

		let overX = 0
		let overY = 0
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if ((node.textContent ?? '').trim() === '') continue
			let skip = false
			for (let p = node.parentElement; p && p !== el; p = p.parentElement) {
				const pcs = getComputedStyle(p)
				if (managesOwnOverflow(pcs) || pcs.position === 'absolute' || pcs.position === 'fixed' || isSrOnly(p, pcs)) {
					skip = true
					break
				}
			}
			if (skip) continue
			const fontPx = parseFloat(getComputedStyle(node.parentElement!).fontSize)
			range.selectNodeContents(node)
			for (const r of Array.from(range.getClientRects())) {
				if (r.width === 0) continue
				overX = Math.max(overX, r.right - right, left - r.left)
				// A line box's height is the font's content area, about 1.2em,
				// so `leading-none` text pokes out ~0.1em each side by design.
				// Count vertical overflow only past a third of an em.
				const y = Math.max(r.bottom - bottom, top - r.top)
				if (y > fontPx / 3) overY = Math.max(overY, y)
			}
		}
		const xBad = overX > 1
		const yBad = overY > 0
		if (!xBad && !yBad) continue

		flag(el)
		const round = (n: number) => Math.round(n * 10) / 10
		const axes = [xBad ? `${round(overX)}px wide` : null, yBad ? `${round(overY)}px tall` : null].filter(Boolean).join(', ')
		findings.push({
			kind: 'clipped',
			key: `clipped|${pathOf(el)}`,
			signature: `clipped|${signatureOf(el)}`,
			message: `Text overflows its box by ${axes}${(xBad && clipsX(cs)) || (yBad && clipsY(cs)) ? ' and is cut off' : ''}`,
			elements: [infoOf(el)],
			detail: {
				overflowX: xBad ? round(overX) : 0,
				overflowY: yBad ? round(overY) : 0,
				clientWidth: el.clientWidth,
				clientHeight: el.clientHeight,
				cssOverflow: `${cs.overflowX} ${cs.overflowY}`,
				whiteSpace: cs.whiteSpace,
			},
		})
	}
	range.detach()

	// ---------------------------------------------------------------
	// 3. Overlapping controls
	// ---------------------------------------------------------------
	{
		const controls: Array<{ el: HTMLElement; rect: DOMRect; layer: Element | null }> = []
		for (const el of all) {
			if (!el.matches(CONTROL_SEL)) continue
			const cs = getComputedStyle(el)
			if (isSrOnly(el, cs)) continue
			if (!isShown(el)) continue
			const rect = visibleRect(el)
			if (!rect) continue
			controls.push({ el, rect, layer: layerOf(el) })
		}
		const seen = new Set<string>()
		for (let i = 0; i < controls.length; i++) {
			for (let j = i + 1; j < controls.length; j++) {
				const a = controls[i]
				const b = controls[j]
				if (a.layer !== b.layer) continue
				if (a.el.contains(b.el) || b.el.contains(a.el)) continue
				const ix = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
				const iy = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
				if (ix <= 1 || iy <= 1) continue
				// One fully inside the other is a deliberate stack (a clear
				// button in an input, a stretched card link), not a collision.
				const inside = (p: DOMRect, q: DOMRect) =>
					p.left >= q.left - 1 && p.right <= q.right + 1 && p.top >= q.top - 1 && p.bottom <= q.bottom + 1
				if (inside(a.rect, b.rect) || inside(b.rect, a.rect)) continue
				const [pa, pb] = [pathOf(a.el), pathOf(b.el)].sort()
				const key = `overlap|${pa}|${pb}`
				if (seen.has(key)) continue
				seen.add(key)
				flag(a.el)
				flag(b.el)
				findings.push({
					kind: 'overlap',
					key,
					signature: `overlap|${[signatureOf(a.el), signatureOf(b.el)].sort().join('||')}`,
					message: `Controls overlap by ${Math.round(ix)}x${Math.round(iy)}px`,
					elements: [infoOf(a.el), infoOf(b.el)],
					detail: { overlapWidth: Math.round(ix), overlapHeight: Math.round(iy) },
				})
			}
		}
	}

	// ---------------------------------------------------------------
	// 4. Buttons that differ from their data-size variant
	// ---------------------------------------------------------------
	for (const el of all) {
		if (!el.classList.contains('group/button')) continue
		const cs = getComputedStyle(el)
		if (cs.display === 'none' || !isShown(el)) continue
		const declared = el.getAttribute('data-size')
		const size = declared ?? 'default'
		const spec = args.buttonSizes[size] as ButtonSizeSpec | undefined
		if (!spec) continue

		const r = el.getBoundingClientRect()
		const iconStart = el.querySelector('[data-icon="inline-start"]') !== null
		const iconEnd = el.querySelector('[data-icon="inline-end"]') !== null
		const expect = {
			height: spec.h * rootPx,
			width: spec.w != null ? spec.w * rootPx : null,
			paddingLeft: (iconStart ? spec.pxIcon : spec.px) * rootPx,
			paddingRight: (iconEnd ? spec.pxIcon : spec.px) * rootPx,
		}
		const actual = {
			height: r.height,
			width: r.width,
			paddingLeft: parseFloat(cs.paddingLeft),
			paddingRight: parseFloat(cs.paddingRight),
			fontWeight: cs.fontWeight,
		}
		const diffs: Array<string> = []
		const off = (a: number, e: number) => Math.abs(a - e) > 0.5
		if (off(actual.height, expect.height)) diffs.push('height')
		if (expect.width != null && off(actual.width, expect.width)) diffs.push('width')
		if (off(actual.paddingLeft, expect.paddingLeft) || off(actual.paddingRight, expect.paddingRight)) diffs.push('padding')
		if (actual.fontWeight !== args.buttonWeight) diffs.push('weight')
		if (diffs.length === 0) continue

		const cls = typeof el.className === 'string' ? el.className : ''
		const own = new Set([...BUTTON_BASE_TOKENS, ...spec.tokens])
		const overrides = cls.split(/\s+/).filter(t => SIZING_TOKEN.test(t) && !own.has(t))
		const px = (n: number) => Math.round(n * 10) / 10
		const parts: Array<string> = []
		if (diffs.includes('height')) parts.push(`height ${px(actual.height)}px (want ${px(expect.height)})`)
		if (diffs.includes('width')) parts.push(`width ${px(actual.width)}px (want ${px(expect.width!)})`)
		if (diffs.includes('padding'))
			parts.push(
				`padding ${px(actual.paddingLeft)}/${px(actual.paddingRight)}px (want ${px(expect.paddingLeft)}/${px(expect.paddingRight)})`
			)
		if (diffs.includes('weight')) parts.push(`weight ${actual.fontWeight} (want ${args.buttonWeight})`)

		flag(el)
		findings.push({
			kind: 'button-variant',
			key: `button-variant|${pathOf(el)}|${diffs.join(',')}`,
			signature: `button-variant|${size}|${el.getAttribute('data-variant') ?? ''}|${diffs.join(',')}|${overrides.join(' ')}`,
			message: `Button size=${size}${declared ? '' : ' (no data-size)'}: ${parts.join('; ')}`,
			elements: [infoOf(el)],
			detail: {
				size,
				variant: el.getAttribute('data-variant'),
				differs: diffs,
				overrides,
				expected: expect,
				actual,
			},
		})
	}

	return { rootPx, viewportWidth: vw, scrollWidth, scope: openDialogs.length > 0 ? 'dialog' : 'page', findings }
}
