// Admin form + tester for the barcode lookup feature. Lives at
// /admin/barcode. Not currently linked from the admin sidebar - the
// feature is still WIP and we want operators to find it via direct URL
// (like the /temp pages) until it's broadly enabled.
//
// Two halves:
//   - Settings: enabled toggle, primary provider, Go-UPC key (masked),
//     cache TTL, scraper fallback toggle.
//   - Tester: pick a provider id, paste a barcode, see the raw
//     normalized result for THAT provider. Bypasses the cache and the
//     fallback chain so operators can confirm a provider works in
//     isolation.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckIcon, ScanBarcode, XIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { runBarcodeProbeAsAdmin } from '@/api/admin-barcode'
import { updateAppSettings } from '@/api/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { adminAppSettingsQueryKey, notifyAppSettingsChanged, useAdminAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings, BarcodeSettings } from '@/lib/settings'

const BARCODE_PROVIDERS: Array<{ id: BarcodeSettings['providerId']; label: string }> = [
	{ id: 'upcitemdb-trial', label: 'UPCitemdb (trial, free)' },
	{ id: 'go-upc', label: 'Go-UPC (paid)' },
]

const TESTER_PROVIDERS: Array<{ id: 'upcitemdb-trial' | 'go-upc'; label: string }> = [
	{ id: 'upcitemdb-trial', label: 'UPCitemdb (trial)' },
	{ id: 'go-upc', label: 'Go-UPC' },
]

function useBarcodeSettingsMutation() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (next: BarcodeSettings) => {
			return await updateAppSettings({ data: { barcode: next } } as Parameters<typeof updateAppSettings>[0])
		},
		onMutate: async (next: BarcodeSettings) => {
			await queryClient.cancelQueries({ queryKey: adminAppSettingsQueryKey })
			const previous = queryClient.getQueryData<AppSettings>(adminAppSettingsQueryKey)
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => (old ? { ...old, barcode: next } : old))
			return { previous }
		},
		onError: (err, _next, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(adminAppSettingsQueryKey, ctx.previous)
			toast.error(err instanceof Error ? err.message : 'Failed to update barcode settings')
		},
		onSuccess: data => {
			queryClient.setQueryData<AppSettings>(adminAppSettingsQueryKey, old => (old ? { ...old, barcode: data.barcode } : old))
			notifyAppSettingsChanged(queryClient)
			toast.success('Barcode settings updated')
		},
	})
}

export function BarcodeSettingsEditor() {
	const { data: settings, isLoading } = useAdminAppSettings()
	const mutation = useBarcodeSettingsMutation()

	if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>
	if (!settings) return <div className="text-sm text-muted-foreground">No settings found</div>

	const cfg = settings.barcode

	const update = (patch: Partial<BarcodeSettings>) => {
		mutation.mutate({ ...cfg, ...patch })
	}

	return (
		<div className="space-y-8">
			<BarcodeSettingsForm cfg={cfg} onChange={update} saving={mutation.isPending} />
			<BarcodeTester />
		</div>
	)
}

type FormProps = {
	cfg: BarcodeSettings
	onChange: (patch: Partial<BarcodeSettings>) => void
	saving: boolean
}

