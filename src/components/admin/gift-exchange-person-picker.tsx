import { ChevronsUpDownIcon, Users } from 'lucide-react'
import { useState } from 'react'

import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { m } from '@/paraglide/messages.js'

export type PickablePerson = { id: string; name: string | null; email: string; image: string | null }

/**
 * Add Person (a typeahead, the Popover + Command pattern of the time zone
 * picker) and Add Everybody. `people` is everyone who can still be added:
 * not banned and not already in.
 */
export function GiftExchangePersonPicker({
	people,
	onPick,
	onPickEverybody,
	disabled,
}: {
	people: ReadonlyArray<PickablePerson>
	onPick: (userId: string) => void
	onPickEverybody: () => void
	disabled?: boolean
}) {
	const [open, setOpen] = useState(false)
	const none = people.length === 0

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						disabled={disabled || none}
						className="min-w-0 flex-1 justify-between font-normal sm:w-48 sm:flex-none"
					>
						<span className="truncate">{m.admin_exchanges_add_person()}</span>
						<ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-72 p-0" align="start">
					<Command>
						<CommandInput placeholder={m.admin_exchanges_person_search_placeholder()} />
						<CommandList>
							<CommandEmpty>{m.admin_exchanges_person_search_empty()}</CommandEmpty>
							<CommandGroup>
								{people.map(person => {
									const label = person.name || person.email
									return (
										<CommandItem
											key={person.id}
											value={`${label} ${person.email} ${person.id}`}
											onSelect={() => {
												onPick(person.id)
												setOpen(false)
											}}
											className="gap-2"
										>
											<UserAvatar name={label} image={person.image} size="small" />
											<span className="truncate">{label}</span>
										</CommandItem>
									)
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
			<Button type="button" variant="outline" onClick={onPickEverybody} disabled={disabled || none}>
				<Users className="size-4" />
				{m.admin_exchanges_add_everybody()}
			</Button>
		</div>
	)
}
