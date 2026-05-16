import { Bold, Italic, Link as LinkIcon, List } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Props = Omit<React.ComponentProps<typeof Textarea>, 'onChange' | 'value'> & {
	value: string
	onChange: (value: string) => void
	toolbarClassName?: string
}

type Action =
	| { kind: 'wrap'; before: string; after: string; placeholder: string }
	| { kind: 'linePrefix'; prefix: string }
	| { kind: 'link' }

export function MarkdownTextarea({ value, onChange, className, toolbarClassName, id, ...rest }: Props) {
	const ref = React.useRef<HTMLTextAreaElement>(null)

	const applyAction = (action: Action) => {
		const el = ref.current
		if (!el) return
		const start = el.selectionStart
		const end = el.selectionEnd
		const selected = value.slice(start, end)

		let newValue = value
		let newStart = start
		let newEnd = end

		if (action.kind === 'wrap') {
			const text = selected || action.placeholder
			const insert = `${action.before}${text}${action.after}`
			newValue = value.slice(0, start) + insert + value.slice(end)
			if (selected) {
				newStart = start + action.before.length
				newEnd = newStart + text.length
			} else {
				newStart = start + action.before.length
				newEnd = newStart + action.placeholder.length
			}
		} else if (action.kind === 'linePrefix') {
			const lineStart = value.lastIndexOf('\n', start - 1) + 1
			const head = value.slice(0, lineStart)
			const body = value.slice(lineStart, end)
			const tail = value.slice(end)
			const prefixed = body.length === 0 ? action.prefix : body.replace(/^/gm, action.prefix)
			newValue = head + prefixed + tail
			newStart = start + action.prefix.length
			newEnd = end + (prefixed.length - body.length)
		} else {
			const text = selected || 'text'
			const insert = `[${text}](https://)`
			newValue = value.slice(0, start) + insert + value.slice(end)
			newStart = start + insert.length - 1
			newEnd = newStart
		}

		onChange(newValue)
		requestAnimationFrame(() => {
			const node = ref.current
			if (!node) return
			node.focus()
			node.setSelectionRange(newStart, newEnd)
		})
	}

	return (
		<div className="flex flex-col rounded-md border border-input dark:bg-input/30 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
			<div
				className={cn(
					'flex items-center gap-1 flex-wrap px-1 py-1 border-b border-input bg-muted/30 rounded-t-[calc(var(--radius)-2px)]',
					toolbarClassName
				)}
			>
				<ToolbarButton
					label="Bold"
					onClick={() => applyAction({ kind: 'wrap', before: '**', after: '**', placeholder: 'bold' })}
					icon={<Bold className="size-3.5" />}
				/>
				<ToolbarButton
					label="Italic"
					onClick={() => applyAction({ kind: 'wrap', before: '_', after: '_', placeholder: 'italic' })}
					icon={<Italic className="size-3.5" />}
				/>
				<ToolbarButton
					label="List"
					onClick={() => applyAction({ kind: 'linePrefix', prefix: '- ' })}
					icon={<List className="size-3.5" />}
				/>
				<ToolbarButton label="Link" onClick={() => applyAction({ kind: 'link' })} icon={<LinkIcon className="size-3.5" />} />
			</div>
			<Textarea
				{...rest}
				id={id}
				ref={ref}
				className={cn(
					'border-0 rounded-t-none rounded-b-[calc(var(--radius)-2px)] shadow-none focus-visible:ring-0 focus-visible:border-0 bg-transparent dark:bg-transparent',
					className
				)}
				value={value}
				onChange={e => onChange(e.target.value)}
			/>
		</div>
	)
}

function ToolbarButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			className="size-7 text-muted-foreground hover:text-foreground"
			onClick={onClick}
			title={label}
			aria-label={label}
		>
			{icon}
		</Button>
	)
}