function BarcodeSettingsForm({ cfg, onChange, saving }: FormProps) {
	const [keyDraft, setKeyDraft] = useState('')
	const [editingKey, setEditingKey] = useState(false)
	const hasKey = cfg.goUpcKey.length > 0

	const saveKey = () => {
		const trimmed = keyDraft.trim()
		if (!trimmed) return
		onChange({ goUpcKey: trimmed })
		setKeyDraft('')
		setEditingKey(false)
	}

	const clearKey = () => {
		onChange({ goUpcKey: '' })
		setKeyDraft('')
		setEditingKey(false)
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="barcodeEnabled" className="text-base">
						Enable Barcode Lookup
					</Label>
					<p className="text-sm text-muted-foreground">
						When off, <code>POST /api/mobile/v1/products/by-barcode</code> returns 503 and the iOS capabilities probe reports the feature
						unavailable.
					</p>
				</div>
				<Switch id="barcodeEnabled" checked={cfg.enabled} onCheckedChange={value => onChange({ enabled: value })} disabled={saving} />
			</div>

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="barcodeProvider" className="text-base">
						Primary Provider
					</Label>
					<p className="text-sm text-muted-foreground">Which provider fires first on a cache miss.</p>
				</div>
				<Select
					value={cfg.providerId}
					onValueChange={value => onChange({ providerId: value as BarcodeSettings['providerId'] })}
					disabled={saving}
				>
					<SelectTrigger id="barcodeProvider" className="w-[220px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{BARCODE_PROVIDERS.map(p => (
							<SelectItem key={p.id} value={p.id}>
								{p.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{cfg.providerId === 'go-upc' && (
				<div className="space-y-2 rounded-md border border-border p-4">
					<Label htmlFor="goUpcKey" className="text-base">
						Go-UPC API Key
					</Label>
					<p className="text-sm text-muted-foreground">Bearer token sent on every Go-UPC request. Stored encrypted at rest.</p>
					{!editingKey && hasKey && (
						<div className="flex items-center gap-2">
							<Input value="••••••••••••" readOnly className="font-mono" />
							<Button type="button" variant="outline" onClick={() => setEditingKey(true)} disabled={saving}>
								Change
							</Button>
							<Button type="button" variant="outline" onClick={clearKey} disabled={saving}>
								Clear
							</Button>
						</div>
					)}
					{(editingKey || !hasKey) && (
						<div className="flex items-center gap-2">
							<Input
								id="goUpcKey"
								type="password"
								autoComplete="off"
								placeholder="goupc_…"
								value={keyDraft}
								onChange={e => setKeyDraft(e.target.value)}
								className="font-mono"
							/>
							<Button type="button" onClick={saveKey} disabled={saving || keyDraft.trim().length === 0}>
								Save Key
							</Button>
							{hasKey && (
								<Button type="button" variant="ghost" onClick={() => setEditingKey(false)} disabled={saving}>
									Cancel
								</Button>
							)}
						</div>
					)}
					{!hasKey && <p className="text-sm text-amber-500">No key set; lookups will return 503 until one is provided.</p>}
				</div>
			)}

			<div className="flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="barcodeCacheTtl" className="text-base">
						Cache TTL (Hours)
					</Label>
					<p className="text-sm text-muted-foreground">Cached rows older than this are refreshed on the next lookup. 0 disables caching.</p>
				</div>
				<Input
					id="barcodeCacheTtl"
					type="number"
					min={0}
					value={cfg.cacheTtlHours}
					onChange={e => {
						const n = Number(e.target.value)
						if (Number.isFinite(n) && n >= 0) onChange({ cacheTtlHours: Math.floor(n) })
					}}
					className="w-[120px]"
					disabled={saving}
				/>
			</div>
		</div>
	)
}

type ProbeOutcome = Awaited<ReturnType<typeof runBarcodeProbeAsAdmin>>

function BarcodeTester() {
	const [providerId, setProviderId] = useState<(typeof TESTER_PROVIDERS)[number]['id']>('upcitemdb-trial')
	const [code, setCode] = useState('')
	const [running, setRunning] = useState(false)
	const [outcome, setOutcome] = useState<ProbeOutcome | null>(null)

	const onRun = useCallback(async () => {
		const trimmed = code.trim()
		if (!trimmed) return
		setRunning(true)
		setOutcome(null)
		try {
			const result = await runBarcodeProbeAsAdmin({ data: { providerId, code: trimmed } } as Parameters<typeof runBarcodeProbeAsAdmin>[0])
			setOutcome(result)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Probe failed')
		} finally {
			setRunning(false)
		}
	}, [providerId, code])

	return (
		<div className="space-y-4 rounded-md border border-border p-4">
			<div className="flex items-center gap-2">
				<ScanBarcode className="size-5" />
				<h3 className="text-base font-medium">Provider Tester</h3>
			</div>
			<p className="text-sm text-muted-foreground">
				Run a single provider against a barcode. Bypasses the cache and the fallback chain so you can confirm each provider's configuration
				in isolation.
			</p>
			<div className="grid gap-3 sm:grid-cols-[200px_1fr_auto]">
				<Select value={providerId} onValueChange={v => setProviderId(v as typeof providerId)} disabled={running}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TESTER_PROVIDERS.map(p => (
							<SelectItem key={p.id} value={p.id}>
								{p.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					placeholder="Barcode (UPC-A, EAN-13, ITF-14, etc.)"
					value={code}
					onChange={e => setCode(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter') void onRun()
					}}
					disabled={running}
				/>
				<Button type="button" onClick={() => void onRun()} disabled={running || code.trim().length === 0}>
					Test
				</Button>
			</div>
			<ProbeOutcomeDisplay outcome={outcome} />
		</div>
	)
}

function ProbeOutcomeDisplay({ outcome }: { outcome: ProbeOutcome | null }) {
	if (!outcome) return null

	if (outcome.kind === 'error') {
		return (
			<div className="flex items-start gap-2 text-sm text-destructive">
				<XIcon className="mt-0.5 size-4" />
				<div>
					<div className="font-medium">Error: {outcome.reason}</div>
				</div>
			</div>
		)
	}

	if (outcome.kind === 'unavailable') {
		return (
			<div className="flex items-start gap-2 text-sm text-amber-500">
				<XIcon className="mt-0.5 size-4" />
				<div>
					<div className="font-medium">
						Provider unavailable ({outcome.providerId}): {outcome.reason}
					</div>
					{outcome.message && <div className="text-muted-foreground">{outcome.message}</div>}
				</div>
			</div>
		)
	}

	if (outcome.kind === 'miss') {
		return (
			<div className="flex items-start gap-2 text-sm">
				<XIcon className="mt-0.5 size-4" />
				<div>
					<div className="font-medium">No results for {outcome.gtin14}</div>
					<div className="text-muted-foreground">{outcome.providerId} reported a clean miss.</div>
				</div>
			</div>
		)
	}

	// ok
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2 text-sm text-green-600">
				<CheckIcon className="mt-0.5 size-4" />
				<div>
					<div className="font-medium">
						{outcome.results.length} result{outcome.results.length === 1 ? '' : 's'} from {outcome.providerId}
					</div>
					<div className="text-muted-foreground">Normalized GTIN-14: {outcome.gtin14}</div>
				</div>
			</div>
			<ul className="space-y-3">
				{outcome.results.map((r, i) => (
					<li key={i} className="flex gap-3 rounded border border-border p-3">
						{r.imageUrl && <img src={r.imageUrl} alt="" className="size-16 rounded object-contain bg-muted" />}
						<div className="min-w-0 flex-1 text-sm">
							{r.title && <div className="font-medium">{r.title}</div>}
							{r.brand && <div className="text-muted-foreground">{r.brand}</div>}
							{r.candidateUrl && (
								<a href={r.candidateUrl} target="_blank" rel="noreferrer" className="break-all text-xs text-blue-600 underline">
									{r.candidateUrl}
								</a>
							)}
						</div>
					</li>
				))}
			</ul>
		</div>
	)
}
