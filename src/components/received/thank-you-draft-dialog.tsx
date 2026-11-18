import { Mail, PenLine, RotateCw } from 'lucide-react'
import { useState } from 'react'

import { CopyButton } from '@/components/common/copy-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { m } from '@/paraglide/messages.js'

export type ThankYouDraftState = { phase: 'loading' } | { phase: 'ready'; note: string } | { phase: 'error'; message: string }

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	// Who the note is to, e.g. "Kate & Jeff".
	giverLabel: string
	// The givers' email addresses, used as the recipients of the Draft Email link.
	giverEmails: Array<string>
	// How many gifts the note covers; picks "gift" or "gifts" in the subject.
	giftCount: number
	state: ThankYouDraftState
	onNoteChange: (note: string) => void
	onRetry: () => void
}

export function thankYouSubjects(giverLabel: string, giftCount: number): Array<string> {
	return [
		m.received_thank_you_subject_short(),
		m.received_thank_you_subject_named({ giverLabel }),
		m.received_thank_you_subject_gifts({ count: giftCount }),
	]
}

// Built by hand rather than with URLSearchParams, which encodes spaces as "+"
// and some mail apps show them literally.
export function thankYouMailto(emails: ReadonlyArray<string>, subject: string, body: string): string {
	const to = emails.map(encodeURIComponent).join(',')
	return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * A drafted thank-you note for one giver's gifts. The draft is a starting
 * point: the text is editable, and the dialog can copy it or open it in the
 * user's own email app. GiftWrapt never sends it to anyone.
 */
export function ThankYouDraftDialog({ open, onOpenChange, giverLabel, giverEmails, giftCount, state, onNoteChange, onRetry }: Props) {
	const subjects = thankYouSubjects(giverLabel, giftCount)
	const [subject, setSubject] = useState(subjects[0])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-start gap-2 pr-8">
						<PenLine className="mt-2 size-5 shrink-0" />
						<span className="text-balance">{m.received_thank_you_title({ giverLabel })}</span>
					</DialogTitle>
					<DialogDescription>{m.received_thank_you_description()}</DialogDescription>
				</DialogHeader>

				{state.phase === 'loading' && <p className="py-6 text-center text-sm text-muted-foreground">{m.received_thank_you_loading()}</p>}

				{state.phase === 'error' && (
					<Alert variant="destructive">
						<AlertDescription>{state.message}</AlertDescription>
					</Alert>
				)}

				{state.phase === 'ready' && (
					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="thank-you-note">{m.received_thank_you_note_label()}</Label>
							<Textarea id="thank-you-note" rows={8} value={state.note} onChange={e => onNoteChange(e.target.value)} />
						</div>
						<div className="grid gap-2">
							<Label htmlFor="thank-you-subject">{m.received_thank_you_subject_label()}</Label>
							<Select value={subject} onValueChange={setSubject}>
								<SelectTrigger id="thank-you-subject" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{subjects.map(s => (
										<SelectItem key={s} value={s}>
											{s}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onRetry} disabled={state.phase === 'loading'}>
						<RotateCw className="size-4" /> {state.phase === 'error' ? m.action_try_again() : m.received_thank_you_new_draft()}
					</Button>
					{state.phase === 'ready' && <CopyButton value={state.note} label={m.received_thank_you_copy_note()} size="default" />}
					{state.phase === 'ready' && (
						<Button asChild>
							<a href={thankYouMailto(giverEmails, subject, state.note)}>
								<Mail className="size-4" /> {m.received_thank_you_draft_email()}
							</a>
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
