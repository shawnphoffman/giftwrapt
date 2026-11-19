import { EyeOff, Heart, Home, Pencil, Shield, ShieldOff } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'

import DependentAvatar from '@/components/common/dependent-avatar'
import UserAvatar from '@/components/common/user-avatar'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { RelationLabel } from '@/db/schema/enums'
import {
	buildIndices,
	type Cell,
	type CellKind,
	classifyCell,
	classifyDependentCell,
	type PermissionsMatrixData,
} from '@/lib/permissions-matrix'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

type HeaderUser = { id: string; name: string | null; email: string; image: string | null }

function CellTooltip({ cell, viewerName, ownerName }: { cell: Cell; viewerName: string; ownerName: string }) {
	const lines: Array<string> = []
	switch (cell.kind) {
		case 'self':
			lines.push(m.admin_perms_tip_self({ ownerName }))
			break
		case 'guardian':
			lines.push(m.admin_perms_tip_guardian({ viewerName, ownerName }))
			lines.push(m.admin_perms_tip_guardian_access({ ownerName }))
			break
		case 'editor':
			lines.push(m.admin_perms_tip_editor({ viewerName, ownerName }))
			if (cell.editorListCount > 0) {
				lines.push(m.admin_perms_tip_editor_grant_with_lists({ count: cell.editorListCount }))
			} else {
				lines.push(m.admin_perms_tip_editor_grant())
			}
			break
		case 'denied':
			lines.push(m.admin_perms_tip_denied({ ownerName, viewerName }))
			break
		case 'restricted':
			lines.push(m.admin_perms_tip_restricted({ ownerName, viewerName }))
			if (cell.editorListCount > 0) {
				lines.push(m.admin_perms_tip_restricted_stale({ count: cell.editorListCount }))
			}
			break
		case 'view':
			lines.push(m.admin_perms_tip_view({ viewerName, ownerName }))
			if (cell.editorListCount > 0) {
				lines.push(m.admin_perms_tip_view_list_grants({ count: cell.editorListCount }))
			}
			break
	}
	if (cell.isPartner) lines.push(m.admin_perms_tip_partners())
	for (const label of cell.parentLabels) {
		lines.push(
			label === 'mother'
				? m.admin_perms_tip_considers_mother({ viewerName, ownerName })
				: m.admin_perms_tip_considers_father({ viewerName, ownerName })
		)
	}
	return (
		<div className="space-y-0.5">
			{lines.map((line, i) => (
				<div key={i}>{line}</div>
			))}
		</div>
	)
}

function parentLabelAria(labels: Array<RelationLabel>): string {
	const formatted = labels.map(l => (l === 'mother' ? m.admin_perms_label_mother() : m.admin_perms_label_father()))
	return m.admin_perms_relation_aria({ labels: formatted.join(' + ') })
}

function CellGlyph({ cell }: { cell: Cell }) {
	switch (cell.kind) {
		case 'self':
			return <span className="text-3xs font-semibold text-muted-foreground">{m.admin_perms_glyph_self()}</span>
		case 'guardian':
			return <Shield className="size-4" />
		case 'editor':
			return <Pencil className="size-3.5" />
		case 'denied':
			return <ShieldOff className="size-3.5" />
		case 'restricted':
			return <EyeOff className="size-3.5" />
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
				<div className="text-3xs leading-tight font-medium text-center truncate w-full" title={display}>
					{user.name?.split(' ')[0] || user.email.split('@')[0]}
				</div>
			</div>
		)
	}
	return (
		<div className="flex items-center gap-2 pr-3 pl-2 py-1.5 min-w-28 sm:min-w-44">
			<UserAvatar name={display} image={user.image} size="small" />
			<div className="flex flex-col min-w-0">
				<span className="text-xs font-medium truncate">{user.name || m.admin_users_no_name()}</span>
				<span className="hidden sm:block text-3xs text-muted-foreground truncate">{user.email}</span>
			</div>
		</div>
	)
}

function HeaderDependentCell({ name, image }: { name: string; image: string | null }) {
	return (
		<div className="flex flex-col items-center gap-1 px-1 py-2 w-12">
			<DependentAvatar name={name} image={image} size="small" />
			<div className="text-3xs leading-tight font-medium text-center truncate w-fit flex items-center gap-0.5" title={name}>
				{name.split(' ')[0]}
			</div>
		</div>
	)
}

