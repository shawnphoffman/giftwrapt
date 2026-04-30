import { Check, Store } from 'lucide-react'
import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type VendorOption = {
	id: string
	name: string
	count: number
	isKnown: boolean
}

type Props = {
	options: ReadonlyArray<VendorOption>
	selected: ReadonlySet<string>
	onToggle: (id: string) => void
	onClear: () => void
}

function CountBadge({ count }: { count: number }) {
	return <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{count}</span>
}

export function VendorFilterDropdown({ options, selected, onToggle, onClear }: Props) {
	const { knownOptions, unknownOptions, totalCount, label } = useMemo(() => {
		const sortByCountDesc = (a: VendorOption, b: VendorOption) => {
			if (b.count !== a.count) return b.count - a.count
			return a.name.localeCompare(b.name)
		}
		const known = options
			.filter(o => o.isKnown)
			.slice()
			.sort(sortByCountDesc)
		const unknown = options
			.filter(o => !o.isKnown)
			.slice()
			.sort(sortByCountDesc)
		const total = options.reduce((sum, o) => sum + o.count, 0)

		let resolved: string
		if (selected.size === 0) {
			resolved = 'All vendors'
		} else if (selected.size === 1) {
			const [only] = selected
			const hit = options.find(o => o.id === only)
			resolved = hit?.name ?? 'All vendors'
		} else {
			resolved = `${selected.size} vendors`
		}

		return { knownOptions: known, unknownOptions: unknown, totalCount: total, label: resolved }
	}, [options, selected])

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className={cn('h-7 text-xs text-muted-foreground', selected.size > 0 && 'text-foreground')}>
					<Store className="size-3.5" />
					{label}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Vendor</DropdownMenuLabel>
				<DropdownMenuItem onClick={onClear} onSelect={e => e.preventDefault()}>
					<Check className={cn('size-4', selected.size > 0 && 'opacity-0')} />
					All vendors
					<CountBadge count={totalCount} />
				</DropdownMenuItem>
				{knownOptions.length > 0 && <DropdownMenuSeparator />}
				{knownOptions.map(v => (
					<DropdownMenuItem key={v.id} onClick={() => onToggle(v.id)} onSelect={e => e.preventDefault()}>
						<Check className={cn('size-4', !selected.has(v.id) && 'opacity-0')} />
						{v.name}
						<CountBadge count={v.count} />
					</DropdownMenuItem>
				))}
				{unknownOptions.length > 0 && (
					<>
						<DropdownMenuSeparator />
						{unknownOptions.map(v => (
							<DropdownMenuItem key={v.id} onClick={() => onToggle(v.id)} onSelect={e => e.preventDefault()}>
								<Check className={cn('size-4', !selected.has(v.id) && 'opacity-0')} />
								{v.name}
								<CountBadge count={v.count} />
							</DropdownMenuItem>
						))}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
