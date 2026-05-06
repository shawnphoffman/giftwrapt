import {
	ArrowRight,
	Crown,
	ExternalLink,
	EyeOff,
	FlaskConical,
	Gift,
	Heart,
	Inbox,
	List,
	ListChecks,
	ListOrdered,
	ListPlus,
	Lock,
	type LucideIcon,
	MessagesSquare,
	PackageOpen,
	PackagePlus,
	Pencil,
	Receipt,
	Settings,
	Shield,
	ShieldOff,
	Sparkles,
	Sprout,
	SquarePlus,
	Star,
	WandSparkles,
} from 'lucide-react'
import { toast } from 'sonner'

import BirthdayBadge from '@/components/common/birthday-badge'
import CountBadge from '@/components/common/count-badge'
import DependentAvatar from '@/components/common/dependent-avatar'
import EmptyMessage from '@/components/common/empty-message'
import GuardianBadge from '@/components/common/guardian-badge'
import ListTypeIcon from '@/components/common/list-type-icon'
import PriorityIcon from '@/components/common/priority-icon'
import UserAvatar from '@/components/common/user-avatar'
import { AddItemSplitButton } from '@/components/items/import/add-item-split-button'
import { PriceQuantityBadge } from '@/components/items/price-quantity-badge'
import { QuantityRemainingBadge } from '@/components/items/quantity-remaining-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AVATAR_COLORS } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

const SECTION_GAP = 'flex flex-col gap-3'

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

function Tile({ label, code, children }: { label: string; code?: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="rounded-lg overflow-hidden ring-1 ring-foreground/10 bg-card">{children}</div>
			<div className="flex flex-col gap-0.5">
				<span className="text-xs font-medium">{label}</span>
				{code && <code className="text-[10px] text-muted-foreground font-mono leading-tight">{code}</code>}
			</div>
		</div>
	)
}

type PaletteTone = {
	name: string
	role: string
	hue: string
	solidShade: string
	softShade: string
	textShade: string
}

// Each tone is described by its base hue + shade tokens. The swatch uses
// inline `style` with `var(--color-<hue>-<shade>)` so we don't depend on
// the Tailwind JIT picking up class strings unique to this file.
const PALETTE_TONES: Array<PaletteTone> = [
	{
		name: 'Emerald',
		role: 'Success / "you claimed", confirmed action',
		hue: 'emerald',
		solidShade: '600',
		softShade: '500',
		textShade: '300',
	},
	{ name: 'Yellow', role: 'Warning / over-claim, primary list star', hue: 'yellow', solidShade: '500', softShade: '500', textShade: '300' },
	{ name: 'Orange', role: 'Partial-claim accent, in-flight state', hue: 'orange', solidShade: '500', softShade: '500', textShade: '300' },
	{ name: 'Red', role: 'Destructive / unavailable', hue: 'red', solidShade: '500', softShade: '500', textShade: '300' },
	{ name: 'Sky', role: 'Informational links, URL badge', hue: 'sky', solidShade: '600', softShade: '500', textShade: '300' },
	{ name: 'Violet', role: 'Guardian relationship', hue: 'violet', solidShade: '600', softShade: '500', textShade: '300' },
	{ name: 'Teal', role: 'Gift-ideas list type', hue: 'teal', solidShade: '600', softShade: '500', textShade: '300' },
	{ name: 'Emerald (dependent)', role: 'Dependent avatar fallback', hue: 'emerald', solidShade: '500', softShade: '500', textShade: '300' },
	{ name: 'Pink', role: 'Partner relationship (Heart)', hue: 'pink', solidShade: '500', softShade: '500', textShade: '300' },
	{ name: 'Amber', role: 'Restricted access (Eye)', hue: 'amber', solidShade: '500', softShade: '500', textShade: '300' },
]

const cssVar = (hue: string, shade: string) => `var(--color-${hue}-${shade})`
const softMix = (hue: string, shade: string, pct = 12) => `color-mix(in srgb, ${cssVar(hue, shade)} ${pct}%, transparent)`

