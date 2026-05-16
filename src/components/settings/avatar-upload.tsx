import { Loader2, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { removeAvatar, uploadAvatar } from '@/api/uploads'
import { AvatarCropperDialog } from '@/components/settings/avatar-cropper-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useStorageStatus } from '@/hooks/use-storage-status'
import { useSession } from '@/lib/auth-client'
import type { UploadResult } from '@/lib/storage/errors'

// Avatar upload + remove. Clicking the avatar opens the file picker; a
// subtle Remove button below shows up when there's an image to remove.
// The server fn does all the work (Sharp, S3, DB update); we just show
// progress state and refetch the session so the new URL flows through.
//
// By default targets the signed-in user. Admin callers can pass their own
// onUpload/onRemove (e.g. to target another userId) and an onSuccess to
// sync their own state (query invalidation, form field update).

interface ProfileAvatarProps {
	image?: string | null
	displayName?: string | null
	onUpload?: (file: File) => Promise<UploadResult<{ url: string }>>
	onRemove?: () => Promise<UploadResult<{ ok: true }>>
	onSuccess?: (image: string | null) => void | Promise<void>
}

export default function AvatarUpload({ image, displayName, onUpload, onRemove, onSuccess }: ProfileAvatarProps) {
	const [isUploading, setIsUploading] = useState(false)
	const [isRemoving, setIsRemoving] = useState(false)
	const [cropperOpen, setCropperOpen] = useState(false)
	const [cropperSrc, setCropperSrc] = useState<string | null>(null)
	const [cropperFileName, setCropperFileName] = useState<string | undefined>(undefined)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { refetch: refetchSession } = useSession()
	const { configured: storageConfigured } = useStorageStatus()

	const isCustomHandler = Boolean(onUpload || onRemove)

	const busy = isUploading || isRemoving
	// When storage is off, the avatar is a read-only display. Image URL (if
	// any) still renders; clicking does nothing; remove button is hidden.
	const uploadsDisabled = !storageConfigured

	// Revoke the object URL once the cropper is fully closed and we no
	// longer need to display it. Holding it across an upload means the
	// browser keeps the file blob alive until the user is done framing.
	useEffect(() => {
		if (cropperOpen || !cropperSrc) return
		URL.revokeObjectURL(cropperSrc)
		setCropperSrc(null)
	}, [cropperOpen, cropperSrc])

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		// Reset the input so picking the same file twice still triggers change.
		e.target.value = ''
		if (!file) return
		if (!file.type.startsWith('image/')) {
			toast.error('Please choose an image file')
			return
		}
		const url = URL.createObjectURL(file)
		setCropperSrc(url)
		setCropperFileName(file.name)
		setCropperOpen(true)
	}

	const uploadFile = async (file: File): Promise<UploadResult<{ url: string }>> => {
		if (onUpload) return await onUpload(file)
		const form = new FormData()
		form.append('file', file)
		return await uploadAvatar({ data: form })
	}

	const handleCropped = async (file: File) => {
		setIsUploading(true)
		try {
			const result = await uploadFile(file)
			if (result.kind === 'error') {
				toast.error(`Avatar upload failed: ${result.message}`)
				return
			}
			toast.success('Avatar updated')
			if (isCustomHandler) {
				await onSuccess?.(result.value.url)
			} else {
				await refetchSession()
			}
			setCropperOpen(false)
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'unknown error'
			toast.error(`Avatar upload failed: ${msg}`)
		} finally {
			setIsUploading(false)
		}
	}

	const handleRemove = async () => {
		if (!image) return
		setIsRemoving(true)
		try {
			const result = await (onRemove ? onRemove() : removeAvatar())
			if (result.kind === 'error') {
				toast.error(`Remove failed: ${result.message}`)
				return
			}
			toast.success('Avatar removed')
			if (isCustomHandler) {
				await onSuccess?.(null)
			} else {
				await refetchSession()
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'unknown error'
			toast.error(`Remove failed: ${msg}`)
		} finally {
			setIsRemoving(false)
		}
	}

	if (uploadsDisabled) {
		return (
			<div className="flex flex-col items-center gap-2">
				<Avatar className="border-foreground relative flex h-28 w-28 flex-col items-center justify-center border-2">
					<AvatarImage src={image ?? undefined} />
					<AvatarFallback className="text-5xl font-bold">{displayName?.charAt(0) ?? '?'}</AvatarFallback>
				</Avatar>
			</div>
		)
	}

	return (
		<div className="flex flex-col items-center gap-2">
			<AvatarCropperDialog
				open={cropperOpen}
				onOpenChange={setCropperOpen}
				imageSrc={cropperSrc}
				fileName={cropperFileName}
				onCropped={handleCropped}
			/>
			<input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" disabled={busy} />
			<Avatar
				className="border-foreground group relative flex h-28 w-28 cursor-pointer flex-col items-center justify-center border-2 transition-all"
				onClick={() => !busy && fileInputRef.current?.click()}
			>
				{isUploading ? (
					<>
						<div className="absolute z-20 flex h-28 w-28 items-center justify-center">
							<Loader2 className="size-8 animate-spin" />
						</div>
						<AvatarImage src={image ?? undefined} className="opacity-20 grayscale transition-all" />
					</>
				) : (
					<>
						<div className="absolute z-10 flex h-28 w-28 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
							<Upload className="size-14" />
						</div>
						<AvatarImage src={image ?? undefined} className="transition-all group-hover:opacity-50 group-hover:grayscale" />
						<AvatarFallback className="text-5xl font-bold transition-opacity group-hover:opacity-0">
							{displayName?.charAt(0) ?? '?'}
						</AvatarFallback>
					</>
				)}
			</Avatar>
			{image && (
				<Button
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={handleRemove}
					className="text-muted-foreground hover:text-destructive gap-1.5"
				>
					{isRemoving ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
					Remove
				</Button>
			)}
		</div>
	)
}
