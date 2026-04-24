import { type MouseEvent, type ReactNode, useState } from 'react'

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

type ConfirmDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: ReactNode
	description?: ReactNode
	confirmLabel?: string
	confirmBusyLabel?: string
	cancelLabel?: string
	destructive?: boolean
	// Dialog auto-closes when this resolves. Throw to keep it open.
	onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = 'Confirm',
	confirmBusyLabel,
	cancelLabel = 'Cancel',
	destructive = false,
	onConfirm,
}: ConfirmDialogProps) {
	const [busy, setBusy] = useState(false)

	async function handleConfirm(e: MouseEvent) {
		e.preventDefault()
		setBusy(true)
		try {
			await onConfirm()
			onOpenChange(false)
		} finally {
			setBusy(false)
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description && <AlertDialogDescription>{description}</AlertDialogDescription>}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={handleConfirm}>
						{busy && confirmBusyLabel ? confirmBusyLabel : confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
