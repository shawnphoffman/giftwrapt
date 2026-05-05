import { AlertTriangle, ArrowRight, Check, ExternalLink, Info, Lightbulb, Loader2, Package, Sparkles, X } from 'lucide-react'
import { useState } from 'react'

import DependentAvatar from '@/components/common/dependent-avatar'
import ListTypeIcon from '@/components/common/list-type-icon'
import UserAvatar from '@/components/common/user-avatar'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type {
	ActionIntent,
	AffectedSummary,
	AnalyzerId,
	ItemRef,
	ListRef,
	Recommendation,
	RecommendationAction,
	RecommendationSeverity,
} from './__fixtures__/types'

function listHref(list: ListRef): string {
	return `/lists/${list.id}`
}

function itemHref(item: ItemRef): string {
	return `/lists/${item.listId}#item-${item.id}`
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Renders the title with any referenced artifact names (lists, items)
// styled as italic so the reader can tell them apart from prose. Longer
// names match first so "My Wishlist" wins over "Wishlist".
function renderTitleWithRefs(title: string, names: Array<string>): React.ReactNode {
	const unique = [...new Set(names.filter(n => n.trim().length > 0))].sort((a, b) => b.length - a.length)
	if (unique.length === 0) return title
	const re = new RegExp(`(${unique.map(escapeRegex).join('|')})`, 'g')
	const refSet = new Set(unique)
	return title.split(re).map((part, i) =>
		refSet.has(part) ? (
			<em key={i} data-intelligence="title-reference" className="italic">
				{part}
			</em>
		) : (
			<span key={i}>{part}</span>
		)
	)
}

type Props = {
	rec: Recommendation
	position?: { index: number; total: number }
	onAction?: (rec: Recommendation, action: RecommendationAction) => void
	onDismiss?: (rec: Recommendation) => void
	onSelectListPicker?: (rec: Recommendation, listId: string) => void
	// True while an apply or dismiss mutation for this rec is in flight.
	// We render an overlay + lock interactions so the user can't fire a
	// second action against the same card before the first round-trips.
	pending?: boolean
}

const ANALYZER_LABEL: Record<AnalyzerId, string> = {
	'primary-list': 'Setup',
	'stale-items': 'Cleanup',
	duplicates: 'Organize',
	grouping: 'Organize',
}

type SeverityVariant = 'outline' | 'secondary' | 'destructive' | 'amber'

const SEVERITY_META: Record<
	RecommendationSeverity,
	{
		icon: React.ComponentType<{ className?: string }>
		iconClass: string
		label: string
		bar: string
		badgeVariant: SeverityVariant
		badgeClass?: string
	}
> = {
	info: {
		icon: Info,
		iconClass: 'text-muted-foreground',
		label: 'FYI',
		bar: 'bg-muted-foreground/40',
		badgeVariant: 'outline',
	},
	suggest: {
		icon: Lightbulb,
		iconClass: 'text-amber-600 dark:text-amber-400',
		label: 'Suggested',
		bar: 'bg-amber-500',
		badgeVariant: 'amber',
		badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 border-transparent',
	},
	important: {
		icon: AlertTriangle,
		iconClass: 'text-destructive',
		label: 'Important',
		bar: 'bg-destructive',
		badgeVariant: 'destructive',
	},
}

const DEFAULT_DISMISS_DESCRIPTION = "Hide this recommendation. We won't show it again unless the underlying items or lists change."

// Anything that resolves a rec (apply, destructive, noop-as-dismiss,
// explicit dismiss) goes through a confirmation. Navigation actions
// (`nav`) bypass this entirely; they don't change rec status.
type PendingConfirm = { kind: 'action'; action: RecommendationAction } | { kind: 'dismiss' }

function navHref(nav: { listId: string; itemId?: string }): string {
	return nav.itemId ? `/lists/${nav.listId}#item-${nav.itemId}` : `/lists/${nav.listId}`
}

export function RecommendationCard({ rec, position, onAction, onDismiss, onSelectListPicker, pending: busy = false }: Props) {
	const sev = SEVERITY_META[rec.severity]
	const SevIcon = sev.icon
	const dismissed = rec.status === 'dismissed'
	const applied = rec.status === 'applied'
	const inactive = dismissed || applied
	const isPicker = rec.interaction?.kind === 'list-picker'
	const dismissDescription = rec.dismissDescription ?? DEFAULT_DISMISS_DESCRIPTION
	const [pending, setPending] = useState<PendingConfirm | null>(null)

	const handleActionClick = (action: RecommendationAction) => {
		// nav actions are anchor links and never reach here, but guard
		// anyway so future callers can't accidentally route nav through
		// the confirm path.
		if (action.nav) return
		setPending({ kind: 'action', action })
	}
	const handleDismissClick = () => setPending({ kind: 'dismiss' })
	const handleConfirm = () => {
		if (!pending) return
		if (pending.kind === 'action') onAction?.(rec, pending.action)
		else onDismiss?.(rec)
		setPending(null)
	}

	return (
		<Card
			data-intelligence="recommendation-card"
			data-rec-id={rec.id}
			data-rec-analyzer={rec.analyzerId}
			data-rec-severity={rec.severity}
			data-rec-status={rec.status}
			data-rec-busy={busy ? 'true' : 'false'}
			aria-busy={busy}
			className={cn('relative overflow-hidden p-0 gap-0 transition-opacity', inactive && 'opacity-60')}
		>
			{/* Severity color bar on the left edge */}
			<div data-intelligence="severity-bar" className={cn('absolute inset-y-0 left-0 w-1', sev.bar)} aria-hidden />

			{/* Header strip */}
			<div data-intelligence="card-header" className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 pl-5">
				<Badge
					data-intelligence="card-severity-badge"
					variant={sev.badgeVariant === 'amber' ? 'outline' : sev.badgeVariant}
					className={cn('uppercase text-[10px] tracking-wide', sev.badgeClass)}
				>
					<SevIcon className="size-3" />
					{sev.label}
				</Badge>
				<span data-intelligence="card-group-label" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					{ANALYZER_LABEL[rec.analyzerId]}
				</span>
				{position && (
					<Badge
						data-intelligence="card-position-badge"
						variant="outline"
						className="ml-auto tabular-nums font-mono text-[10px] gap-0.5 bg-background/50"
						title={`Recommendation ${position.index} of ${position.total}`}
					>
						<span className="font-bold">{position.index}</span>
						<span className="text-muted-foreground/70">/</span>
						<span className="text-muted-foreground">{position.total}</span>
					</Badge>
				)}
				{applied && (
					<Badge data-intelligence="card-status-badge" variant="secondary" className={cn(position ? '' : 'ml-auto')}>
						<Check className="size-3" /> Applied
					</Badge>
				)}
				{dismissed && (
					<Badge data-intelligence="card-status-badge" variant="outline" className={cn(position ? '' : 'ml-auto')}>
						Dismissed
					</Badge>
				)}
			</div>

			{/* Body */}
			<div data-intelligence="card-body" className="px-4 py-4 pl-5 flex flex-col gap-4">
				<h3 data-intelligence="card-title" className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
					{renderTitleWithRefs(rec.title, [
						...(rec.affected?.listChips?.map(l => l.name) ?? []),
						...(rec.relatedLists?.map(l => l.name) ?? []),
						...(rec.relatedItems?.map(i => i.title) ?? []),
					])}
				</h3>

				<section data-intelligence="recommendation-section" className="rounded-md border border-border bg-card/40 overflow-hidden">
					<header
						data-intelligence="recommendation-heading"
						className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						Recommendation
					</header>
					<div data-intelligence="recommendation-body" className="px-4 py-3">
						<p data-intelligence="card-body-text" className="text-sm leading-relaxed">
							{rec.body}
						</p>
					</div>
				</section>

				{rec.affected && <AffectedPanel affected={rec.affected} relatedItems={rec.relatedItems} />}

				{!inactive && isPicker && rec.interaction?.kind === 'list-picker' && (
					<ListPickerInteraction
						eligibleLists={rec.interaction.eligibleLists}
						saveLabel={rec.interaction.saveLabel}
						onSave={listId => onSelectListPicker?.(rec, listId)}
					/>
				)}

				{!inactive && !isPicker && (
					<ActionsSection
						actions={rec.actions ?? []}
						dismissDescription={dismissDescription}
						onAction={handleActionClick}
						onDismiss={handleDismissClick}
					/>
				)}

				{!inactive && isPicker && onDismiss && (
					<ActionsSection actions={[]} dismissDescription={dismissDescription} onAction={() => undefined} onDismiss={handleDismissClick} />
				)}
			</div>

			<RecommendationConfirmDialog
				rec={rec}
				pending={pending}
				dismissDescription={dismissDescription}
				onCancel={() => setPending(null)}
				onConfirm={handleConfirm}
			/>

			{busy && (
				<div
					data-intelligence="card-busy-overlay"
					className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-background/70 backdrop-blur-[1px]"
					role="status"
					aria-live="polite"
				>
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-xs font-medium text-muted-foreground">Applying…</span>
				</div>
			)}
		</Card>
	)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RecommendationConfirmDialog({
	rec,
	pending,
	dismissDescription,
	onCancel,
	onConfirm,
}: {
	rec: Recommendation
	pending: PendingConfirm | null
	dismissDescription: string
	onCancel: () => void
	onConfirm: () => void
}) {
	const action = pending?.kind === 'action' ? pending.action : null
	// Noop intent (e.g. "Keep both" / "Keep separate") is treated as an
	// explicit dismiss in the route handler, so the dialog mirrors that.
	const isDismissLike = pending?.kind === 'dismiss' || action?.intent === 'noop'
	const isDestructive = action?.intent === 'destructive'
	const title = isDismissLike ? 'Dismiss this suggestion?' : (action?.label ?? 'Confirm action')
	const body = isDismissLike
		? (action?.confirmCopy ?? action?.description ?? dismissDescription)
		: (action?.confirmCopy ?? action?.description ?? 'This will resolve the suggestion.')
	const confirmLabel = isDismissLike ? 'Dismiss' : (action?.label ?? 'Confirm')
	const confirmClass = isDestructive
		? buttonVariants({ variant: 'destructive' })
		: cn(
				buttonVariants({ variant: 'default' }),
				'bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white'
			)

	return (
		<AlertDialog
			open={pending !== null}
			onOpenChange={open => {
				if (!open) onCancel()
			}}
		>
			<AlertDialogContent data-intelligence="confirm-dialog" data-confirm-kind={pending?.kind ?? 'none'}>
				<AlertDialogHeader>
					<AlertDialogTitle data-intelligence="confirm-title">{title}</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div data-intelligence="confirm-body" className="flex flex-col gap-2 text-sm">
							<span>{body}</span>
							<span data-intelligence="confirm-rec-title" className="text-muted-foreground italic">
								{rec.title}
							</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel data-intelligence="confirm-cancel">Cancel</AlertDialogCancel>
					<AlertDialogAction data-intelligence="confirm-confirm" className={confirmClass} onClick={onConfirm}>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function AffectedPanel({ affected, relatedItems }: { affected: AffectedSummary; relatedItems?: Array<ItemRef> }) {
	const lists = affected.listChips ?? []
	const items = relatedItems ?? []
	const hasReferences = lists.length > 0 || items.length > 0

	return (
		<section data-intelligence="affected-panel" className="rounded-md border border-border bg-card/40 overflow-hidden">
			<header data-intelligence="affected-heading" className="flex items-center justify-between gap-2 bg-muted/30 px-3 py-1.5">
				<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Context</span>
				<span data-intelligence="affected-count" className="text-[11px] tabular-nums text-muted-foreground">
					{affected.count} {affected.noun}
				</span>
			</header>
			<div data-intelligence="affected-body" className="px-3 py-2.5">
				<ul data-intelligence="affected-lines" className="flex flex-col gap-1">
					{affected.lines.map((line, i) => (
						<li key={i} data-intelligence="affected-line" className="text-sm flex gap-2">
							<span className="text-muted-foreground/60 select-none">·</span>
							<span className="leading-snug">{line}</span>
						</li>
					))}
				</ul>
			</div>
			{hasReferences && (
				<div data-intelligence="affected-references" className="border-t border-border/40">
					<div
						data-intelligence="affected-references-heading"
						className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
					>
						References
					</div>
					<div data-intelligence="affected-references-body" className="px-3 py-2 flex flex-wrap gap-1.5">
						{lists.map(list => (
							<ListReferenceLink key={`list-${list.id}`} list={list} />
						))}
						{items.map(it => (
							<ItemReferenceLink key={`item-${it.id}`} item={it} />
						))}
					</div>
				</div>
			)}
		</section>
	)
}

// All reference chips share this shell so they have a uniform height,
// driven by the leading avatar slot. The avatar slot is mandatory; for
// items without an image we render a Package fallback inside an Avatar
// so the chip is the same height as a list chip with a real avatar.
const REFERENCE_CHIP_CLASS =
	'group/ref inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 pl-1 pr-2 py-0.5 text-xs hover:bg-muted/60 hover:border-foreground/30 transition-colors'

function ListReferenceLink({ list }: { list: ListRef }) {
	return (
		<a
			data-intelligence="list-reference"
			data-list-id={list.id}
			data-list-type={list.type}
			href={listHref(list)}
			target="_blank"
			rel="noopener"
			className={REFERENCE_CHIP_CLASS}
		>
			{list.subject.kind === 'dependent' ? (
				<DependentAvatar name={list.subject.name} image={list.subject.image} size="small" />
			) : (
				<UserAvatar name={list.subject.name} image={list.subject.image} size="small" />
			)}
			<ListTypeIcon type={list.type} className="size-3.5" />
			<span className="font-medium truncate max-w-[12rem]">{list.name}</span>
			<ExternalLink className="size-3 text-muted-foreground/70 group-hover/ref:text-foreground" />
		</a>
	)
}

function ItemReferenceLink({ item }: { item: ItemRef }) {
	return (
		<a
			data-intelligence="item-reference"
			data-item-id={item.id}
			data-item-list-id={item.listId}
			href={itemHref(item)}
			target="_blank"
			rel="noopener"
			className={REFERENCE_CHIP_CLASS}
		>
			<ItemAvatar item={item} />
			<span className="font-medium truncate max-w-[16rem]">{item.title}</span>
			<span className="text-muted-foreground">in {item.listName}</span>
			<ExternalLink className="size-3 text-muted-foreground/70 group-hover/ref:text-foreground" />
		</a>
	)
}

function ItemAvatar({ item }: { item: ItemRef }) {
	return (
		<Avatar className="size-6">
			{item.imageUrl && <AvatarImage src={item.imageUrl} alt={item.title} />}
			<AvatarFallback className="bg-muted text-muted-foreground">
				<Package className="size-3" />
			</AvatarFallback>
		</Avatar>
	)
}

function ActionsSection({
	actions,
	dismissDescription,
	onAction,
	onDismiss,
}: {
	actions: Array<RecommendationAction>
	dismissDescription: string
	onAction: (action: RecommendationAction) => void
	onDismiss: () => void
}) {
	return (
		<section data-intelligence="actions-section" className="rounded-md border border-border bg-card/40 overflow-hidden">
			<header
				data-intelligence="actions-heading"
				className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
			>
				Actions
			</header>
			<ul data-intelligence="actions-list" className="divide-y divide-border/60">
				{actions.map((action, i) => (
					<ActionRow key={i} action={action} onClick={() => onAction(action)} />
				))}
				<DismissRow description={dismissDescription} onClick={onDismiss} />
			</ul>
		</section>
	)
}

function ActionRow({ action, onClick }: { action: RecommendationAction; onClick: () => void }) {
	return (
		<li
			data-intelligence="action-row"
			data-action-intent={action.intent}
			className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
		>
			<p data-intelligence="action-description" className="flex-1 text-sm leading-snug">
				{action.description}
			</p>
			<ActionButton action={action} onClick={onClick} />
		</li>
	)
}

function ActionButton({ action, onClick }: { action: RecommendationAction; onClick: () => void }) {
	if (action.nav) {
		return <LinkButton label={action.label} href={navHref(action.nav)} intent={action.intent} />
	}
	if (action.intent === 'ai') {
		return <AiButton label={action.label} onClick={onClick} />
	}
	if (action.intent === 'do') {
		return <DoButton label={action.label} onClick={onClick} />
	}
	if (action.intent === 'destructive') {
		return (
			<Button
				data-intelligence="action-button"
				data-action-intent="destructive"
				size="sm"
				variant="destructive"
				className="self-start sm:self-center sm:shrink-0"
				onClick={onClick}
			>
				<ArrowRight className="size-3.5" />
				{action.label}
			</Button>
		)
	}
	// noop
	return (
		<Button
			data-intelligence="action-button"
			data-action-intent="noop"
			size="sm"
			variant="outline"
			className="self-start sm:self-center sm:shrink-0"
			onClick={onClick}
		>
			<ArrowRight className="size-3.5" />
			{action.label}
		</Button>
	)
}

function LinkButton({ label, href, intent }: { label: string; href: string; intent: ActionIntent }) {
	return (
		<a
			data-intelligence="action-button"
			data-action-intent={intent}
			data-action-link
			href={href}
			target="_blank"
			rel="noopener"
			className={cn(
				ACTION_BTN_BASE,
				'bg-emerald-600 ring-1 ring-emerald-500/50 shadow-sm',
				'dark:bg-emerald-700 dark:ring-emerald-600/50',
				'transition-all duration-150',
				'hover:bg-emerald-500 hover:ring-emerald-400/70 hover:shadow-md hover:shadow-emerald-500/30 hover:-translate-y-px',
				'dark:hover:bg-emerald-600 dark:hover:ring-emerald-500/70',
				'active:translate-y-0 active:shadow-sm',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
			)}
		>
			<ExternalLink className="size-3.5" />
			{label}
		</a>
	)
}

// Visually match shadcn `Button size="sm"`: h-8 gap-1 px-2.5 text-sm font-medium rounded-md.
const ACTION_BTN_BASE =
	'inline-flex h-8 shrink-0 items-center gap-1 self-start sm:self-center rounded-md px-2.5 text-sm font-medium text-white whitespace-nowrap'

function DoButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			data-intelligence="action-button"
			data-action-intent="do"
			onClick={onClick}
			className={cn(
				ACTION_BTN_BASE,
				'bg-emerald-600 ring-1 ring-emerald-500/50 shadow-sm',
				'dark:bg-emerald-700 dark:ring-emerald-600/50',
				'transition-all duration-150',
				'hover:bg-emerald-500 hover:ring-emerald-400/70 hover:shadow-md hover:shadow-emerald-500/30 hover:-translate-y-px',
				'dark:hover:bg-emerald-600 dark:hover:ring-emerald-500/70',
				'active:translate-y-0 active:shadow-sm',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
			)}
		>
			<ArrowRight className="size-3.5" />
			{label}
		</button>
	)
}

function AiButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			data-intelligence="action-button"
			data-action-intent="ai"
			onClick={onClick}
			className={cn(
				'group/ai-btn relative',
				ACTION_BTN_BASE,
				'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600',
				'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
				'shadow-sm ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40',
				'transition-all duration-200',
				'hover:from-amber-400 hover:via-pink-400 hover:to-fuchsia-500 hover:shadow-md hover:shadow-fuchsia-500/40 hover:ring-fuchsia-300/60 hover:-translate-y-px',
				'dark:hover:from-amber-600 dark:hover:via-pink-600 dark:hover:to-fuchsia-700 dark:hover:ring-fuchsia-500/60',
				'active:translate-y-0 active:shadow-sm',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400'
			)}
		>
			<Sparkles
				className={cn(
					'size-3.5 text-amber-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]',
					'animate-pulse',
					'transition-transform duration-300 group-hover/ai-btn:rotate-12 group-hover/ai-btn:scale-125 group-hover/ai-btn:text-yellow-200'
				)}
			/>
			{label}
		</button>
	)
}

