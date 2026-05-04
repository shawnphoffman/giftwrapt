import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Props = {
	listId: number
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Placeholder until commit 5 lands the real Amazon wish-list flow.
 */
export function ImportDialogAmazon({ listId: _listId, open, onOpenChange }: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import from Amazon wish list</DialogTitle>
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
