import { Eye, Heart, Pencil, Shield, ShieldOff } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'

import UserAvatar from '@/components/common/user-avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { buildIndices, type Cell, type CellKind, classifyCell, type PermissionsMatrixData } from '@/lib/permissions-matrix'
import { cn } from '@/lib/utils'

type HeaderUser = { id: string; name: string | null; email: string; image: string | null }

function CellTooltip({ cell, viewerName, ownerName }: { cell: Cell; viewerName: string; ownerName: string }) {
	const lines: Array<string> = []
	switch (cell.kind) {
		case 'self':
			lines.push(`${ownerName} owns these lists.`)
			break
		case 'guardian':
			lines.push(`${viewerName} is a guardian of ${ownerName}.`)
			lines.push(`Full view + edit on all of ${ownerName}'s lists.`)
			break
		case 'editor':
			lines.push(`${viewerName} can edit ${ownerName}'s lists.`)
			if (cell.editorListCount > 0) {
				lines.push(`User-level grant (+${cell.editorListCount} list-level grant${cell.editorListCount === 1 ? '' : 's'}).`)
			} else {
				lines.push(`User-level grant.`)
			}
			break
		case 'denied':
			lines.push(`${ownerName} has explicitly denied ${viewerName} from viewing their lists.`)
			break
		case 'restricted':
			lines.push(`${ownerName} has restricted ${viewerName}'s view: visible items only, no addons, no edits.`)
			if (cell.editorListCount > 0) {
				lines.push(`(${cell.editorListCount} stale list-level edit grant${cell.editorListCount === 1 ? '' : 's'} ignored.)`)
			}
			break
		case 'view':
			lines.push(`${viewerName} can view ${ownerName}'s public, active lists (default).`)
			if (cell.editorListCount > 0) {
				lines.push(`+${cell.editorListCount} list-level edit grant${cell.editorListCount === 1 ? '' : 's'}.`)
			}
			break
	}
	if (cell.isPartner) lines.push(`Partners.`)
	return (
		<div className="space-y-0.5">
			{lines.map((line, i) => (
				<div key={i}>{line}</div>
			))}
		</div>
	)
}

function CellGlyph({ cell }: { cell: Cell }) {
	switch (cell.kind) {
		case 'self':
			return <span className="text-[10px] font-semibold text-muted-foreground">self</span>
		case 'guardian':
			return <Shield className="size-4" />
		case 'editor':
			return <Pencil className="size-3.5" />
		case 'denied':
			return <ShieldOff className="size-3.5" />
		case 'restricted':
			return <Eye className="size-3.5" />
		case 'view':
			return <span className="size-1.5 rounded-full bg-current opacity-60" />
	}
}

function cellClasses(kind: CellKind): string {
	switch (kind) {
		case 'self':
			return 'bg-muted text-muted-foreground'
		case 'guardian':
			return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
		case 'editor':
			return 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
		case 'denied':
			return 'bg-red-500/15 text-red-700 dark:text-red-400'
		case 'restricted':
			return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
		case 'view':
			return 'text-muted-foreground hover:bg-muted/40'
	}
}

function HeaderUserCell({ user, axis }: { user: HeaderUser; axis: 'col' | 'row' }) {
	const display = user.name || user.email
	if (axis === 'col') {
		return (
			<div className="flex flex-col items-center gap-1 px-1 py-2 w-12">
				<UserAvatar name={display} image={user.image} size="small" />
				<div className="text-[10px] leading-tight font-medium text-center truncate w-full" title={display}>
					{user.name?.split(' ')[0] || user.email.split('@')[0]}
				</div>
			</div>
		)
	}
	return (
		<div className="flex items-center gap-2 pr-3 pl-2 py-1.5 min-w-28 sm:min-w-44">
			<UserAvatar name={display} image={user.image} size="small" />
			<div className="flex flex-col min-w-0">
				<span className="text-xs font-medium truncate">{user.name || 'No name'}</span>
				<span className="hidden sm:block text-[10px] text-muted-foreground truncate">{user.email}</span>
			</div>
		</div>
	)
}

