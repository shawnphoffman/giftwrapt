import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'
import { DayPicker } from 'react-day-picker'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, captionLayout, ...props }: CalendarProps) {
	const isDropdown = captionLayout === 'dropdown' || captionLayout === 'dropdown-months' || captionLayout === 'dropdown-years'
	return (
		<DayPicker
			data-slot="calendar"
			showOutsideDays={showOutsideDays}
			captionLayout={captionLayout}
			className={cn('p-3', className)}
			classNames={{
				months: 'flex flex-col sm:flex-row gap-4',
				month: 'flex flex-col gap-4',
				// h-9 fits dropdowns; the chevron-only variant still centers fine.
				month_caption: cn('flex justify-center pt-1 relative items-center', isDropdown ? 'h-9' : 'h-7'),
				// In dropdown mode this same class is reused inside each
				// dropdown_root as the visible label span — never hide it.
				caption_label: 'text-sm font-medium inline-flex items-center gap-1',
				// Dropdown mode hides the absolute prev/next chevrons because
				// the dropdowns themselves are the navigation, and the chevrons
				// would overlap the wider dropdown buttons in a narrow popover.
				nav: cn(
					'flex items-center gap-1 absolute inset-x-0 top-1 justify-between px-1 pointer-events-none [&>button]:pointer-events-auto',
					isDropdown && 'hidden'
				),
				button_previous: cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'opacity-70 hover:opacity-100'),
				button_next: cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'opacity-70 hover:opacity-100'),
				// Dropdown caption: a flex row of two native <select>s rendered
				// inside an invisible-overlay pattern so the styled label sits
				// behind a transparent click-through select.
				dropdowns: 'flex items-center justify-center gap-1.5 text-sm font-medium',
				dropdown_root:
					'relative inline-flex h-8 items-center rounded-md border border-input bg-background px-2 shadow-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
				dropdown: 'absolute inset-0 cursor-pointer opacity-0',
				months_dropdown: 'pr-1',
				years_dropdown: 'pr-1',
				month_grid: 'w-full border-collapse',
				weekdays: 'flex',
				weekday: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
				week: 'flex w-full mt-1',
				day: 'h-8 w-8 text-center text-sm p-0 relative focus-within:relative focus-within:z-20 [&:has([aria-selected].range_end)]:rounded-r-md [&:has([aria-selected].range_start)]:rounded-l-md [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md',
				day_button: cn(
					buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
					'size-8 p-0 font-normal aria-selected:opacity-100 aria-selected:bg-primary aria-selected:text-primary-foreground hover:bg-accent hover:text-accent-foreground'
				),
				range_start: 'range_start aria-selected:bg-primary aria-selected:text-primary-foreground rounded-l-md',
				range_end: 'range_end aria-selected:bg-primary aria-selected:text-primary-foreground rounded-r-md',
				range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground rounded-none',
				selected: 'aria-selected:bg-primary aria-selected:text-primary-foreground',
				today: 'bg-accent text-accent-foreground rounded-md',
				outside: 'day-outside text-muted-foreground aria-selected:text-muted-foreground',
				disabled: 'text-muted-foreground opacity-50',
				hidden: 'invisible',
				...classNames,
			}}
			components={{
				Chevron: ({ orientation, ...rest }) => {
					if (orientation === 'left') return <ChevronLeft className="size-4" {...rest} />
					return <ChevronRight className="size-4" {...rest} />
				},
			}}
			{...props}
		/>
	)
}

export { Calendar }