type GradientStop = { hue: string; shade: string; alpha?: number }
type GradientDef = {
	name: string
	role: string
	code: string
	dir: string
	stops: Array<GradientStop>
}

// Each gradient is built from raw color stops + a direction. Rendered via
// inline `style` so the demo always paints, and to bypass Tailwind's JIT
// scanner missing classes that only appear in this file.
const GRADIENTS: Array<GradientDef> = [
	{
		name: 'Card baseline',
		role: 'Built into <Card>. Soft accent wash on every card surface.',
		code: 'from-accent/50 to-card',
		dir: 'to top',
		stops: [
			{ hue: 'accent', shade: '', alpha: 50 },
			{ hue: 'card', shade: '' },
		],
	},
	{
		name: 'Page background',
		role: 'GradientBackground component. Auth and hero shells.',
		code: 'from-accent via-background to-accent',
		dir: 'to bottom right',
		stops: [
			{ hue: 'accent', shade: '' },
			{ hue: 'background', shade: '' },
			{ hue: 'accent', shade: '' },
		],
	},
	{
		name: 'AI / Intelligence brand',
		role: 'Intelligence header chip and AI action button.',
		code: 'from-amber-500 via-pink-500 to-fuchsia-600',
		dir: 'to bottom right',
		stops: [
			{ hue: 'amber', shade: '500' },
			{ hue: 'pink', shade: '500' },
			{ hue: 'fuchsia', shade: '600' },
		],
	},
	{
		name: 'AI progress bar',
		role: 'Linear AI progress indicator.',
		code: 'from-amber-400 to-fuchsia-500',
		dir: 'to right',
		stops: [
			{ hue: 'amber', shade: '400' },
			{ hue: 'fuchsia', shade: '500' },
		],
	},
	{
		name: 'Metric: items',
		role: 'Received-page total-items hero card. Translucent over Card.',
		code: 'from-cyan-400/40 via-sky-400/30 to-blue-500/40',
		dir: 'to bottom right',
		stops: [
			{ hue: 'cyan', shade: '400', alpha: 40 },
			{ hue: 'sky', shade: '400', alpha: 30 },
			{ hue: 'blue', shade: '500', alpha: 40 },
		],
	},
	{
		name: 'Metric: gifts',
		role: 'Received-page total-gifts hero card. Translucent over Card.',
		code: 'from-pink-400/40 via-rose-400/30 to-orange-400/40',
		dir: 'to bottom right',
		stops: [
			{ hue: 'pink', shade: '400', alpha: 40 },
			{ hue: 'rose', shade: '400', alpha: 30 },
			{ hue: 'orange', shade: '400', alpha: 40 },
		],
	},
	{
		name: 'Metric: addons',
		role: 'Received-page off-list addons hero card. Translucent over Card.',
		code: 'from-violet-400/40 via-purple-400/30 to-fuchsia-500/40',
		dir: 'to bottom right',
		stops: [
			{ hue: 'violet', shade: '400', alpha: 40 },
			{ hue: 'purple', shade: '400', alpha: 30 },
			{ hue: 'fuchsia', shade: '500', alpha: 40 },
		],
	},
]

function gradientStyle(g: GradientDef): React.CSSProperties {
	const stops = g.stops
		.map(s => {
			const base = s.shade ? cssVar(s.hue, s.shade) : `var(--${s.hue})`
			if (s.alpha !== undefined) return `color-mix(in srgb, ${base} ${s.alpha}%, transparent)`
			return base
		})
		.join(', ')
	return { backgroundImage: `linear-gradient(${g.dir}, ${stops})` }
}

const LIST_TYPES = ['wishlist', 'christmas', 'birthday', 'giftideas', 'holiday', 'todos'] as const
const PRIORITIES = ['very-high', 'high', 'normal', 'low'] as const

