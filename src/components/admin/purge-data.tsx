import { Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { purgeAllListsAsAdmin } from '@/api/admin'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CONFIRM_PHRASE = 'purge everything'

export default function PurgeData() {
	const [open, setOpen] = useState(false)
	const [confirmText, setConfirmText] = useState('')
	const [purging, setPurging] = useState(false)

	const handlePurge = useCallback(async () => {
		setPurging(true)
		try {
			const result = await purgeAllListsAsAdmin()
			toast.success(`Purged ${result.listsDeleted} lists, ${result.itemsDeleted} items, ${result.claimsDeleted} claims`)
			setOpen(false)
			setConfirmText('')
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to purge data'
			toast.error(message)
		} finally {
			setPurging(false)
		}
	}, [])

	return (
		<>
			<Button onClick={() => setOpen(true)} variant="destructive" className="gap-2">
				<Trash2 />
				Purge all lists & data
			</Button>

			<AlertDialog
				open={open}
				onOpenChange={o => {
					setOpen(o)
					if (!o) setConfirmText('')
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Purge all list data?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes every list, item, claim, comment, addon, and editor record across all users. User accounts,
							guardianships, and partner pointers are kept. Item images are removed from storage on a best-effort basis. There is no undo.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Label htmlFor="purge-confirm">
							Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
						</Label>
						<Input
							id="purge-confirm"
							value={confirmText}
							onChange={e => setConfirmText(e.target.value)}
							autoComplete="off"
							placeholder={CONFIRM_PHRASE}
						/>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handlePurge}
							disabled={purging || confirmText !== CONFIRM_PHRASE}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{purging ? 'Purging...' : 'Purge'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
