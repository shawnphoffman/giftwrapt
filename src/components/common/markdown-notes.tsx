import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

import { cn } from '@/lib/utils'

type Props = {
	content: string
	className?: string
}

export function MarkdownNotes({ content, className }: Props) {
	return (
		<div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
			<Markdown rehypePlugins={[rehypeSanitize]}>{content}</Markdown>
		</div>
	)
}