function StatusDot({ tone, label, className }: { tone: string; label: string; className?: string }) {
	return (
		<div className={cn('flex items-center gap-2', className)}>
			<span className={cn('size-2.5 rounded-full', tone)} aria-hidden />
			<span className="text-xs font-mono text-muted-foreground">{label}</span>
		</div>
	)
}

function PageIconSwatch({ label, icon: Icon, bg, ring }: { label: string; icon: LucideIcon; bg: string; ring: string }) {
	return (
		<div className="flex flex-col items-start gap-2 rounded-md border border-border bg-muted/10 p-3">
			<span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1', bg, ring)}>
				<Icon className="size-7 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
			</span>
			<span className="text-xs font-medium leading-tight">{label}</span>
		</div>
	)
}

function DialogIconSwatch({ label, icon: Icon, bg, ring }: { label: string; icon: LucideIcon; bg: string; ring: string }) {
	return (
		<div className="flex items-center gap-2 rounded-md border border-border bg-muted/10 p-3">
			<span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md shadow-sm ring-1', bg, ring)}>
				<Icon className="size-[21px] shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
			</span>
			<span className="text-xs font-medium leading-tight">{label}</span>
		</div>
	)
}

const ACTION_BTN_BASE =
	'inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-white whitespace-nowrap transition-all duration-150'

// Canonical Card variants. The catalog renders one example of each plus
// a static JSX recipe a contributor can copy. New cards in the codebase
// should match one of these shapes; deviations should be intentional and
// documented inline.
type CardVariant = {
	id: 'section' | 'dense' | 'hero-gradient' | 'metric-tile' | 'state' | 'legacy'
	name: string
	when: string
	notWhen?: string
	snippet: string
	render: () => React.ReactElement
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
	},
]

