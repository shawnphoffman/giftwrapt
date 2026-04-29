import Linkify from 'linkify-react'
import Markdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

type Props = {
	content: string
}

const linkifyOptions = {
	defaultProtocol: 'https',
	target: '_blank',
	rel: 'noopener noreferrer nofollow',
	validate: {
		url: (value: string) => /^https?:\/\//.test(value),
	},
} as const

function linkified<T extends keyof React.JSX.IntrinsicElements>(Tag: T): NonNullable<Components[T]> {
	const Wrapped = ({ children, node: _node, ...rest }: any) => (
		<Tag {...rest}>
			<Linkify options={linkifyOptions}>{children}</Linkify>
		</Tag>
	)
	return Wrapped as NonNullable<Components[T]>
}

const components: Components = {
	p: linkified('p'),
	li: linkified('li'),
	blockquote: linkified('blockquote'),
	h1: linkified('h1'),
	h2: linkified('h2'),
	h3: linkified('h3'),
	h4: linkified('h4'),
	h5: linkified('h5'),
	h6: linkified('h6'),
	td: linkified('td'),
	th: linkified('th'),
}

export default function MarkdownRenderer({ content }: Props) {
	return (
		<Markdown components={components} rehypePlugins={[rehypeSanitize]}>
			{content}
		</Markdown>
	)
}
