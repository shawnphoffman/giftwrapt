// Renders stored comment text, styling @mention tokens as highlighted
// names. Plain text passes through untouched (callers own whitespace and
// clamping classes).

import { parseCommentSegments } from '@/lib/comment-mentions'
import { cn } from '@/lib/utils'

type Props = {
	text: string
	// Highlights mentions of this user more strongly ("you were mentioned").
	currentUserId?: string
}

export function CommentBody({ text, currentUserId }: Props) {
	return (
		<>
			{parseCommentSegments(text).map((seg, i) =>
				seg.kind === 'text' ? (
					seg.text
				) : (
					<span
						key={i}
						data-mention-user-id={seg.userId}
						className={cn(
							'font-semibold text-blue-600 dark:text-blue-400',
							seg.userId === currentUserId && 'rounded-sm bg-blue-600/10 px-0.5 dark:bg-blue-400/15'
						)}
					>
						@{seg.name}
					</span>
				)
			)}
		</>
	)
}
