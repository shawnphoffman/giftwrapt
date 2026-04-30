import { lazy, Suspense } from 'react'

import { cn } from '@/lib/utils'

const MarkdownRenderer = lazy(() => import('./markdown-renderer'))

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
				'[&_a]:text-green-700 dark:[&_a]:text-green-400 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_a]:break-words hover:[&_a]:text-green-800 dark:hover:[&_a]:text-green-300',
				className
			)}
		>
			<Suspense fallback={<div className="whitespace-pre-wrap">{content}</div>}>
				<MarkdownRenderer content={content} />
			</Suspense>
		</div>
	)
}
