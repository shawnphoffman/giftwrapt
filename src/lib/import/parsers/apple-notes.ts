// Pure parser for the "import from Apple Notes" source.
//
// Apple Notes content arrives as either plain text (clipboard fallback)
// or HTML (rich-text clipboard, the typical paste). We branch on a
// cheap heuristic - "<" in the first 100 chars" - so callers don't have
// to know which clipboard slot they pulled from.
//
// Plain text path:
//   - Split on newlines.
//   - Strip the bullet glyphs Apple Notes uses at line starts: U+2022 (•),
//     U+25CF (●), U+25CB (○), U+2192 (→), U+2013/U+2014 (en/em dash), and
//     ASCII "*", "-".
//   - Trim, drop empties.
//   - Extract any http/https URL from the line. The URL becomes
//     `draft.url`; the rest of the line (URL stripped) becomes
//     `draft.title`. A line that is *only* a URL leaves title null so
//     the background scrape queue fills it in.
//
// HTML path:
//   - Walk <li>, <p>, and bullet-bearing leaf nodes via cheerio.
//   - Pull <a href> URLs into `url`; pull text content (with anchors
//     inlined) into `title`. If the leaf has no anchor but the text
//     contains a URL, run the same URL-extraction step as the plain
//     path so we still split on it.
//   - Skip empty leaves.
//
// Both paths produce the same `ItemDraft[]` shape that the preview
// table consumes.

import * as cheerio from 'cheerio/slim'

import type { ItemDraft } from '@/api/import'

const URL_REGEX = /\bhttps?:\/\/[^\s<>"')]+/i

const BULLET_PREFIXES = ['•', '●', '○', '◦', '▪', '▫', '→', '–', '—', '*', '-']

function stripBulletPrefix(line: string): string {
	let s = line
	// Apple Notes occasionally produces nested bullets ("• • Item"). Strip
	// repeatedly until the leading char is no longer a bullet glyph.
	let changed = true
	while (changed) {
		changed = false
		const trimmed = s.trimStart()
		for (const b of BULLET_PREFIXES) {
			if (trimmed.startsWith(b)) {
				s = trimmed.slice(b.length)
				changed = true
				break
			}
		}
		if (!changed) s = trimmed
	}
	return s
}

function extractUrlAndTitle(rawLine: string): ItemDraft | null {
	const line = rawLine.trim()
	if (line.length === 0) return null
	const match = line.match(URL_REGEX)
	if (!match) {
		return {
			title: line,
			url: null,
			price: null,
			currency: null,
			imageUrl: null,
			notes: null,
		}
	}
	const url = match[0]
	const remainder = (line.slice(0, match.index ?? 0) + line.slice((match.index ?? 0) + url.length))
		.replace(/\s+/g, ' ')
		.trim()
		// Strip trailing/leading punctuation common around inline links.
		.replace(/^[-:|–—,]+\s*/, '')
		.replace(/\s*[-:|–—,]+$/, '')
	return {
		title: remainder.length > 0 ? remainder : null,
		url,
		price: null,
		currency: null,
		imageUrl: null,
		notes: null,
	}
}

function parsePlainText(input: string): Array<ItemDraft> {
	const out: Array<ItemDraft> = []
	for (const rawLine of input.split(/\r?\n/)) {
		const stripped = stripBulletPrefix(rawLine)
		const draft = extractUrlAndTitle(stripped)
		if (draft) out.push(draft)
	}
	return out
}

function parseHtml(input: string): Array<ItemDraft> {
	const $ = cheerio.load(input)
	// Apple Notes HTML exports tend to wrap each row in <li> or <p>. We
	// query the union and process each leaf in document order.
	const leaves = $('li, p, div').filter((_, el) => {
		// Only take leaves that don't contain another <li>/<p>/<div>; if
		// they do, we'd duplicate content because the inner element will
		// appear in this same selection.
		const $el = $(el)
		return $el.find('li, p, div').length === 0
	})

	const out: Array<ItemDraft> = []
	leaves.each((_, el) => {
		const $el = $(el)
		const anchor = $el.find('a[href^="http"]').first()
		const href = anchor.attr('href')?.trim() ?? null

		// Build the title from the leaf's text minus the anchor text we
		// already captured into `url`. If the anchor IS the only content
		// the title is null and the queue fills it in.
		const fullText = $el.text().replace(/\s+/g, ' ').trim()
		const anchorText = anchor.text().replace(/\s+/g, ' ').trim()
		let title: string | null = fullText
		if (href) {
			if (anchorText.length > 0 && fullText === anchorText) {
				title = null
			} else if (anchorText.length > 0) {
				title = fullText.replace(anchorText, '').replace(/\s+/g, ' ').trim()
				if (title.length === 0) title = null
			}
		}
		title = title ? stripBulletPrefix(title).trim() : null
		title = title?.replace(/^[-:|–—,]+\s*/, '').replace(/\s*[-:|–—,]+$/, '') ?? null
		if (title?.length === 0) title = null

		// If we didn't find an <a> but the text itself contains a URL,
		// fall through to the plain-text extraction so we still split.
		if (!href && title) {
			const fallback = extractUrlAndTitle(title)
			if (fallback) {
				out.push(fallback)
				return
			}
		}

		if (!title && !href) return
		out.push({
			title,
			url: href,
			price: null,
			currency: null,
			imageUrl: null,
			notes: null,
		})
	})

	return out
}

export function parseAppleNotes(input: string): Array<ItemDraft> {
	if (!input) return []
	const head = input.slice(0, 100)
	const looksHtml = head.includes('<')
	return looksHtml ? parseHtml(input) : parsePlainText(input)
}
