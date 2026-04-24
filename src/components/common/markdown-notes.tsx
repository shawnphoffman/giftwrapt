import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

import { cn } from '@/lib/utils'

type Props = {
	content: string
	className?: string
}

export function MarkdownNotes({ content, className }: Props) {
	return (
		<div
			className={cn(
				'prose prose-sm dark:prose-invert max-w-none',
				'[&_h1]:text-[1.8rem] [&_h1]:font-bold',
				'[&_h2]:text-[1.5em] [&_h2]:font-bold',
				'[&_h3]:text-[1.5rem] [&_h3]:font-bold',
				className
			)}
		>
			<Markdown rehypePlugins={[rehypeSanitize]}>{content}</Markdown>
		</div>
	)
}
