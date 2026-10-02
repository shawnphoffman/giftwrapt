import { PenLine, RotateCw } from 'lucide-react'

import { CopyButton } from '@/components/common/copy-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type ThankYouDraftState = { phase: 'loading' } | { phase: 'ready'; note: string } | { phase: 'error'; message: string }

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	// Who the note is to, e.g. "Kate & Jeff".
	giverLabel: string
	state: ThankYouDraftState
	onNoteChange: (note: string) => void
	onRetry: () => void
}

/**
 * A drafted thank-you note for one giver's gifts. The draft is a starting
 * point: the text is editable and the only thing the dialog does with it
 * is copy it. GiftWrapt never sends it to anyone.
 */
export function ThankYouDraftDialog({ open, onOpenChange, giverLabel, state, onNoteChange, onRetry }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PenLine className="size-5" /> Thank-You Note for {giverLabel}
					</DialogTitle>
					<DialogDescription>
						A draft from an AI model to get you started. Edit it so it sounds like you, then copy it into a card or a message. It is not
						sent to anyone from here.
					</DialogDescription>
				</DialogHeader>

				{state.phase === 'loading' && <p className="py-6 text-center text-sm text-muted-foreground">Writing a draft…</p>}

				{state.phase === 'error' && (
					<Alert variant="destructive">
						<AlertDescription>{state.message}</AlertDescription>
					</Alert>
				)}

				{state.phase === 'ready' && (
					<div className="grid gap-2">
						<Label htmlFor="thank-you-note">Note</Label>
						<Textarea id="thank-you-note" rows={8} value={state.note} onChange={e => onNoteChange(e.target.value)} />
					</div>
				)}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onRetry} disabled={state.phase === 'loading'}>
						<RotateCw className="size-4" /> {state.phase === 'error' ? 'Try Again' : 'New Draft'}
					</Button>
					{state.phase === 'ready' && <CopyButton value={state.note} label="Copy Note" size="sm" />}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