export function PermissionsMatrixView({ data }: { data: PermissionsMatrixData }) {
	const indices = useMemo(() => buildIndices(data), [data])
	const users = data.users

	if (users.length === 0) {
		return <div className="text-sm text-muted-foreground">No users found.</div>
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="space-y-4">
				<div className="overflow-auto rounded-md border max-h-[70vh]">
					<table className="border-separate border-spacing-0">
						<thead>
							<tr>
								<th className="sticky left-0 top-0 z-30 bg-card border-b border-r p-2 text-left">
									<div className="flex flex-col text-[10px] leading-tight text-muted-foreground">
										<span className="font-semibold">List owner →</span>
										<span className="font-semibold">Viewer ↓</span>
									</div>
								</th>
								{users.map(owner => (
									<th key={owner.id} className="sticky top-0 z-20 bg-card border-b align-bottom">
										<HeaderUserCell user={owner} axis="col" />
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{users.map(viewer => (
								<tr key={viewer.id}>
									<th scope="row" className="sticky left-0 z-10 bg-card border-r text-left align-middle">
										<HeaderUserCell user={viewer} axis="row" />
									</th>
									{users.map(owner => {
										const cell = classifyCell({
											viewerId: viewer.id,
											ownerId: owner.id,
											guardianPairs: indices.guardianPairs,
											relationships: indices.relationships,
											listEditorCounts: indices.listEditorCounts,
											partnerOf: indices.partnerOf,
										})
										return (
											<td key={owner.id} className="p-0 border-b border-l/30">
												<Tooltip>
													<TooltipTrigger asChild>
														<div
															className={cn('relative size-12 flex items-center justify-center transition-colors', cellClasses(cell.kind))}
														>
															<CellGlyph cell={cell} />
															{cell.editorListCount > 0 && cell.kind !== 'self' && (
																<span className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-sky-700 dark:text-sky-400">
																	+{cell.editorListCount}
																</span>
															)}
															{cell.isPartner && <Heart className="absolute top-0.5 right-0.5 size-2.5 fill-pink-500 text-pink-500" />}
														</div>
													</TooltipTrigger>
													<TooltipContent side="top">
														<CellTooltip cell={cell} viewerName={viewer.name || viewer.email} ownerName={owner.name || owner.email} />
													</TooltipContent>
												</Tooltip>
											</td>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<Legend />
			</div>
		</TooltipProvider>
	)
}

function Legend() {
	const userLevelGrants: Array<{ kind: CellKind; label: string; hint: string }> = [
		{ kind: 'guardian', label: 'Guardian', hint: 'Full view + edit on child user' },
		{ kind: 'editor', label: 'Editor', hint: 'User-level edit grant' },
		{ kind: 'view', label: 'View', hint: 'Default: public + active lists' },
		{ kind: 'restricted', label: 'Restricted', hint: 'Can claim, but unclaimed items only; no addons' },
		{ kind: 'denied', label: 'Denied', hint: 'Owner blocked viewer' },
	]
	return (
		<div className="space-y-3 text-xs text-muted-foreground">
			<LegendSection title="User-level grants">
				{userLevelGrants.map(it => (
					<LegendItem key={it.kind} label={it.label} hint={it.hint}>
						<div className={cn('flex items-center justify-center size-6 rounded-sm', cellClasses(it.kind))}>
							<CellGlyph cell={{ kind: it.kind, editorListCount: 0, isPartner: false }} />
						</div>
					</LegendItem>
				))}
			</LegendSection>
			<LegendSection title="Other">
				<LegendItem label="Partner" hint="Bidirectional partner link">
					<div className="relative size-6 rounded-sm bg-muted">
						<Heart className="absolute top-0.5 right-0.5 size-2.5 fill-pink-500 text-pink-500" />
					</div>
				</LegendItem>
				<LegendItem label="+N" hint="List-level edit grants">
					<div className="flex items-center justify-center size-6 rounded-sm bg-sky-500/15 text-sky-700 dark:text-sky-400 text-[9px] font-semibold">
						+N
					</div>
				</LegendItem>
			</LegendSection>
		</div>
	)
}

function LegendSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="space-y-1.5">
			<div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">{title}</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>
		</div>
	)
}

function LegendItem({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
	return (
		<div className="flex items-center gap-1.5">
			{children}
			<span className="font-medium text-foreground">{label}</span>
			<span>{hint}</span>
		</div>
	)
}
