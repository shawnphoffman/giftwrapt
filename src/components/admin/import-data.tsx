import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { importAppDataAsAdmin } from '@/api/backup'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { BackupFile, BackupFileTables } from '@/lib/backup/schema'
import { BackupFileSchema } from '@/lib/backup/schema'

const WIPE_CONFIRM_PHRASE = 'WIPE AND RESTORE'

type Mode = 'merge' | 'wipe'

const TABLE_ORDER: Array<keyof BackupFileTables> = [
	'users',
	'appSettings',
	'userRelationships',
	'guardianships',
	'lists',
	'itemGroups',
	'items',
	'giftedItems',
	'itemComments',
	'listAddons',
	'listEditors',
]

export default function ImportData() {
	const queryClient = useQueryClient()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [fileName, setFileName] = useState<string | null>(null)
	const [parsed, setParsed] = useState<BackupFile | null>(null)
	const [parseError, setParseError] = useState<string | null>(null)
	const [mode, setMode] = useState<Mode>('merge')
	const [confirmText, setConfirmText] = useState('')
	const [submitting, setSubmitting] = useState(false)

	const counts = useMemo(() => {
		if (!parsed) return null
		return TABLE_ORDER.map(name => ({ name, count: parsed.tables[name].length }))
	}, [parsed])

	const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		setFileName(file.name)
		setParsed(null)
		setParseError(null)

		try {
			const text = await file.text()
			const json = JSON.parse(text)
			const result = BackupFileSchema.safeParse(json)
			if (!result.success) {
				const firstIssue = result.error.issues[0]
				const path = firstIssue?.path.join('.') ?? '<root>'
				setParseError(`Invalid backup file: ${firstIssue?.message ?? 'validation failed'} (at ${path})`)
				return
			}
			setParsed(result.data)
		} catch (err) {
			setParseError(err instanceof Error ? err.message : 'Failed to read backup file')
		}
	}, [])

	const canSubmit =
		parsed != null && !submitting && (mode === 'merge' || confirmText === WIPE_CONFIRM_PHRASE)

	const handleSubmit = useCallback(async () => {
		if (!parsed) return
		setSubmitting(true)
		try {
			const result = await importAppDataAsAdmin({ data: { mode, data: parsed } })
			if (result.kind === 'ok') {
				const total = Object.values(result.counts).reduce((sum, n) => sum + n, 0)
				toast.success(`Imported ${total.toLocaleString()} rows`, {
					description: TABLE_ORDER.map(name => `${name}: ${result.counts[name]}`).join(' · '),
				})
				await queryClient.invalidateQueries()
				setFileName(null)
				setParsed(null)
				setConfirmText('')
				setMode('merge')
				if (fileInputRef.current) fileInputRef.current.value = ''
			} else {
				toast.error(humanErrorReason(result.reason), { description: result.details })
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Import failed')
		} finally {
			setSubmitting(false)
		}
	}, [mode, parsed, queryClient])

	return (
		<div className="space-y-4">
			<div>
				<input
					ref={fileInputRef}
					type="file"
					accept="application/json"
					className="hidden"
					onChange={handleFileChange}
				/>
				<Button
					type="button"
					variant="secondary"
					onClick={() => fileInputRef.current?.click()}
					disabled={submitting}
					className="gap-2"
				>
					<Upload />
					{fileName ? 'Choose a different file' : 'Choose backup file'}
				</Button>
				{fileName && <span className="ml-3 text-sm text-muted-foreground">{fileName}</span>}
			</div>

			{parseError && (
				<Alert variant="destructive">
					<AlertTitle>Invalid backup file</AlertTitle>
					<AlertDescription>{parseError}</AlertDescription>
				</Alert>
			)}

			{counts && parsed && (
				<>
					<div className="rounded-md border">
						<div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Preview · exported {formatExportedAt(parsed.exportedAt)}
						</div>
						<ul className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 text-sm sm:grid-cols-3">
							{counts.map(({ name, count }) => (
								<li key={name} className="flex justify-between">
									<span>{name}</span>
									<span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
								</li>
							))}
						</ul>
					</div>

					<div className="space-y-2">
						<Label>Mode</Label>
						<RadioGroup value={mode} onValueChange={v => setMode(v as Mode)} className="grid gap-2">
							<label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
								<RadioGroupItem value="merge" id="mode-merge" className="mt-0.5" />
								<div className="space-y-0.5">
									<div className="text-sm font-medium">Merge by ID</div>
									<div className="text-xs text-muted-foreground">
										Upsert each row by primary key. Existing rows get updated with the values from the backup. Nothing is deleted.
									</div>
								</div>
							</label>
							<label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
								<RadioGroupItem value="wipe" id="mode-wipe" className="mt-0.5" />
								<div className="space-y-0.5">
									<div className="text-sm font-medium">Wipe and restore</div>
									<div className="text-xs text-muted-foreground">
										Delete all existing app data (including every user and all sessions), then insert rows from the backup. You will be signed out and will need to re-authenticate.
									</div>
								</div>
							</label>
						</RadioGroup>
					</div>

					{mode === 'wipe' && (
						<div className="space-y-2">
							<Label htmlFor="wipe-confirm">
								Type <span className="font-mono font-semibold">{WIPE_CONFIRM_PHRASE}</span> to confirm
							</Label>
							<Input
								id="wipe-confirm"
								value={confirmText}
								onChange={e => setConfirmText(e.target.value)}
								placeholder={WIPE_CONFIRM_PHRASE}
								autoComplete="off"
							/>
						</div>
					)}

					<Button
						type="button"
						onClick={handleSubmit}
						disabled={!canSubmit}
						variant={mode === 'wipe' ? 'destructive' : 'default'}
					>
						{submitting ? 'Importing...' : mode === 'wipe' ? 'Wipe and restore' : 'Merge import'}
					</Button>
				</>
			)}
		</div>
	)
}

function humanErrorReason(reason: string): string {
	switch (reason) {
		case 'current-admin-missing':
			return 'Your account is not in the backup'
		case 'import-failed':
			return 'Import failed'
		default:
			return 'Import failed'
	}
}

function formatExportedAt(iso: string): string {
	try {
		const d = new Date(iso)
		if (isNaN(d.getTime())) return iso
		return d.toLocaleString()
	} catch {
		return iso
	}
}
