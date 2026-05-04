import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Placeholder until commit 4 lands the real Apple Notes flow.
 */
export function ImportDialogAppleNotes({ listId: _listId, open, onOpenChange }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import from Apple Notes</DialogTitle>
					<DialogDescription>Coming soon. This source is being wired up.</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
