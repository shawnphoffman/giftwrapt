import { ExternalLink } from 'lucide-react'

import { getDomainFromUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

type Props = {
	url: string | null | undefined
	className?: string
}

export default function UrlBadge({ url, className }: Props) {
	if (!url) return null
	const domain = getDomainFromUrl(url)
	if (!domain) return null

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className={cn(
				'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900 transition-colors max-w-[40%] cursor-pointer',
				className
			)}
		>
			<span className="truncate">{domain}</span>
			<ExternalLink className="size-3 shrink-0" />
		</a>
	)
}
