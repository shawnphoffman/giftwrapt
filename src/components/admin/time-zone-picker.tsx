import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DEFAULT_TIME_ZONE } from '@/lib/calendar-day'
import { cn } from '@/lib/utils'

// Every IANA zone the runtime knows, with UTC first. `supportedValuesOf`
// omits UTC on some engines, and the saved value is appended if the
// runtime doesn't list it so it stays selectable.
function zoneOptions(value: string): Array<string> {
	const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
	const out = [DEFAULT_TIME_ZONE, ...zones.filter(z => z !== DEFAULT_TIME_ZONE)]
	if (value && !out.includes(value)) out.push(value)
	return out
}

function browserZone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null
	} catch {
		return null
	}
}

export function TimeZonePicker({ id, value, onChange }: { id?: string; value: string; onChange: (zone: string) => void }) {
	const [open, setOpen] = useState(false)
	const options = useMemo(() => zoneOptions(value), [value])
	const suggested = browserZone()

	const select = (zone: string) => {
		onChange(zone)
		setOpen(false)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-[240px] justify-between font-normal"
				>
					<span className="truncate">{value}</span>
					<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[280px] p-0" align="end">
				<Command>
					<CommandInput placeholder="Search time zones…" />
					<CommandList>
						<CommandEmpty>No time zones match.</CommandEmpty>
						{suggested && suggested !== value && (
							<CommandGroup heading="This browser">
								<CommandItem value={`browser ${suggested}`} onSelect={() => select(suggested)}>
									{suggested}
								</CommandItem>
							</CommandGroup>
						)}
						<CommandGroup heading="All time zones">
							{options.map(zone => (
								<CommandItem key={zone} value={zone} onSelect={() => select(zone)} className="gap-2">
									<CheckIcon className={cn('size-4 shrink-0', zone === value ? 'opacity-100' : 'opacity-0')} />
									<span className="truncate">{zone}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
