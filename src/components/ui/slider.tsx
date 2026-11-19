import { Slider as SliderPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	step = 1,
	thumbProps,
	ticks = false,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
	/** Spread onto every thumb, which is the element with role="slider" (its label and value text go here). */
	thumbProps?: React.ComponentProps<typeof SliderPrimitive.Thumb>
	/** Draw a dot on the track at every step, so a slider with a few discrete stops shows where they are. Horizontal only. */
	ticks?: boolean
}) {
	const _values = React.useMemo(
		() => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
		[value, defaultValue, min, max]
	)

	const tickValues = React.useMemo(() => {
		if (!ticks || props.orientation === 'vertical' || step <= 0) return []
		const count = Math.floor((max - min) / step) + 1
		return Array.from({ length: count }, (_, i) => min + i * step)
	}, [ticks, props.orientation, min, max, step])
	// The filled part of the track: from min to the thumb, or between two thumbs.
	const rangeLow = _values.length > 1 ? Math.min(..._values) : min
	const rangeHigh = Math.max(..._values)

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			step={step}
			className={cn(
				'relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col',
				className
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="relative grow overflow-hidden rounded-full bg-muted data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5"
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className="absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
				/>
			</SliderPrimitive.Track>
			{tickValues.map(tick => {
				const percent = ((tick - min) / (max - min)) * 100
				const filled = tick >= rangeLow && tick <= rangeHigh
				return (
					<span
						key={tick}
						aria-hidden
						data-slot="slider-tick"
						// Radix keeps the thumb inside the track by shifting it half its width
						// (size-4, so 0.5rem) inward at the ends; the tick follows the same
						// curve so it sits exactly under the thumb's center at each stop.
						style={{ left: `calc(${percent}% + ${0.5 - percent / 100}rem)` }}
						className={cn(
							'pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full',
							filled ? 'bg-primary-foreground/90' : 'bg-foreground/50'
						)}
					/>
				)
			})}
			{Array.from({ length: _values.length }, (_, index) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					key={index}
					{...thumbProps}
					className="block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] select-none hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	)
}

export { Slider }
