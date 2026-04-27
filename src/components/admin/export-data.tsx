import { Download } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { exportAppDataAsAdmin } from '@/api/backup'
import { Button } from '@/components/ui/button'

export default function ExportData() {
	const [downloading, setDownloading] = useState(false)

	const handleDownload = useCallback(async () => {
		setDownloading(true)
		try {
			const backup = await exportAppDataAsAdmin()
			const json = JSON.stringify(backup, null, 2)
			const blob = new Blob([json], { type: 'application/json' })
			const url = URL.createObjectURL(blob)

			const stamp = new Date().toISOString().replace(/[:.]/g, '-')
			const a = document.createElement('a')
			a.href = url
			a.download = `giftwrapt-backup-${stamp}.json`
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)

			const totalRows = Object.values(backup.tables).reduce((sum, rows) => sum + rows.length, 0)
			toast.success(`Backup downloaded (${totalRows.toLocaleString()} rows)`)
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to export backup'
			toast.error(message)
		} finally {
			setDownloading(false)
		}
	}, [])

	return (
		<Button onClick={handleDownload} disabled={downloading} variant="secondary" className="gap-2">
			<Download />
			{downloading ? 'Preparing...' : 'Download backup'}
		</Button>
	)
}