export default function ProjectPatterns() {
	return (
		<div className="flex flex-col gap-10">
			<header className="flex flex-col gap-1">
				<h2 className="text-2xl font-semibold tracking-tight">Project patterns</h2>
				<p className="text-sm text-muted-foreground">
					Project-specific styled primitives that recur across surfaces. Pairs with{' '}
					<a className="text-primary hover:underline underline-offset-4" href="?path=/story/utilities-theme-theme-reference--default">
						Theme Reference
					</a>{' '}
					(shadcn defaults). Hex/oklch values and spacing all come from the theme tokens.
				</p>
			</header>

			{/* SEMANTIC PALETTE */}
			<Section
				title="Semantic palette"
				description="Color tones the codebase reaches for again and again. Most appear as soft (10-20% bg + 700/400 text) and solid pairs."
			>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
					{PALETTE_TONES.map(t => (
						<div key={t.name} className="rounded-lg ring-1 ring-foreground/10 bg-card overflow-hidden">
							<div
								className="flex items-center justify-between px-3 py-2 text-white"
								style={{ backgroundColor: cssVar(t.hue, t.solidShade) }}
							>
								<span className="text-xs font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{t.name}</span>
								<code className="text-[10px] font-mono opacity-80">
									{t.hue}-{t.solidShade}
								</code>
							</div>
							<div
								className="px-3 py-2 border-t border-foreground/10"
								style={{
									backgroundColor: softMix(t.hue, t.softShade, 12),
									color: cssVar(t.hue, t.textShade),
								}}
							>
								<span className="text-xs font-medium">soft variant</span>
								<code className="text-[10px] font-mono opacity-70 ml-2">
									{t.hue}-{t.softShade}/12
								</code>
							</div>
							<div className="px-3 py-2 text-[11px] text-muted-foreground leading-tight">{t.role}</div>
						</div>
					))}
				</div>
			</Section>

			<Separator />

			{/* GRADIENTS */}
			<Section
				title="Brand gradients"
				description="Surface treatments for cards, hero metrics, the AI brand, and progress bars. The -t accent wash on Card is automatic - everything else is opt-in."
			>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{GRADIENTS.map(g => (
						<Tile key={g.name} label={g.name} code={g.code}>
							<div aria-hidden className="h-24 bg-card" style={gradientStyle(g)} />
							<div className="px-3 py-2 text-[11px] text-muted-foreground leading-tight border-t border-foreground/10">{g.role}</div>
						</Tile>
					))}
				</div>
			</Section>

			<Separator />

			{/* AVATAR PALETTE */}
			<Section
				title="Avatar palette"
				description="UserAvatar fallbacks pick from this 12-color set deterministically by hashing the user's name. DependentAvatar uses a single emerald Sprout fallback regardless of name."
			>
				<div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
					{AVATAR_COLORS.map(c => (
						<div key={c} className="flex flex-col items-center gap-1">
							<div className={cn('size-10 rounded-full ring-1 ring-foreground/10', c)} aria-hidden />
							<code className="text-[9px] text-muted-foreground font-mono truncate max-w-full">{c.split(' ')[0].replace('bg-', '')}</code>
						</div>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-3 pt-2">
					<UserAvatar name="Alex Rivera" size="medium" />
					<UserAvatar name="Bobbie Chen" size="medium" />
					<UserAvatar name="Casey Park" size="medium" />
					<UserAvatar name="Diana Vasquez" size="medium" />
					<UserAvatar name="Elliot Khan" size="medium" />
					<DependentAvatar name="Cookie" size="medium" />
					<DependentAvatar name="Baby Sam" size="medium" />
					<span className="text-xs text-muted-foreground">deterministic by name hash, dependents always Sprout</span>
				</div>
				<div className="flex items-end gap-3 pt-2">
					{(['small', 'medium', 'large', 'huge'] as const).map(size => (
						<div key={size} className="flex flex-col items-center gap-1">
							<UserAvatar name="Reference Avatar" size={size} />
							<code className="text-[10px] text-muted-foreground font-mono">{size}</code>
						</div>
					))}
				</div>
			</Section>

			<Separator />

			{/* LIST TYPE + PRIORITY ICONS */}
			<Section title="Status icons" description="Shared color signals for list types, priority, ownership, and primary status.">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className={SECTION_GAP}>
						<span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">List type</span>
						<div className="flex flex-wrap items-center gap-4">
							{LIST_TYPES.map(t => (
								<div key={t} className="flex flex-col items-center gap-1">
									<ListTypeIcon type={t} className="size-6" />
									<code className="text-[10px] text-muted-foreground font-mono">{t}</code>
								</div>
							))}
						</div>
					</div>
					<div className={SECTION_GAP}>
						<span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Priority</span>
						<div className="flex flex-wrap items-center gap-4">
							{PRIORITIES.map(p => (
								<div key={p} className="flex flex-col items-center gap-1">
									<PriorityIcon priority={p} />
									<code className="text-[10px] text-muted-foreground font-mono">{p}</code>
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="flex flex-col gap-2 pt-2">
					<span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Relationship & permission</span>
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 text-xs">
						<div className="flex items-center gap-1.5">
							<Crown className="size-4 text-yellow-500 fill-yellow-500" />
							<span className="text-muted-foreground">Owner</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Star className="size-4 text-yellow-500 fill-yellow-500" />
							<span className="text-muted-foreground">Primary list</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Heart className="size-4 fill-pink-500 text-pink-500" />
							<span className="text-muted-foreground">Partner</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Shield className="size-4" style={{ color: cssVar('emerald', '500') }} />
							<span className="text-muted-foreground">Guardian</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Pencil className="size-4" style={{ color: cssVar('sky', '500') }} />
							<span className="text-muted-foreground">List editor</span>
						</div>
						<div className="flex items-center gap-1.5">
							<EyeOff className="size-4" style={{ color: cssVar('amber', '500') }} />
							<span className="text-muted-foreground">Restricted access</span>
						</div>
						<div className="flex items-center gap-1.5">
							<ShieldOff className="size-4" style={{ color: cssVar('red', '500') }} />
							<span className="text-muted-foreground">Denied / none</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Sprout className="size-4" style={{ color: cssVar('emerald', '600') }} />
							<span className="text-muted-foreground">Dependent</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Lock className="size-4 text-muted-foreground" />
							<span className="text-muted-foreground">Locked / spoiler</span>
						</div>
						<div className="flex items-center gap-1.5">
							<Sparkles className="size-4 text-amber-500" />
							<span className="text-muted-foreground">AI / intelligence</span>
						</div>
					</div>
					<p className="text-[11px] text-muted-foreground pt-1">
						Used in permissions matrix, list rows, list-editors picker, and the Intelligence surface. Tones map to the semantic palette
						above: emerald=guardian, sky=editor, amber=restricted, red=denied, pink=partner, yellow=ownership.
					</p>
				</div>
			</Section>

			<Separator />

			{/* CUSTOM BADGES */}
			<Section
				title="Custom badges"
				description="Pill-shaped status atoms used in lists, items, and headers. Each carries its own semantic tone - don't recolor inline; reuse the component."
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<GuardianBadge />
						<Badge variant="destructive" className="px-1 rounded leading-none">
							Admin
						</Badge>
						<Badge className="px-1 rounded leading-none">Child</Badge>
						<Badge variant="secondary" className="px-1 rounded leading-none">
							User
						</Badge>
						<span className="text-xs text-muted-foreground">role badges (admin / child / user) and guardian relationship</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<a
							href="#"
							onClick={e => e.preventDefault()}
							className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900 transition-colors max-w-[40%] cursor-pointer"
						>
							<span className="truncate">amazon.com</span>
							<ExternalLink className="size-3 shrink-0" />
						</a>
						<span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-normal bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 transition-colors cursor-pointer">
							<List className="size-3 shrink-0" />
							<span className="truncate">Linked list</span>
						</span>
						<span className="text-xs text-muted-foreground">URL badge (sky) and list-link badge (emerald)</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<BirthdayBadge birthMonth="october" birthDay={14} />
						<BirthdayBadge birthMonth="may" birthDay={20} />
						<span className="text-xs text-muted-foreground">
							birthday badge: outline pill alone, plus destructive countdown when within 30 days
						</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<CountBadge count={4} />
						<CountBadge count={10} remaining={6} />
						<CountBadge count={10} remaining={0} />
						<span className="text-xs text-muted-foreground">count alone, remaining/total ratio, and "all claimed" muted</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<PriceQuantityBadge price="29.99" quantity={1} />
						<PriceQuantityBadge price="29.99" quantity={3} />
						<PriceQuantityBadge price="$45-60" quantity={1} />
						<PriceQuantityBadge price={null} quantity={4} />
						<span className="text-xs text-muted-foreground">price-quantity split pill (border separator pattern)</span>
					</div>
				</div>
			</Section>

			<Separator />

			{/* QUANTITY REMAINING - the project's most variant-rich badge */}
			<Section
				title="Quantity & claim states"
				description="QuantityRemainingBadge collapses claim, lock, over-claim, and unavailable into one trailing pill. Variants `split` / `inline` / `inline-pill` / `dots` keep the same semantics across surfaces."
			>
				<div className="flex flex-col gap-4">
					{(['split', 'inline-pill', 'dots', 'inline'] as const).map(variant => (
						<div key={variant} className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<code className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{variant}</code>
								<Separator className="flex-1" />
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<div className="flex flex-col items-start gap-1">
									<QuantityRemainingBadge quantity={5} remaining={3} variant={variant} />
									<span className="text-[10px] text-muted-foreground">partial</span>
								</div>
								<div className="flex flex-col items-start gap-1">
									<QuantityRemainingBadge quantity={5} remaining={0} variant={variant} />
									<span className="text-[10px] text-muted-foreground">all claimed by others</span>
								</div>
								<div className="flex flex-col items-start gap-1">
									<QuantityRemainingBadge quantity={5} remaining={0} youClaimed variant={variant} />
									<span className="text-[10px] text-muted-foreground">you fully claimed</span>
								</div>
								<div className="flex flex-col items-start gap-1">
									<QuantityRemainingBadge quantity={3} remaining={0} claimedCount={5} variant={variant} />
									<span className="text-[10px] text-muted-foreground">over-claimed</span>
								</div>
								<div className="flex flex-col items-start gap-1">
									<QuantityRemainingBadge quantity={2} remaining={2} unavailable variant={variant} />
									<span className="text-[10px] text-muted-foreground">unavailable</span>
								</div>
								<div className="flex flex-col items-start gap-1">
									<QuantityRemainingBadge quantity={4} remaining={4} lockReason="order" variant={variant} />
									<span className="text-[10px] text-muted-foreground">group-locked</span>
								</div>
							</div>
						</div>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
					<StatusDot tone="bg-emerald-500" label="success / you claimed" />
					<StatusDot tone="bg-orange-500" label="partial in-flight" />
					<StatusDot tone="bg-yellow-500" label="over-claimed" />
					<StatusDot tone="bg-red-500" label="unavailable" />
					<StatusDot tone="bg-muted-foreground/50" label="fully claimed by others" />
					<div className="flex items-center gap-1.5">
						<Lock className="size-3" />
						<span className="text-muted-foreground">group-locked</span>
					</div>
				</div>
			</Section>

			<Separator />

			{/* CUSTOM BUTTONS */}
			<Section
				title="Custom action buttons"
				description="Branded actions that go beyond shadcn variants. Lift on hover (`-translate-y-px`) and ring-glow are the consistent affordances."
			>
				<div className="flex flex-col gap-4">
					<div className="flex flex-wrap items-center gap-3">
						<button
							type="button"
							className={cn(
								ACTION_BTN_BASE,
								'bg-emerald-600 ring-1 ring-emerald-500/50 shadow-sm dark:bg-emerald-700 dark:ring-emerald-600/50',
								'hover:bg-emerald-500 hover:ring-emerald-400/70 hover:shadow-md hover:shadow-emerald-500/30 hover:-translate-y-px',
								'dark:hover:bg-emerald-600 dark:hover:ring-emerald-500/70',
								'active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
							)}
						>
							<ArrowRight className="size-3.5" />
							Apply
						</button>
						<button
							type="button"
							className={cn(
								ACTION_BTN_BASE,
								'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
								'shadow-sm ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40',
								'hover:from-amber-400 hover:via-pink-400 hover:to-fuchsia-500 hover:shadow-md hover:shadow-fuchsia-500/40 hover:ring-fuchsia-300/60 hover:-translate-y-px',
								'dark:hover:from-amber-600 dark:hover:via-pink-600 dark:hover:to-fuchsia-700',
								'active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400'
							)}
						>
							<Sparkles className="size-3.5 text-amber-100 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)] animate-pulse" />
							Generate
						</button>
						<span className="text-xs text-muted-foreground">"Do" emerald action and AI gradient action (intelligence flow)</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<a
							href="#"
							onClick={e => e.preventDefault()}
							className={cn(
								'group inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium transition-all',
								'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/70 shadow-sm',
								'hover:bg-emerald-200 hover:ring-emerald-400 hover:shadow',
								'dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800/80 dark:hover:bg-emerald-900 dark:hover:ring-emerald-700'
							)}
						>
							<span aria-hidden className="text-emerald-700/80 dark:text-emerald-300/80">
								&larr;
							</span>
							<span className="text-emerald-700/80 dark:text-emerald-300/80">Back to</span>
							<List className="size-3.5 shrink-0" />
							<span className="truncate font-semibold">Christmas list</span>
						</a>
						<span className="text-xs text-muted-foreground">back-to-parent emerald pill</span>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<AddItemSplitButton listId={0} onAddItem={() => toast.success('Add item')} importEnabledOverride={true} />
						<span className="text-xs text-muted-foreground">list-edit add-item split button (primary action + import-source dropdown)</span>
					</div>
				</div>
			</Section>

			<Separator />

			{/* CARD VARIANTS */}
			<Section
				title="Card variants"
				description="Six canonical Card shapes. Pick one before reaching for the primitive. Section is the default; Hero gradient is one-per-page; Metric tile and Dense are for grids; State has no header; Legacy is what most older code looks like and should be migrated when touched."
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
							<pre className="text-[11px] font-mono leading-snug rounded-md bg-background/60 ring-1 ring-foreground/10 p-2 overflow-x-auto whitespace-pre">
								{v.snippet}
							</pre>
						</div>
					))}
				</div>
			</Section>

			<Separator />

			{/* SURFACES */}
			<Section
				title="Surface compositions"
				description="Section headers, hero metric cards, and the empty state. These compose the same primitives but recur as units across pages."
			>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<Card size="sm" className="bg-gradient-to-br from-cyan-400/40 via-sky-400/30 to-blue-500/40">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<PackageOpen className="size-5" />
								Total
							</CardTitle>
							<CardDescription className="text-foreground/50">Items across all received gifts</CardDescription>
						</CardHeader>
						<CardContent>
							<span className="text-3xl font-bold tabular-nums">42</span>
						</CardContent>
					</Card>
					<Card size="sm" className="bg-gradient-to-br from-pink-400/40 via-rose-400/30 to-orange-400/40">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Gift className="size-5" />
								Gifts
							</CardTitle>
							<CardDescription className="text-foreground/50">Claims that landed</CardDescription>
						</CardHeader>
						<CardContent>
							<span className="text-3xl font-bold tabular-nums">28</span>
						</CardContent>
					</Card>
					<Card size="sm" className="bg-gradient-to-br from-violet-400/40 via-purple-400/30 to-fuchsia-500/40">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<PackagePlus className="size-5" />
								Off-list
							</CardTitle>
							<CardDescription className="text-foreground/50">Volunteer addons</CardDescription>
						</CardHeader>
						<CardContent>
							<span className="text-3xl font-bold tabular-nums">7</span>
						</CardContent>
					</Card>
				</div>

				<div className="flex flex-col gap-3">
					<div>
						<h3 className="text-base font-semibold tracking-tight">Page heading icons</h3>
						<p className="text-xs text-muted-foreground">
							Colored bg square (size-10) with white glyph at 75% (size-7). Drives the &lt;PageHeading&gt; component shared across every
							top-level page.
						</p>
					</div>
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
						<PageIconSwatch
							label="Wish Lists"
							icon={ListChecks}
							bg="bg-green-500 dark:bg-green-600"
							ring="ring-green-400/40 dark:ring-green-600/40"
						/>
						<PageIconSwatch
							label="My Lists"
							icon={ListOrdered}
							bg="bg-red-500 dark:bg-red-600"
							ring="ring-red-400/40 dark:ring-red-600/40"
						/>
						<PageIconSwatch
							label="Suggestions"
							icon={Sparkles}
							bg="bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800"
							ring="ring-fuchsia-400/40 dark:ring-fuchsia-600/40"
						/>
						<PageIconSwatch
							label="Purchases"
							icon={Receipt}
							bg="bg-pink-500 dark:bg-pink-600"
							ring="ring-pink-400/40 dark:ring-pink-600/40"
						/>
						<PageIconSwatch
							label="Received"
							icon={PackageOpen}
							bg="bg-cyan-500 dark:bg-cyan-600"
							ring="ring-cyan-400/40 dark:ring-cyan-600/40"
						/>
						<PageIconSwatch
							label="Recent Items"
							icon={Inbox}
							bg="bg-purple-500 dark:bg-purple-600"
							ring="ring-purple-400/40 dark:ring-purple-600/40"
						/>
						<PageIconSwatch
							label="Recent Comments"
							icon={MessagesSquare}
							bg="bg-teal-500 dark:bg-teal-600"
							ring="ring-teal-400/40 dark:ring-teal-600/40"
						/>
						<PageIconSwatch
							label="Settings"
							icon={Settings}
							bg="bg-lime-500 dark:bg-lime-600"
							ring="ring-lime-400/40 dark:ring-lime-600/40"
						/>
						<PageIconSwatch label="Admin" icon={Lock} bg="bg-red-500 dark:bg-red-600" ring="ring-red-400/40 dark:ring-red-600/40" />
						<PageIconSwatch
							label="Admin Intelligence"
							icon={WandSparkles}
							bg="bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800"
							ring="ring-fuchsia-400/40 dark:ring-fuchsia-600/40"
						/>
						<PageIconSwatch
							label="Temp"
							icon={FlaskConical}
							bg="bg-amber-500 dark:bg-amber-600"
							ring="ring-amber-400/40 dark:ring-amber-600/40"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<div>
						<h3 className="text-base font-semibold tracking-tight">Dialog title icons</h3>
						<p className="text-xs text-muted-foreground">
							Compact variant (size-7 bg, size-[21px] glyph - 75%) used inside dialog titles. The color matches the sidebar entry that
							triggers the dialog.
						</p>
					</div>
					<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
						<DialogIconSwatch
							label="Add an item"
							icon={SquarePlus}
							bg="bg-blue-500 dark:bg-blue-600"
							ring="ring-blue-400/40 dark:ring-blue-600/40"
						/>
						<DialogIconSwatch
							label="Create a new list"
							icon={ListPlus}
							bg="bg-yellow-500 dark:bg-yellow-600"
							ring="ring-yellow-400/40 dark:ring-yellow-600/40"
						/>
					</div>
				</div>

				<div className="flex items-start gap-3">
					<div className={cn('flex size-9 items-center justify-center rounded-lg bg-muted/40 ring-1 ring-border shrink-0')}>
						<List className="size-4" />
					</div>
					<div>
						<h3 className="text-base font-semibold">Section header</h3>
						<p className="text-xs text-muted-foreground">Used in recommendation groups. Muted icon chip + title + meta line.</p>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="rounded-xl bg-card shadow-sm ring-1 ring-foreground/10 overflow-hidden">
						<div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2 pl-5">
							<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommendation</span>
							<span className="ml-auto text-[11px] text-muted-foreground">just now</span>
						</div>
						<div className="px-4 py-3 text-sm">
							<p className="font-medium">Set a primary list</p>
							<p className="text-xs text-muted-foreground">
								Recommendation card chrome: muted header band, ring-1 surface, divided actions.
							</p>
						</div>
					</div>
					<EmptyMessage message="No items match these filters. Empty-state pattern: dashed border, muted text, soft accent fill." />
				</div>

				<div className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden">
					<div className="flex flex-col divide-y">
						{[
							{ name: 'Lego Star Wars set', tone: 'unclaimed' as const },
							{ name: 'Wireless headphones', tone: 'partial' as const },
							{ name: 'Cookbook bundle', tone: 'youClaimed' as const },
							{ name: 'Special edition figurine', tone: 'unavailable' as const },
						].map(row => (
							<div key={row.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
								<ListTypeIcon type="wishlist" className="size-5 shrink-0" />
								<span className="flex-1 truncate text-sm font-medium">{row.name}</span>
								{row.tone === 'unclaimed' && <PriceQuantityBadge price="29.99" quantity={1} />}
								{row.tone === 'partial' && <QuantityRemainingBadge quantity={3} remaining={1} variant="split" />}
								{row.tone === 'youClaimed' && <QuantityRemainingBadge quantity={1} remaining={0} youClaimed variant="split" />}
								{row.tone === 'unavailable' && <QuantityRemainingBadge quantity={1} remaining={1} unavailable variant="split" />}
							</div>
						))}
					</div>
				</div>
			</Section>
		</div>
	)
}
