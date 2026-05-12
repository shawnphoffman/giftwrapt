import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { MarkdownNotes } from './markdown-notes'

const meta = {
	title: 'Common/Markdown/MarkdownNotes',
	component: MarkdownNotes,
	parameters: {
		layout: 'padded',
	},
	decorators: [
		Story => (
			<div className="max-w-xl">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof MarkdownNotes>

export default meta
type Story = StoryObj<typeof meta>

export const PlainText: Story = {
	args: { content: 'Any neutral color works, cream, sage, or stone preferred over bright glazes.' },
}

export const WithFormatting: Story = {
	args: {
		content: `**Preferred**: size medium.\n\n*Also fine*: size large if medium is sold out.\n\nSee [the brand page](https://example.com) for sizing.`,
	},
}

export const WithList: Story = {
	args: {
		content: `Top picks:\n\n- Black or navy\n- No logos\n- Natural fabric if possible\n\n> A runner-up option is linked below.`,
	},
}

export const Autolinks: Story = {
	args: {
		content: `Bare URLs become clickable: https://example.com and http://docs.example.org/path?q=1.\n\nMarkdown links still work: [explicit label](https://example.com).`,
	},
}

// =====================================================================
// Security / sanitization
//
// MarkdownRenderer runs react-markdown with rehype-sanitize (GitHub schema)
// and linkify-react constrained to http(s). These stories pin the behavior
// against known XSS vectors so a future plugin swap or config change can't
// silently regress it.
// =====================================================================

export const SanitizesScriptTag: Story = {
	args: {
		content: `Safe text before. <script>alert('xss')</script> Safe text after.`,
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		await expect(canvas.getByText(/Safe text before/i)).toBeInTheDocument()
		await expect(canvasElement.querySelector('script')).toBeNull()
	},
}

export const SanitizesJavascriptLinkHref: Story = {
	args: {
		content: `Click [me](javascript:alert('xss')) to test.`,
	},
	play: async ({ canvasElement }) => {
		for (const a of canvasElement.querySelectorAll('a')) {
			const href = a.getAttribute('href') ?? ''
			await expect(href.toLowerCase().startsWith('javascript:')).toBe(false)
		}
	},
}

export const SanitizesJavascriptImageSrc: Story = {
	args: {
		content: `Image: ![alt](javascript:alert('xss'))`,
	},
	play: async ({ canvasElement }) => {
		for (const img of canvasElement.querySelectorAll('img')) {
			const src = img.getAttribute('src') ?? ''
			await expect(src.toLowerCase().startsWith('javascript:')).toBe(false)
		}
	},
}

export const SanitizesInlineEventHandler: Story = {
	args: {
		content: `Inline event handler: <img src="x" onerror="alert('xss')" /> should be stripped.`,
	},
	play: async ({ canvasElement }) => {
		for (const el of canvasElement.querySelectorAll('*')) {
			for (const attr of Array.from(el.attributes)) {
				await expect(attr.name.toLowerCase().startsWith('on')).toBe(false)
			}
		}
	},
}

export const SanitizesIframe: Story = {
	args: {
		content: `An iframe: <iframe src="https://evil.example.com"></iframe> should not render.`,
	},
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('iframe')).toBeNull()
	},
}

export const SanitizesStyleTag: Story = {
	args: {
		content: `A style tag: <style>body { display: none }</style> should not render.`,
	},
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('style')).toBeNull()
	},
}

export const SanitizesSvgWithOnload: Story = {
	args: {
		content: `SVG with onload: <svg onload="alert('xss')"><circle r="10" /></svg>`,
	},
	play: async ({ canvasElement }) => {
		const svg = canvasElement.querySelector('svg')
		if (svg) {
			await expect(svg.getAttribute('onload')).toBeNull()
		}
	},
}

export const SanitizesRawHtmlAnchorWithJavascript: Story = {
	args: {
		content: `Raw HTML link: <a href="javascript:alert('xss')">click</a>.`,
	},
	play: async ({ canvasElement }) => {
		for (const a of canvasElement.querySelectorAll('a')) {
			const href = a.getAttribute('href') ?? ''
			await expect(href.toLowerCase().startsWith('javascript:')).toBe(false)
		}
	},
}

export const SanitizesDataUriImage: Story = {
	args: {
		content: `Image with data URI: ![bad](data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4=)`,
	},
	play: async ({ canvasElement }) => {
		for (const img of canvasElement.querySelectorAll('img')) {
			const src = img.getAttribute('src') ?? ''
			await expect(src.toLowerCase().startsWith('data:text/html')).toBe(false)
		}
	},
}

export const LinkifyOnlyAcceptsHttp: Story = {
	args: {
		content: `Bare https URL becomes a link: https://example.com. A javascript: bare string javascript:alert('xss') must NOT become an anchor.`,
	},
	play: async ({ canvasElement }) => {
		// linkify-react only autolinks http(s); the javascript: bare string
		// must remain plain text, not turn into an anchor.
		for (const a of canvasElement.querySelectorAll('a')) {
			const href = a.getAttribute('href') ?? ''
			await expect(href.toLowerCase().startsWith('javascript:')).toBe(false)
		}
	},
}
