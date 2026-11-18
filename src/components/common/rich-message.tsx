import { Fragment, type ReactNode } from 'react'

import type { MessagePart } from '@/paraglide/runtime.js'

// Shared by every area (plan 36d). Renders a catalog message that carries markup, e.g.
// "Mark any list as {#strong}primary{/strong} from its action menu." or
// "Open the {#icon/} menu". The sentence stays whole in the catalog so a
// translation can move the marked part; the caller says what each tag
// renders as. Pass the message's `.parts()`:
//
//   <RichMessage parts={m.lists_my_primary_hint.parts()} tags={{ strong: c => <strong>{c}</strong> }} />
//
// A tag with no renderer falls back to its plain children.
type TagRenderer = (children: ReactNode) => ReactNode

export function RichMessage({ parts, tags }: { parts: ReadonlyArray<MessagePart>; tags: Record<string, TagRenderer | undefined> }) {
	const stack: Array<Array<ReactNode>> = [[]]
	parts.forEach((part, index) => {
		const current = stack[stack.length - 1]
		if (part.type === 'text') {
			current.push(part.value)
		} else if (part.type === 'markup-start') {
			stack.push([])
		} else if (part.type === 'markup-end') {
			if (stack.length < 2) return
			const children = stack.pop()
			const render = tags[part.name]
			stack[stack.length - 1].push(<Fragment key={index}>{render ? render(children) : children}</Fragment>)
		} else {
			const render = tags[part.name]
			if (render) current.push(<Fragment key={index}>{render(null)}</Fragment>)
		}
	})
	return <>{stack[0]}</>
}
