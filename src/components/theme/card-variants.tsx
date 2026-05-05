import { Cake, Check, ChevronRight, Gift, Lock, MoreHorizontal, PackageOpen, PackagePlus, Smartphone, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const SECTION_GAP = 'flex flex-col gap-3'

function CodeSnippet({ snippet }: { snippet: string }) {
	return (
		<details className="group/code rounded-md ring-1 ring-foreground/10 bg-background/60 overflow-hidden">
			<summary className="cursor-pointer select-none list-none flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
				<ChevronRight className="size-3 transition-transform group-open/code:rotate-90" />
				Show code
			</summary>
			<pre className="text-[11px] font-mono leading-snug p-2 pt-0 overflow-x-auto whitespace-pre">{snippet}</pre>
		</details>
	)
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
	return (
		<section className={SECTION_GAP}>
			<div>
				<h4 className="font-semibold">{title}</h4>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{children}
		</section>
	)
}

type SeenIn = { where: string; what: string }

type CardVariant = {
	id: 'section' | 'dense' | 'hero-gradient' | 'metric-tile' | 'state' | 'legacy'
	name: string
	when: string
	notWhen?: string
	snippet: string
	render: () => React.ReactElement
	seenIn: Array<SeenIn>
}

const CARD_VARIANTS: Array<CardVariant> = [
	{
		id: 'section',
		name: 'Section',
		when: 'Default. Top-level labeled chunk on a page. Header carries the title; body holds the section content.',
		notWhen: "Don't inline an <h2> in CardContent or override the default px-6 padding without a real reason.",
		snippet: `<Card>
  <CardHeader>
    <CardTitle>Audience</CardTitle>
    <CardDescription>Eligible users for this run</CardDescription>
  </CardHeader>
  <CardContent>{...}</CardContent>
</Card>`,
		render: () => (
			<Card>
				<CardHeader>
					<CardTitle>Audience</CardTitle>
					<CardDescription>Eligible users for this run</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">42 users overdue for a refresh, 6 gated by unread recs.</p>
				</CardContent>
			</Card>
		),
		seenIn: [
			{ where: 'routes/(core)/admin/users.tsx', what: 'every admin section: Impersonation, Users, Dependents, Permissions matrix.' },
			{ where: 'routes/(core)/admin/index.tsx', what: 'app-settings, list-type, and comments sections on the admin dashboard.' },
			{ where: 'components/admin/ai-features-card.tsx', what: 'AI features toggles under the provider config.' },
		],
	},
	{
		id: 'dense',
		name: 'Dense',
		when: 'Same shape as Section but tighter padding (size="sm"). Use for nested sub-cards or grids of 3+ peer cards.',
		notWhen: 'Top-level page sections are always Section, not Dense.',
		snippet: `<Card size="sm">
  <CardHeader>
    <CardTitle>Active recs</CardTitle>
    <CardDescription>across 4 analyzers</CardDescription>
  </CardHeader>
  <CardContent>{...}</CardContent>
</Card>`,
		render: () => (
			<Card size="sm">
				<CardHeader>
					<CardTitle>Active recs</CardTitle>
					<CardDescription>across 4 analyzers</CardDescription>
				</CardHeader>
				<CardContent>
					<span className="text-2xl font-bold tabular-nums">17</span>
				</CardContent>
			</Card>
		),
		seenIn: [
			{ where: 'components/purchases/purchases-page.tsx', what: 'MetricsGroup wrappers for spend, claims, and per-recipient roll-ups.' },
			{
				where: 'components/intelligence/admin-intelligence-sections.tsx',
				what: 'sub-cards for analyzer health and run cadence under a parent Section.',
			},
			{ where: 'components/intelligence/run-detail.tsx', what: 'per-step cards in the run timeline.' },
		],
	},
	{
		id: 'hero-gradient',
		name: 'Hero gradient',
		when: 'A featured surface like a feature toggle or call-to-action. Pairs the AI brand gradient with white text.',
		notWhen: 'Limit one per page. Stacking gradients dilutes them. Use Section for the rest.',
		snippet: `<Card
  className={cn(
    'border-transparent shadow-md shadow-fuchsia-500/20',
    'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40',
    'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600',
    'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
  )}
>
  <CardHeader>
    <CardTitle className="text-white drop-shadow-sm">Intelligence</CardTitle>
    <CardDescription className="text-white/95">{...}</CardDescription>
  </CardHeader>
  <CardContent className="text-white/95">{...}</CardContent>
</Card>`,
		render: () => (
			<Card
				className={cn(
					'border-transparent shadow-md shadow-fuchsia-500/20',
					'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40',
					'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600',
					'dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800'
				)}
			>
				<CardHeader>
					<CardTitle className="text-white drop-shadow-sm">Intelligence</CardTitle>
					<CardDescription className="text-white/95">Recommendations are flowing.</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-white/95">Cron is delivering fresh insights.</p>
				</CardContent>
			</Card>
		),
		seenIn: [
			{ where: 'components/intelligence/intelligence-page.tsx', what: 'the AI brand hero on the user-facing Suggestions page.' },
			{
				where: 'components/intelligence/admin-intelligence-page.tsx',
				what: 'the brand hero at the top of the admin Intelligence dashboard.',
			},
		],
	},
	{
		id: 'metric-tile',
		name: 'Metric tile',
		when: 'A single statistic in a hero row, often translucently gradient-filled. Always shows a number as its primary content.',
		notWhen: 'If the body is anything other than a single value, reach for Dense instead.',
		snippet: `<Card size="sm" className="bg-gradient-to-br from-cyan-400/40 via-sky-400/30 to-blue-500/40">
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Icon className="size-5" /> Total
    </CardTitle>
    <CardDescription className="text-foreground/50">…</CardDescription>
  </CardHeader>
  <CardContent>
    <span className="text-3xl font-bold tabular-nums">42</span>
  </CardContent>
</Card>`,
		render: () => (
			<Card size="sm" className="bg-gradient-to-br from-cyan-400/40 via-sky-400/30 to-blue-500/40">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<PackageOpen className="size-5" />
						Total
					</CardTitle>
					<CardDescription className="text-foreground/50">Items received this year</CardDescription>
				</CardHeader>
				<CardContent>
					<span className="text-3xl font-bold tabular-nums">42</span>
				</CardContent>
			</Card>
		),
		seenIn: [
			{
				where: 'components/received/received-page.tsx',
				what: 'the three-up hero row (cyan items / pink gifts / violet off-list addons) above the received-gifts feed.',
			},
			{
				where: 'components/purchases/purchases-page.tsx',
				what: 'the per-metric cells inside MetricsGroup (spend, claim count, recipient roll-ups).',
			},
		],
	},
	{
		id: 'state',
		name: 'Empty / state',
		when: 'Placeholder for a non-data state: feature off, no provider, error gate. Centered muted text, no header.',
		notWhen: 'If the user can act on this card, use Section so they have a title to anchor to.',
		snippet: `<Card>
  <CardContent className="p-6 text-center text-sm text-muted-foreground">
    Settings are hidden until an AI provider is configured.
  </CardContent>
</Card>`,
		render: () => (
			<Card>
				<CardContent className="p-6 text-center text-sm text-muted-foreground">
					Settings are hidden until an AI provider is configured.
				</CardContent>
			</Card>
		),
		seenIn: [
			{
				where: 'components/intelligence/admin-intelligence-page.tsx',
				what: 'the "no AI provider configured" / "feature offline" gates that hide the rest of the dashboard.',
			},
			{
				where: 'components/intelligence/intelligence-page.tsx',
				what: 'the user-facing "Suggestions are off" placeholder when the feature is disabled.',
			},
			{ where: 'components/admin/ai-features-card.tsx', what: 'the loading and "no settings found" fallbacks before data resolves.' },
		],
	},
	{
		id: 'legacy',
		name: 'Legacy bare Card (deprecated)',
		when: "Inherited shape: <Card> + <CardContent> with an inline heading. Most existing consumers look like this. Don't add new instances; migrate to Section when you're already in the file.",
		snippet: `<Card>
  <CardContent className="p-4">
    <h2 className="text-lg font-semibold">Section</h2>
    <p className="text-sm text-muted-foreground">…</p>
  </CardContent>
</Card>`,
		render: () => (
			<Card>
				<CardContent className="p-4">
					<h2 className="text-lg font-semibold">Section</h2>
					<p className="text-sm text-muted-foreground mt-1">Inline heading defeats the slot semantics. Avoid in new code.</p>
				</CardContent>
			</Card>
		),
		seenIn: [
			{
				where: 'older settings and admin tabs',
				what: 'pre-Section consumers that still inline an h2 inside CardContent. Migrate them when you next touch the file.',
			},
		],
	},
]

type Outlier = {
	id: string
	name: string
	files: Array<string>
	howItDiffers: string
	snippet: string
	render?: () => React.ReactElement
}

const OUTLIERS: Array<Outlier> = [
	{
		id: 'recommendation-card',
		name: 'RecommendationCard',
		files: ['components/intelligence/recommendation-card.tsx'],
		howItDiffers:
			'Strips Card padding entirely (p-0 gap-0) and rebuilds the interior with a left-edge severity bar, a muted-strip header band, and bordered "Recommendation" / "Affected" / "Actions" sub-sections. None of the Card sub-components are used; they would fight the custom layout.',
		snippet: `<Card className={cn('relative overflow-hidden p-0 gap-0', inactive && 'opacity-60')}>
  <div className={cn('absolute inset-y-0 left-0 w-1', sev.bar)} aria-hidden />
  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 pl-5">
    <Badge variant={sev.badgeVariant}>{sev.label}</Badge>
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{groupLabel}</span>
  </div>
  <div className="px-4 py-4 pl-5 flex flex-col gap-4">
    <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold">{title}</h3>
    <section className="rounded-md border bg-card/40">{...recommendation body}</section>
    {affected && <AffectedPanel ... />}
    <ActionsSection ... />
  </div>
</Card>`,
		render: () => (
			<Card className="relative overflow-hidden p-0 gap-0">
				<div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
				<div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 pl-5">
					<Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 uppercase text-[10px] tracking-wide">
						<Sparkles className="size-3" />
						Suggest
					</Badge>
					<span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stale items</span>
				</div>
				<div className="px-4 py-4 pl-5 flex flex-col gap-4">
					<h3 className="text-xl font-bold leading-tight tracking-tight">Three items have been sitting on Christmas for months</h3>
					<section className="rounded-md border border-border bg-card/40 overflow-hidden">
						<header className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							Recommendation
						</header>
						<div className="px-4 py-3 text-sm leading-relaxed">Trim them or move them to a wishlist so the list reads fresh.</div>
					</section>
				</div>
			</Card>
		),
	},
	{
		id: 'lists-for-user',
		name: 'ListsForUser / ListsForDependent',
		files: ['components/lists/lists-for-user.tsx', 'components/lists/lists-for-dependent.tsx'],
		howItDiffers:
			'Compact (py-4 gap-2) with overflow-visible + relative + hover:z-10 so a hover-scaled avatar can break out of the card and float above its neighbors. Sets size manually rather than via size="sm" because the title is bumped up to text-2xl.',
		snippet: `<Card className="group/user-card py-4 gap-2 overflow-visible relative hover:z-10">
  <CardHeader className="px-4 flex items-center gap-3">
    <UserAvatar
      className="border-2 border-background origin-bottom transition-transform
                 group-hover/user-card:scale-150 group-hover/user-card:-rotate-6"
    />
    <CardTitle className="text-2xl font-semibold">{user.name}</CardTitle>
    <BirthdayBadge ... />
  </CardHeader>
  <CardContent className="px-4">{lists.map(...)}</CardContent>
</Card>`,
		render: () => (
			<Card className="group/user-card py-4 gap-2 overflow-visible relative hover:z-10 max-w-sm">
				<CardHeader className="px-4 flex flex-row items-center gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-pink-400 to-fuchsia-500 text-sm font-semibold text-white origin-bottom transition-transform group-hover/user-card:scale-150 group-hover/user-card:-rotate-6">
						DH
					</div>
					<CardTitle className="text-2xl font-semibold">Diana</CardTitle>
					<Badge variant="outline" className="ml-auto gap-1">
						<Cake className="size-3" />
						Apr 18
					</Badge>
				</CardHeader>
				<CardContent className="px-4 flex flex-col gap-0">
					<div className="rounded p-2 hover:bg-muted flex items-center justify-between text-sm">
						<span>Birthday 2026</span>
						<ChevronRight className="size-4 text-muted-foreground" />
					</div>
					<div className="rounded p-2 hover:bg-muted flex items-center justify-between text-sm">
						<span>Christmas</span>
						<ChevronRight className="size-4 text-muted-foreground" />
					</div>
				</CardContent>
			</Card>
		),
	},
	{
		id: 'lists-card',
		name: 'ListsCard primitives',
		files: ['components/lists/lists-card.tsx'],
		howItDiffers:
			'A second tier of Card primitives that re-export <Card>/<CardHeader>/<CardTitle>/<CardContent> with project-specific overrides (py-4 gap-2 shell, row-flex header at px-4, gap-0 list region with hover-rows). It is not a Card variant in the strict sense but it is consumed everywhere a list-of-lists tile appears (My Lists, Public Lists).',
		snippet: `function ListsCard(props) {
  return <Card data-slot="lists-card" className="py-4 gap-2" {...props} />
}
function ListsCardHeader(props) {
  return <CardHeader className="flex flex-row items-center gap-3 px-4" {...props} />
}
function ListsCardLists(props) {
  return <CardContent className="flex flex-col gap-0 px-4" {...props} />
}
function ListsCardList(props) {
  return <div className="rounded p-2 bg-transparent hover:bg-muted ..." {...props} />
}`,
		render: () => (
			<Card data-slot="lists-card" className="py-4 gap-2 max-w-sm">
				<CardHeader className="flex flex-row items-center gap-3 px-4">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
						SH
					</div>
					<CardTitle className="text-xl font-semibold">Shawn</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-0 px-4">
					<div className="rounded p-2 bg-transparent hover:bg-muted flex items-center justify-between text-sm">
						<span>Wishlist</span>
						<span className="text-xs text-muted-foreground">12 items</span>
					</div>
					<div className="rounded p-2 bg-transparent hover:bg-muted flex items-center justify-between text-sm">
						<span>Birthday 2026</span>
						<span className="text-xs text-muted-foreground">5 items</span>
					</div>
					<div className="rounded p-2 bg-transparent hover:bg-muted flex items-center justify-between text-sm">
						<span>Christmas</span>
						<span className="text-xs text-muted-foreground">8 items</span>
					</div>
				</CardContent>
			</Card>
		),
	},
	{
		id: 'settings-shell',
		name: 'Settings route shell',
		files: ['routes/(core)/settings/route.tsx'],
		howItDiffers:
			'Empty <Card> used purely as a layout container. No header, no content slot, no children other than <Outlet />. The only className is @container/subpage so child pages can run @container queries against this shell.',
		snippet: `<div className="grid gap-6 animate-page-in">
  <Card className="@container/subpage">
    <Outlet />
  </Card>
</div>`,
		render: () => (
			<div className="grid gap-6">
				<Card className="@container/subpage">
					<CardHeader>
						<CardTitle>Profile</CardTitle>
						<CardDescription>This shell holds whichever settings sub-page is active.</CardDescription>
					</CardHeader>
					<CardContent className="text-sm text-muted-foreground">
						Sub-pages render their own CardHeader / CardContent directly into this shell (see next outlier).
					</CardContent>
				</Card>
			</div>
		),
	},
	{
		id: 'settings-subpage-without-card',
		name: 'Settings sub-pages: CardHeader / CardContent without a Card',
		files: [
			'routes/(core)/settings/index.tsx',
			'routes/(core)/settings/security.tsx',
			'routes/(core)/settings/devices.tsx',
			'routes/(core)/settings/dependents.tsx',
			'routes/(core)/settings/permissions.tsx',
		],
		howItDiffers:
			'Direct child of a plain <div>, not a <Card>. The settings route shell above provides the card chrome; each sub-page renders only the slots. This breaks the "Card is a component, not a layout" rule and only works because the parent shell exists.',
		snippet: `<div className="animate-page-in gap-6 flex flex-col">
  <CardHeader>
    <CardTitle className="text-2xl">Profile</CardTitle>
    <CardDescription>Update your profile information.</CardDescription>
  </CardHeader>
  <CardContent>{...}</CardContent>
</div>`,
		render: () => (
			<div className="rounded-xl border bg-card text-card-foreground">
				<div className="gap-6 flex flex-col">
					<CardHeader>
						<CardTitle className="text-2xl">Profile</CardTitle>
						<CardDescription>Update your profile information.</CardDescription>
					</CardHeader>
					<CardContent className="text-sm text-muted-foreground">
						The wrapping border / bg-card is the Settings route shell; this sub-page only renders the slots.
					</CardContent>
				</div>
			</div>
		),
	},
	{
		id: 'admin-debug-divide-y',
		name: 'Admin debug key/value rows',
		files: ['routes/(core)/admin/debug.tsx'],
		howItDiffers:
			'Standard Section shape, but CardContent gets divide-y and renders a list of key/value rows instead of free-form content. Each row uses not-first:pt-1 not-last:pb-1 to flush against the divider. Effectively a CardFooter-less alternative to the bordered-header pattern.',
		snippet: `<Card>
  <CardHeader><CardTitle>Build Info</CardTitle></CardHeader>
  <CardContent className="divide-y">
    {entries.map(([key, value]) => (
      <div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1">
        <span className="font-mono text-xs">{key}</span>
        <span className="font-mono text-xs">{value}</span>
      </div>
    ))}
  </CardContent>
</Card>`,
		render: () => (
			<Card>
				<CardHeader>
					<CardTitle>Build Info</CardTitle>
				</CardHeader>
				<CardContent className="divide-y">
					{(
						[
							['commitSha', 'fedfa63'],
							['nodeVersion', 'v22.11.0'],
							['deploy', 'preview'],
						] as const
					).map(([key, value]) => (
						<div key={key} className="flex flex-col w-full not-first:pt-1 not-last:pb-1">
							<span className="font-mono text-xs text-muted-foreground">{key}</span>
							<span className="font-mono text-xs">{value}</span>
						</div>
					))}
				</CardContent>
			</Card>
		),
	},
	{
		id: 'permissions-grid',
		name: 'Permissions matrix grid',
		files: ['routes/(core)/settings/permissions.tsx'],
		howItDiffers:
			'CardContent wraps a grid-cols-[auto_auto] table where each row uses display: contents so its children participate directly in the outer grid. This keeps the Person and Access columns aligned across every row without nesting <table>. The card itself is fine, the row layout is the unusual part.',
		snippet: `<CardContent>
  <div className="grid min-w-max grid-cols-[auto_auto] divide-y">
    <div className="contents text-xs font-medium uppercase">
      <span className="px-4 py-2">Person</span>
      <span className="px-4 py-2">Access</span>
    </div>
    {rows.map(row => (
      <div key={row.id} className="contents">
        <div className="flex items-center gap-3 px-4 py-3">{...person}</div>
        <div className="flex items-center px-4 py-3">{...access toggle}</div>
      </div>
    ))}
  </div>
</CardContent>`,
		render: () => (
			<Card>
				<CardHeader>
					<CardTitle>Permissions</CardTitle>
					<CardDescription>Who can see your lists.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid min-w-max grid-cols-[auto_auto] divide-y">
						<div className="contents text-xs font-medium uppercase text-muted-foreground">
							<span className="px-4 py-2">Person</span>
							<span className="px-4 py-2">Access</span>
						</div>
						{(
							[
								{ id: 'a', name: 'Diana', access: 'View' },
								{ id: 'b', name: 'Mom', access: 'Restricted' },
								{ id: 'c', name: 'Cousin Pat', access: 'None' },
							] as const
						).map(row => (
							<div key={row.id} className="contents">
								<div className="flex items-center gap-3 px-4 py-3">
									<div className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">{row.name[0]}</div>
									<span className="text-sm">{row.name}</span>
								</div>
								<div className="flex items-center px-4 py-3">
									<Badge variant="outline">{row.access}</Badge>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		),
	},
	{
		id: 'card-with-action',
		name: 'CardAction header slot',
		files: ['components/ui/card.tsx'],
		howItDiffers:
			'Provided by the primitive (CardAction) but currently unused in app code. The header layout adapts via has-data-[slot=card-action]:grid-cols-[1fr_auto], so when an app surface needs a top-right menu next to a CardTitle it should reach for this slot rather than absolute-positioning a button.',
		snippet: `<Card>
  <CardHeader>
    <CardTitle>Header with action</CardTitle>
    <CardDescription>CardAction slots to the right of the title.</CardDescription>
    <CardAction>
      <DropdownMenu>{...}</DropdownMenu>
    </CardAction>
  </CardHeader>
  <CardContent>{...}</CardContent>
</Card>`,
		render: () => (
			<Card>
				<CardHeader>
					<CardTitle>Header with action</CardTitle>
					<CardDescription>CardAction slots to the right of the title.</CardDescription>
					<div data-slot="card-action" className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
						<button
							type="button"
							aria-label="Card actions"
							className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
						>
							<MoreHorizontal className="size-4" />
						</button>
					</div>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">Useful when the card needs a menu or overflow control.</CardContent>
			</Card>
		),
	},
	{
		id: 'card-shaped-not-card',
		name: 'Card-shaped surfaces that are not <Card>',
		files: ['routes/(core)/settings/devices.tsx'],
		howItDiffers:
			'Renders <li> with rounded-lg border bg-card px-4 py-3 hover:bg-muted/40 to look exactly like a Card row, but stays as a list item for semantic markup. If a future card needs to live inside a <ul>, copy this shape rather than nesting <Card> in <li>.',
		snippet: `<li className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3
              transition-colors hover:bg-muted/40">
  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
    <Smartphone className="size-5" />
  </div>
  <div className="min-w-0 flex-1">{...device meta}</div>
</li>`,
		render: () => (
			<ul className="flex flex-col gap-2 list-none p-0">
				<li className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
						<Smartphone className="size-5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium">Shawn's iPhone</div>
						<div className="text-xs text-muted-foreground">Passkey added 3 days ago</div>
					</div>
				</li>
			</ul>
		),
	},
]

export default function CardVariants() {
	return (
		<div className="flex flex-col gap-10">
			<header className="flex flex-col gap-1">
				<h2 className="text-2xl font-semibold tracking-tight">Card variants</h2>
				<p className="text-sm text-muted-foreground">
					Six canonical Card shapes plus the ones that wander off the path. Pick a canonical variant before reaching for the primitive.
					Outliers are documented so you can tell when a deviation is intentional vs. drift.
				</p>
			</header>

			<Section
				title="Canonical variants"
				description="Section is the default. Hero gradient is one-per-page. Metric tile and Dense are for grids. State has no header. Legacy is what most older code looks like and should be migrated when touched."
			>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					{CARD_VARIANTS.map(v => (
						<div key={v.id} data-card-variant={v.id} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-3">
							<div className="flex items-baseline justify-between gap-2">
								<h3 className="text-sm font-semibold">{v.name}</h3>
								<code className="text-[10px] font-mono text-muted-foreground">data-card-variant=&quot;{v.id}&quot;</code>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">
								<span className="font-medium text-foreground/80">When:</span> {v.when}
							</p>
							{v.notWhen && (
								<p className="text-xs text-muted-foreground leading-relaxed">
									<span className="font-medium text-foreground/80">Not when:</span> {v.notWhen}
								</p>
							)}
							<div className="pt-1">{v.render()}</div>
							<CodeSnippet snippet={v.snippet} />
							<div className="rounded-md bg-background/40 ring-1 ring-foreground/10 p-2 flex flex-col gap-1.5">
								<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Where you'll see it</span>
								<ul className="flex flex-col gap-1">
									{v.seenIn.map(s => (
										<li key={s.where} className="text-[11px] leading-snug">
											<code className="font-mono text-[10px] text-foreground/80">{s.where}</code>
											<span className="text-muted-foreground"> &mdash; {s.what}</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					))}
				</div>
			</Section>

			<Separator />

			<Section
				title="Outliers"
				description="Cards in the codebase that don't fit the six canonical variants. Most are deliberate (the recommendation card chrome, the hover-scaled user tile), a couple are inherited shapes worth knowing about. If you find yourself reinventing one of these, copy the existing pattern rather than rolling a new one."
			>
				<div className="flex flex-col gap-4">
					{OUTLIERS.map(o => (
						<div key={o.id} data-card-outlier={o.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/10 p-4">
							<div className="flex flex-col gap-1">
								<h3 className="text-sm font-semibold">{o.name}</h3>
								<div className="flex flex-wrap gap-x-3 gap-y-0.5">
									{o.files.map(f => (
										<code key={f} className="text-[10px] font-mono text-muted-foreground">
											{f}
										</code>
									))}
								</div>
							</div>
							<p className="text-xs text-muted-foreground leading-relaxed">{o.howItDiffers}</p>
							{o.render && <div className="pt-1">{o.render()}</div>}
							<CodeSnippet snippet={o.snippet} />
						</div>
					))}
				</div>
			</Section>

			<Separator />

			<Section
				title="Composition primitives we don't use yet"
				description="Shapes the primitive supports but the codebase has no consumer for. Listed here so they're discoverable; reach for them before inventing a new layout."
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-3">
						<h3 className="text-sm font-semibold">Bordered header / footer</h3>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Add <code className="font-mono">border-b</code> to <code className="font-mono">CardHeader</code> or{' '}
							<code className="font-mono">border-t</code> to <code className="font-mono">CardFooter</code> to get a divider plus matching pb
							/ pt. Useful for settings groups that want the title separated from the body without a separate Section.
						</p>
						<Card>
							<CardHeader className="border-b">
								<CardTitle>Bordered header</CardTitle>
								<CardDescription>Divider sits flush under the title.</CardDescription>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground py-3">Body content here.</CardContent>
						</Card>
					</div>
					<div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-3">
						<h3 className="text-sm font-semibold">Media first child</h3>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Card has <code className="font-mono">has-[&gt;img:first-child]:pt-0</code> and{' '}
							<code className="font-mono">*:[img:first-child]:rounded-t-xl</code>, so an <code className="font-mono">&lt;img&gt;</code> as
							the first child auto-trims the top padding and rounds. No app surface uses this today.
						</p>
						<Card>
							<div aria-hidden className="h-24 w-full bg-gradient-to-br from-cyan-400 via-sky-400 to-blue-500" />
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Gift className="size-5" /> Media card
								</CardTitle>
								<CardDescription>Image as first child.</CardDescription>
							</CardHeader>
						</Card>
					</div>
				</div>
			</Section>

			<Section title="Status legend" description="A quick reading of the dots used in the variants above.">
				<div className="flex flex-wrap items-center gap-4 text-xs">
					<div className="flex items-center gap-1.5">
						<Check className="size-4 text-emerald-500" />
						<span className="text-muted-foreground">applied / claimed</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Sparkles className="size-4 text-amber-500" />
						<span className="text-muted-foreground">AI / intelligence</span>
					</div>
					<div className="flex items-center gap-1.5">
						<Lock className="size-4 text-muted-foreground" />
						<span className="text-muted-foreground">locked / spoiler</span>
					</div>
					<div className="flex items-center gap-1.5">
						<PackagePlus className="size-4 text-violet-500" />
						<span className="text-muted-foreground">off-list addon</span>
					</div>
				</div>
			</Section>
		</div>
	)
}
