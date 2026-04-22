import { Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { removeAvatar, uploadAvatar } from '@/api/uploads'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useSession } from '@/lib/auth-client'

// Avatar upload + remove. Clicking the avatar opens the file picker; a
// subtle Remove button below shows up when there's an image to remove.
// The server fn does all the work (Sharp, S3, DB update); we just show
// progress state and refetch the session so the new URL flows through.

interface ProfileAvatarProps {
	image?: string | null
	displayName?: string | null
}

export default function AvatarUpload({ image, displayName }: ProfileAvatarProps) {
	const [isUploading, setIsUploading] = useState(false)
	const [isRemoving, setIsRemoving] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { refetch: refetchSession } = useSession()

	const busy = isUploading || isRemoving

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		// Reset the input so picking the same file twice still triggers change.
		e.target.value = ''
		if (!file) return

		setIsUploading(true)
		try {
			const form = new FormData()
			form.append('file', file)
			const result = await uploadAvatar({ data: form })
			if (result.kind === 'error') {
				toast.error(`Avatar upload failed: ${result.message}`)
				return
			}
			toast.success('Avatar updated')
			await refetchSession()
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
			const result = await removeAvatar()
			if (result.kind === 'error') {
				toast.error(`Remove failed: ${result.message}`)
				return
			}
			toast.success('Avatar removed')
			await refetchSession()
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'unknown error'
			toast.error(`Remove failed: ${msg}`)
		} finally {
			setIsRemoving(false)
		}
	}

	return (
		<div className="flex flex-col items-center gap-2">
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
				<Button variant="ghost" size="sm" disabled={busy} onClick={handleRemove} className="text-muted-foreground hover:text-destructive gap-1.5">
					{isRemoving ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
					Remove
				</Button>
			)}
		</div>
	)
}