export function PermissionsMatrixView({ data }: { data: PermissionsMatrixData }) {
	const indices = useMemo(() => buildIndices(data), [data])
	const users = data.users
	const dependents = data.dependents ?? []

	if (users.length === 0) {
		return <div className="text-sm text-muted-foreground">{m.admin_perms_empty()}</div>
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="space-y-4">
				<div className="overflow-auto rounded-md border max-h-[70vh] w-fit max-w-full">
					<table className="border-separate border-spacing-0">
						<thead>
							<tr>
								<th className="sticky left-0 top-0 z-30 bg-card border-b border-r p-2 text-left">
									<div className="flex flex-col text-3xs leading-tight text-muted-foreground">
										<span className="font-semibold">{m.admin_perms_axis_owner()}</span>
										<span className="font-semibold">{m.admin_perms_axis_viewer()}</span>
									</div>
								</th>
								{users.map(owner => (
									<th key={owner.id} className="sticky top-0 z-20 bg-card border-b align-bottom">
										<HeaderUserCell user={owner} axis="col" />
									</th>
								))}
								{dependents.map(dep => (
									<th key={`dep-${dep.id}`} className="sticky top-0 z-20 bg-card border-b align-bottom">
										<HeaderDependentCell name={dep.name} image={dep.image} />
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
											relationLabelsByUserPair: indices.relationLabelsByUserPair,
										})
										return (
											<td key={owner.id} className="p-0 border-b border-l/30">
												<TapTooltip>
													<TapTooltipTrigger asChild>
														<div
															className={cn('relative size-12 flex items-center justify-center transition-colors', cellClasses(cell.kind))}
														>
															<CellGlyph cell={cell} />
															{cell.editorListCount > 0 && cell.kind !== 'self' && (
																<span className="absolute bottom-0.5 right-1 text-4xs font-semibold text-sky-700 dark:text-sky-400">
																	+{cell.editorListCount}
																</span>
															)}
															{cell.isPartner && <Heart className="absolute top-0.5 right-0.5 size-2.5 fill-pink-500 text-pink-500" />}
															{cell.parentLabels.length > 0 && (
																<Home
																	className="absolute bottom-0.5 left-0.5 size-2.5 text-violet-500"
																	aria-label={parentLabelAria(cell.parentLabels)}
																/>
															)}
														</div>
													</TapTooltipTrigger>
													<TapTooltipContent side="top">
														<CellTooltip cell={cell} viewerName={viewer.name || viewer.email} ownerName={owner.name || owner.email} />
													</TapTooltipContent>
												</TapTooltip>
											</td>
										)
									})}
									{dependents.map(dep => {
										const cell = classifyDependentCell({
											viewerId: viewer.id,
											dependentId: dep.id,
											guardianIds: dep.guardianIds,
											relationships: indices.relationships,
											relationLabelsByDependentPair: indices.relationLabelsByDependentPair,
										})
										return (
											<td key={`dep-${dep.id}`} className="p-0 border-b border-l/30">
												<TapTooltip>
													<TapTooltipTrigger asChild>
														<div
															className={cn('relative size-12 flex items-center justify-center transition-colors', cellClasses(cell.kind))}
														>
															<CellGlyph cell={cell} />
															{cell.parentLabels.length > 0 && (
																<Home
																	className="absolute bottom-0.5 left-0.5 size-2.5 text-violet-500"
																	aria-label={parentLabelAria(cell.parentLabels)}
																/>
															)}
														</div>
													</TapTooltipTrigger>
													<TapTooltipContent side="top">
														<CellTooltip cell={cell} viewerName={viewer.name || viewer.email} ownerName={dep.name} />
													</TapTooltipContent>
												</TapTooltip>
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
		{ kind: 'guardian', label: m.admin_perms_legend_guardian(), hint: m.admin_perms_legend_guardian_hint() },
		{ kind: 'editor', label: m.admin_perms_legend_editor(), hint: m.admin_perms_legend_editor_hint() },
		{ kind: 'view', label: m.admin_perms_legend_view(), hint: m.admin_perms_legend_view_hint() },
		{ kind: 'restricted', label: m.admin_perms_legend_restricted(), hint: m.admin_perms_legend_restricted_hint() },
		{ kind: 'denied', label: m.admin_perms_legend_denied(), hint: m.admin_perms_legend_denied_hint() },
	]
	return (
		<div className="space-y-3 text-xs text-muted-foreground">
			<LegendSection title={m.admin_perms_legend_user_grants_title()}>
				{userLevelGrants.map(it => (
					<LegendItem key={it.kind} label={it.label} hint={it.hint}>
						<div className={cn('flex items-center justify-center size-6 rounded-sm', cellClasses(it.kind))}>
							<CellGlyph cell={{ kind: it.kind, editorListCount: 0, isPartner: false, parentLabels: [] }} />
						</div>
					</LegendItem>
				))}
			</LegendSection>
			<LegendSection title={m.admin_perms_legend_other_title()}>
				<LegendItem label={m.admin_perms_legend_partner()} hint={m.admin_perms_legend_partner_hint()}>
					<div className="relative size-6 rounded-sm bg-muted">
						<Heart className="absolute top-0.5 right-0.5 size-2.5 fill-pink-500 text-pink-500" />
					</div>
				</LegendItem>
				<LegendItem label={m.admin_perms_legend_parents()} hint={m.admin_perms_legend_parents_hint()}>
					<div className="relative size-6 rounded-sm bg-muted">
						<Home className="absolute bottom-0.5 left-0.5 size-2.5 text-violet-500" />
					</div>
				</LegendItem>
				{/* eslint-disable-next-line i18next/no-literal-string -- symbolic count marker */}
				<LegendItem label="+N" hint={m.admin_perms_legend_list_grants_hint()}>
					{/* eslint-disable-next-line i18next/no-literal-string -- symbolic count marker */}
					<div className="flex items-center justify-center size-6 rounded-sm bg-sky-500/15 text-sky-700 dark:text-sky-400 text-4xs font-semibold">
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
			<div className="text-3xs uppercase tracking-wide font-medium text-muted-foreground">{title}</div>
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
