// Comment composer with an @mention typeahead. Typing `@` (at the start
// or after whitespace) opens a filtered list of `candidates`; picking one
// inserts `@Name ` and records the pick in `mentions`. The parent turns
// the draft into stored tokens with `encodeMentionDraft` on submit.
//
// The list is a portalled Radix popover anchored to the textarea so it
// isn't clipped by the comment panel's collapse animation (overflow-hidden).
// Focus never leaves the textarea: arrow keys, Enter/Tab and Escape are
// handled in its onKeyDown.

import { type ComponentProps, type KeyboardEvent, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

import UserAvatar from '@/components/common/user-avatar'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { findActiveMentionQuery, type MentionRef, sanitizeMentionName } from '@/lib/comment-mentions'
import { cn } from '@/lib/utils'

export type MentionCandidate = {
	id: string
	name: string | null
	email: string
	image: string | null
}

const MAX_RESULTS = 8

function displayName(c: MentionCandidate): string {
	return sanitizeMentionName(c.name || c.email)
}

// Case-insensitive. A match at the start of the name or of any word in it
// ranks above a match anywhere else (name or email).
export function filterMentionCandidates(candidates: ReadonlyArray<MentionCandidate>, query: string): Array<MentionCandidate> {
	const q = query.trim().toLowerCase()
	if (!q) return candidates.slice(0, MAX_RESULTS)
	const prefix: Array<MentionCandidate> = []
	const rest: Array<MentionCandidate> = []
	for (const c of candidates) {
		const name = displayName(c).toLowerCase()
		if (name.startsWith(q) || name.split(/\s+/).some(w => w.startsWith(q))) prefix.push(c)
		else if (name.includes(q) || c.email.toLowerCase().includes(q)) rest.push(c)
	}
	return [...prefix, ...rest].slice(0, MAX_RESULTS)
}

type Props = Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> & {
	value: string
	onValueChange: (value: string) => void
	mentions: ReadonlyArray<MentionRef>
	onMentionsChange: (mentions: Array<MentionRef>) => void
	// Undefined while loading; the list shows a loading row.
	candidates: ReadonlyArray<MentionCandidate> | undefined
	// Fired whenever a mention query opens, so the parent can lazily fetch
	// candidates on first use.
	onMentionIntent?: () => void
}

export function MentionTextarea({
	value,
	onValueChange,
	mentions,
	onMentionsChange,
	candidates,
	onMentionIntent,
	onKeyDown,
	className,
	...textareaProps
}: Props) {
	const ref = useRef<HTMLTextAreaElement>(null)
	const listId = useId()
	const [active, setActive] = useState<{ start: number; query: string } | null>(null)
	const [highlight, setHighlight] = useState(0)
	// Escape hides the list until the query changes.
	const [dismissedQuery, setDismissedQuery] = useState<string | null>(null)
	// Caret to place after a pick, once the picked value has rendered.
	// Setting it before then is undone when React writes the new value
	// (which moves the caret to the end). A layout effect runs in the same
	// commit, before the next keystroke; the old requestAnimationFrame could
	// fire after a fast typist had already typed a few characters and yank
	// the caret back to the end of the mention.
	const pendingCaret = useRef<{ value: string; pos: number } | null>(null)

	useLayoutEffect(() => {
		const el = ref.current
		const pending = pendingCaret.current
		// Wait for the render that carries the picked value; the parent may
		// commit it after this component's own re-render.
		if (!el || !pending || el.value !== pending.value) return
		pendingCaret.current = null
		el.focus()
		el.setSelectionRange(pending.pos, pending.pos)
	})

	const matches = useMemo(() => (active && candidates ? filterMentionCandidates(candidates, active.query) : []), [active, candidates])
	const open = active !== null && dismissedQuery !== `${active.start}:${active.query}` && (candidates === undefined || matches.length > 0)
	const safeHighlight = Math.min(highlight, Math.max(0, matches.length - 1))

	const syncQuery = (el: HTMLTextAreaElement) => {
		let next = el.selectionStart === el.selectionEnd ? findActiveMentionQuery(el.value, el.selectionStart) : null
		// An `@` that starts an already-picked mention isn't a new query;
		// without this the list reopens right after a pick (the caret sits
		// after `@Name `) and when editing a comment that has mentions.
		if (next && mentions.some(m => next!.query === m.name || next!.query.startsWith(`${m.name} `))) next = null
		if (active?.start !== next?.start || active?.query !== next?.query) {
			setActive(next)
			setHighlight(0)
		}
		if (next) onMentionIntent?.()
	}

	const pick = (c: MentionCandidate) => {
		const el = ref.current
		if (!el || !active) return
		const name = displayName(c)
		const caret = el.selectionStart
		const inserted = `@${name} `
		const next = value.slice(0, active.start) + inserted + value.slice(caret)
		onValueChange(next)
		if (!mentions.some(m => m.userId === c.id)) onMentionsChange([...mentions, { userId: c.id, name }])
		setActive(null)
		pendingCaret.current = { value: next, pos: active.start + inserted.length }
	}

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (open) {
			if (e.key === 'ArrowDown' && matches.length > 0) {
				e.preventDefault()
				setHighlight((safeHighlight + 1) % matches.length)
				return
			}
			if (e.key === 'ArrowUp' && matches.length > 0) {
				e.preventDefault()
				setHighlight((safeHighlight - 1 + matches.length) % matches.length)
				return
			}
			if ((e.key === 'Enter' || e.key === 'Tab') && !e.metaKey && !e.ctrlKey && matches.length > 0) {
				e.preventDefault()
				pick(matches[safeHighlight])
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				setDismissedQuery(`${active.start}:${active.query}`)
				return
			}
		}
		onKeyDown?.(e)
	}

	return (
		<Popover open={open}>
			<PopoverAnchor asChild>
				<Textarea
					{...textareaProps}
					ref={ref}
					value={value}
					onChange={e => {
						onValueChange(e.target.value)
						syncQuery(e.target)
					}}
					onSelect={e => syncQuery(e.currentTarget)}
					onBlur={e => {
						setActive(null)
						textareaProps.onBlur?.(e)
					}}
					onKeyDown={handleKeyDown}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={open}
					aria-controls={open ? listId : undefined}
					aria-activedescendant={open && matches.length > 0 ? `${listId}-${safeHighlight}` : undefined}
					className={className}
				/>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-64 p-1 gap-0"
				onOpenAutoFocus={e => e.preventDefault()}
				onCloseAutoFocus={e => e.preventDefault()}
			>
				<div id={listId} role="listbox" aria-label="Mention someone">
					{candidates === undefined ? (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">Loading people...</div>
					) : (
						matches.map((c, i) => (
							<div
								key={c.id}
								id={`${listId}-${i}`}
								role="option"
								aria-selected={i === safeHighlight}
								// mousedown, not click: keeps focus (and the caret) in the textarea.
								onMouseDown={e => {
									e.preventDefault()
									pick(c)
								}}
								onMouseMove={() => i !== safeHighlight && setHighlight(i)}
								className={cn(
									'flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer text-sm',
									i === safeHighlight && 'bg-accent text-accent-foreground'
								)}
							>
								<UserAvatar name={displayName(c)} image={c.image} size="small" className="shrink-0" />
								<span className="truncate">{displayName(c)}</span>
							</div>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}
