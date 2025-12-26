import { ExternalLink } from 'lucide-react'

import PriorityIcon from '@/components/common/priority-icon'
import type { Item } from '@/db/schema/items'
import { getDomainFromUrl } from '@/lib/urls'

import { Badge } from '../ui/badge'

type Props = {
	item: Item
}

export default function ItemRow({ item }: Props) {
	return (
		<div className="flex flex-col w-full gap-2 p-3 hover:bg-muted" id={`item-${item.id}`}>
			<div className="flex flex-col w-full gap-2">
				<div className="flex flex-row items-stretch gap-x-3.5">
					<div className="flex flex-col justify-center flex-1 gap-0.5 overflow-hidden">
						<div className="flex flex-row items-start flex-1 gap-1 overflow-hidden font-medium">
							<PriorityIcon priority={item.priority} />
							{item.url ? (
								<>
									<a
										href={item.url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex flex-col gap-0.5 overflow-hidden hover:underline"
									>
										{item.title}
									</a>
									<ExternalLink />
									<Badge variant="outline" className="flex text-xs text-muted-foreground">
										{getDomainFromUrl(item.url)}
									</Badge>
								</>
							) : (
								<div>{item.title}</div>
							)}
							{item.price && <span className="px-2 text-xs border rounded whitespace-nowrap bg-card w-fit">{item.price}</span>}
							{item.quantity && item.quantity > 1 && (
								<span className="px-2 text-xs border rounded whitespace-nowrap bg-card w-fit">Qty: {item.quantity}</span>
							)}
						</div>
						{item.notes && <div className="text-sm text-foreground/75">{item.notes}</div>}
					</div>
					{item.imageUrl && (
						<div className="flex items-center justify-center">
							<img src={item.imageUrl} alt={item.title} className="object-contain w-16 max-h-16 xs:w-24 xs:max-h-24" />
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
