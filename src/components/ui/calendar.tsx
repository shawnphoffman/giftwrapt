import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'
import { DayPicker } from 'react-day-picker'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
	return (
		<DayPicker
			data-slot="calendar"
			showOutsideDays={showOutsideDays}
			className={cn('p-3', className)}
			classNames={{
				months: 'flex flex-col sm:flex-row gap-4',
				month: 'flex flex-col gap-4',
				month_caption: 'flex justify-center pt-1 relative items-center h-7',
				caption_label: 'text-sm font-medium',
				nav: 'flex items-center gap-1 absolute inset-x-0 top-1 justify-between px-1',
				button_previous: cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'opacity-70 hover:opacity-100'),
				button_next: cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'opacity-70 hover:opacity-100'),
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
