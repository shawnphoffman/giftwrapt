import UserAvatar from '@/components/common/user-avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type ClaimUser = { id: string; name: string; image?: string | null }
export type ClaimEntry = { user: ClaimUser; quantity: number }

type Props = {
	claims: Array<ClaimEntry>
	className?: string
}

export function ClaimUsers({ claims, className }: Props) {
	if (claims.length === 0) return null

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className={cn('inline-flex items-center', className)}>
						{claims.map((claim, i) => (
							<span key={claim.user.id} className={cn('relative inline-flex', i > 0 && '-ml-2')} style={{ zIndex: claims.length - i }}>
								<UserAvatar name={claim.user.name} image={claim.user.image} size="small" className="ring-2 ring-background" />
							</span>
						))}
					</div>
				</TooltipTrigger>
				<TooltipContent side="top" align="start" className="max-w-64">
					<ul className="flex flex-col gap-1.5">
						{claims.map(claim => (
							<li key={claim.user.id} className="flex items-center gap-2">
								<UserAvatar name={claim.user.name} image={claim.user.image} size="small" />
								<span className="text-xs">{claim.user.name}</span>
								{claim.quantity > 1 && <span className="text-xs opacity-70 tabular-nums">× {claim.quantity}</span>}
							</li>
						))}
					</ul>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
