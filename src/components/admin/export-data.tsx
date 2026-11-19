import { Download } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { exportAppDataAsAdmin } from '@/api/backup'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/i18n/errors'
import { formatNumber } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

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
			toast.success(m.admin_data_export_done({ total: formatNumber(totalRows) }))
		} catch (err) {
			toast.error(errorText(err, m.admin_data_export_failed()))
		} finally {
			setDownloading(false)
		}
	}, [])

	return (
		<Button onClick={handleDownload} disabled={downloading} variant="outline" className="gap-2">
			<Download />
			{downloading ? m.admin_data_export_busy() : m.admin_data_export_button()}
		</Button>
	)
}
