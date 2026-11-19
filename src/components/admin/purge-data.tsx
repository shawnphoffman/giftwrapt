import { Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { purgeAllListsAsAdmin } from '@/api/admin'
import { RichMessage } from '@/components/common/rich-message'
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
import { errorText } from '@/lib/i18n/errors'
import { m } from '@/paraglide/messages.js'

const CONFIRM_PHRASE = 'purge everything'

export default function PurgeData() {
	const [open, setOpen] = useState(false)
	const [confirmText, setConfirmText] = useState('')
	const [purging, setPurging] = useState(false)

	const handlePurge = useCallback(async () => {
		setPurging(true)
		try {
			const result = await purgeAllListsAsAdmin()
			toast.success(m.admin_data_purge_done({ lists: result.listsDeleted, items: result.itemsDeleted, claims: result.claimsDeleted }))
			setOpen(false)
			setConfirmText('')
		} catch (err) {
			toast.error(errorText(err, m.admin_data_purge_failed()))
		} finally {
			setPurging(false)
		}
	}, [])

	return (
		<>
			<Button onClick={() => setOpen(true)} variant="destructive" className="gap-2">
				<Trash2 />
				{m.admin_data_purge_button()}
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
						<AlertDialogTitle>{m.admin_data_purge_confirm_title()}</AlertDialogTitle>
						<AlertDialogDescription>{m.admin_data_purge_confirm_body()}</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Label htmlFor="purge-confirm">
							<RichMessage
								parts={m.admin_data_confirm_phrase_label.parts({ phrase: CONFIRM_PHRASE })}
								tags={{ phrase: c => <span className="font-mono font-semibold">{c}</span> }}
							/>
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
						<AlertDialogCancel disabled={purging}>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction
							onClick={handlePurge}
							disabled={purging || confirmText !== CONFIRM_PHRASE}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{purging ? m.admin_data_purge_busy() : m.admin_data_purge_confirm()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
