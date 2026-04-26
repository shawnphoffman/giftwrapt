import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

type Props = {
	content: string
}

export default function MarkdownRenderer({ content }: Props) {
	return <Markdown rehypePlugins={[rehypeSanitize]}>{content}</Markdown>
}
