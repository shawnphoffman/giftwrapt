import { CalendarIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Auto-formatting masked date input + calendar popover. Replaces the
// native `<input type="date">` for cases where users need to type
// historical dates (anniversaries, birthdays) without fighting the
// browser's controlled-input year segment.
//
// The text input only accepts digits and inserts hyphens at fixed
// positions so the on-screen value is always either a partial or
// complete `YYYY-MM-DD` string. The calendar popover lets clickers
// pick a date and uses react-day-picker's year dropdown so reaching
// a 20-year-old anniversary is one select away.
//
// Value contract:
//   - `value` and `onChange` use a complete `YYYY-MM-DD` string or
//     `undefined`. Partial typed values stay local to the component
//     and only flow upward once the user finishes a valid date.
//   - The component never emits an invalid partial date; this matches
//     the Zod schema downstream (`z.iso.date()`).

export type DatePickerProps = {
	value: string | undefined
	onChange: (next: string | undefined) => void
	onBlur?: () => void
	id?: string
	placeholder?: string
	disabled?: boolean
	className?: string
	/// Earliest year selectable via the calendar dropdown. Defaults to 1900.
	fromYear?: number
	/// Latest year selectable. Defaults to one year in the future so
	/// upcoming-anniversary entries (booked weddings, etc.) work.
	toYear?: number
}

// Inserts hyphens at positions 4 and 7 ("YYYY-MM-DD") while ignoring
// anything that isn't a digit. Keeps the typed value capped at the
// 10-char ISO format length.
function formatPartial(raw: string): string {
	const digits = raw.replace(/\D/g, '').slice(0, 8)
	if (digits.length <= 4) return digits
	if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
	return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

// Returns the canonical YYYY-MM-DD string when `raw` parses cleanly,
// else null. The schema downstream validates again on submit; this
// just decides whether to push the value up to the form.
function parseIsoDate(raw: string): { iso: string; date: Date } | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
	const [y, m, d] = raw.split('-').map(Number)
	const date = new Date(Date.UTC(y, m - 1, d))
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
	return { iso: raw, date }
}

function isoFromDate(date: Date): string {
	const y = date.getUTCFullYear().toString().padStart(4, '0')
	const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
	const d = date.getUTCDate().toString().padStart(2, '0')
	return `${y}-${m}-${d}`
}

export function DatePicker({
	value,
	onChange,
	onBlur,
	id,
	placeholder = 'YYYY-MM-DD',
	disabled,
	className,
	fromYear = 1900,
	toYear = new Date().getUTCFullYear() + 1,
}: DatePickerProps) {
	// Local buffer for partial input so each keystroke survives a
	// controlled-value re-render. Synced back from `value` whenever the
	// parent pushes an externally-set complete date.
	const [draft, setDraft] = React.useState<string>(value ?? '')
	const [open, setOpen] = React.useState(false)

	React.useEffect(() => {
		setDraft(value ?? '')
	}, [value])

	const handleInputChange = (raw: string) => {
		const formatted = formatPartial(raw)
		setDraft(formatted)
		// Only push complete, valid dates up. Partial values stay local
		// until the user finishes typing or the input blurs.
		if (formatted === '') {
			onChange(undefined)
			return
		}
		const parsed = parseIsoDate(formatted)
		if (parsed) onChange(parsed.iso)
	}

	const handleInputBlur = () => {
		// If the draft is incomplete, surface it to the form state so
		// validation (Zod) can mark the field as invalid. Empty stays
		// undefined.
		if (draft === '') {
			onChange(undefined)
		} else if (!parseIsoDate(draft)) {
			onChange(draft)
		}
		onBlur?.()
	}

	const selectedDate = value ? (parseIsoDate(value)?.date ?? undefined) : undefined

	const startMonth = new Date(Date.UTC(fromYear, 0, 1))
	const endMonth = new Date(Date.UTC(toYear, 11, 1))

	return (
		<div className={cn('flex items-center gap-1.5', className)}>
			<Input
				id={id}
				type="text"
				inputMode="numeric"
				placeholder={placeholder}
				autoComplete="off"
				maxLength={10}
				value={draft}
				onChange={e => handleInputChange(e.target.value)}
				onBlur={handleInputBlur}
				disabled={disabled}
				className="flex-1"
			/>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button type="button" variant="outline" size="icon" disabled={disabled} aria-label="Open calendar" className="shrink-0">
						<CalendarIcon className="size-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={selectedDate}
						defaultMonth={selectedDate ?? new Date()}
						onSelect={day => {
							if (!day) return
							const iso = isoFromDate(day)
							setDraft(iso)
							onChange(iso)
							setOpen(false)
						}}
						captionLayout="dropdown"
						startMonth={startMonth}
						endMonth={endMonth}
					/>
				</PopoverContent>
			</Popover>
		</div>
	)
}