function DismissRow({ description, onClick }: { description: string; onClick: () => void }) {
	return (
		<li
			data-intelligence="action-row"
			data-action-kind="dismiss"
			className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4"
		>
			<p data-intelligence="action-description" className="flex-1 text-sm leading-snug">
				{description}
			</p>
			<Button
				data-intelligence="dismiss-button"
				size="sm"
				variant="outline"
				className="self-start sm:self-center sm:shrink-0"
				onClick={onClick}
			>
				<X className="size-3.5" />
				Dismiss
			</Button>
		</li>
	)
}

function ListPickerInteraction({
	eligibleLists,
	saveLabel,
	onSave,
}: {
	eligibleLists: Array<ListRef>
	saveLabel: string
	onSave: (listId: string) => void
}) {
	const [listId, setListId] = useState<string>('')

	if (eligibleLists.length === 0) {
		return (
			<div
				data-intelligence="list-picker-empty"
				className="rounded-md border border-border bg-card/40 px-3 py-2.5 text-sm text-muted-foreground"
			>
				No eligible lists. Create a wishlist first.
			</div>
		)
	}

	const selected = eligibleLists.find(l => l.id === listId)

	return (
		<section data-intelligence="list-picker" className="rounded-md border border-border bg-card/40 overflow-hidden">
			<header
				data-intelligence="list-picker-heading"
				className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
			>
				Choose a list
			</header>
			<div data-intelligence="list-picker-body" className="px-3 py-3 flex flex-col gap-2">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Select value={listId} onValueChange={setListId}>
						<SelectTrigger data-intelligence="list-picker-trigger" className="w-full sm:w-[18rem]">
							<SelectValue placeholder="Select a list…" />
						</SelectTrigger>
						<SelectContent>
							{eligibleLists.map(list => (
								<SelectItem key={list.id} value={list.id}>
									<span className="font-medium">{list.name}</span>
									<span className="text-muted-foreground ml-2 text-xs">{list.type}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<button
						type="button"
						data-intelligence="list-picker-save"
						data-action-intent="do"
						disabled={!selected}
						onClick={() => selected && onSave(selected.id)}
						className={cn(
							'inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-white whitespace-nowrap',
							'bg-emerald-600 ring-1 ring-emerald-500/50 shadow-sm',
							'dark:bg-emerald-700 dark:ring-emerald-600/50',
							'transition-all duration-150',
							'hover:bg-emerald-500 hover:ring-emerald-400/70 hover:shadow-md hover:shadow-emerald-500/30 hover:-translate-y-px',
							'dark:hover:bg-emerald-600 dark:hover:ring-emerald-500/70',
							'active:translate-y-0 active:shadow-sm',
							'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
							'disabled:opacity-50 disabled:pointer-events-none'
						)}
					>
						<ArrowRight className="size-3.5" />
						{saveLabel}
					</button>
				</div>
				{selected && (
					<p data-intelligence="list-picker-preview" className="text-xs text-muted-foreground">
						"{selected.name}" will be marked as your primary list. You can change this later from the list view.
					</p>
				)}
			</div>
		</section>
	)
}
