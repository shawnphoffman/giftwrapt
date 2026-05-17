// Inventory of every recurring layout and primitive used across
// /admin/* and /settings/* routes. Source of truth for unifying those
// surfaces - changes proposed against the admin / settings shells
// should match a pattern here, or add a new one with intent.
//
// Lives next to `project-patterns.tsx` and is pure JSX: no API calls,
// no mutations, no router. Static placeholder data only so the story
// renders deterministically in any Storybook theme variant.

import { Ban, ChevronLeft, ChevronRight, FlaskConical, Heart, MailCheck, MailWarning, Plus, ShieldCheck, Trash2 } from 'lucide-react'

import UserAvatar from '@/components/common/user-avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<div>
				<h3 className="text-lg font-semibold tracking-tight">{title}</h3>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{children}
		</section>
	)
}

function PatternLabel({ name, source, note }: { name: string; source?: string; note?: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs font-medium">{name}</span>
			{source && <code className="text-[10px] font-mono text-muted-foreground leading-tight">{source}</code>}
			{note && <p className="text-[11px] text-muted-foreground leading-tight">{note}</p>}
		</div>
	)
}

function PatternBlock({ name, source, note, children }: { name: string; source?: string; note?: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<PatternLabel name={name} source={source} note={note} />
			{children}
		</div>
	)
}

// ---------------------------------------------------------------------
// Card containers
// ---------------------------------------------------------------------

function StandardCard() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Standard Card</CardTitle>
				<CardDescription>
					Header carries the title and a one-line description. Body holds the section content. The default shape for any top-level admin /
					settings chunk.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">
					Card body. Wrap form rows in <code>space-y-6</code> here.
				</p>
			</CardContent>
		</Card>
	)
}

function CardWithHeaderAction() {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-4">
				<div className="space-y-1.5">
					<CardTitle>Users</CardTitle>
					<CardDescription>Active accounts on this deployment.</CardDescription>
				</div>
				<Button size="sm">
					<Plus className="size-4" />
					Add User
				</Button>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">Top-right action lives in the header, not the body.</p>
			</CardContent>
		</Card>
	)
}

function CardWithSubsections() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Card With Subsections</CardTitle>
				<CardDescription>Multiple distinct concerns inside a single card, separated by a divider.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-2">
					<h4 className="text-sm font-semibold">First Subsection</h4>
					<p className="text-sm text-muted-foreground">A short cluster of related fields or controls lives in each subsection.</p>
				</div>
				<Separator />
				<div className="space-y-2">
					<h4 className="text-sm font-semibold">Second Subsection</h4>
					<p className="text-sm text-muted-foreground">
						Separator divides peers. Use <code>border-t pt-6</code> instead when the subsection should feel part of the same flow.
					</p>
				</div>
				<div className="space-y-2 border-t border-border pt-6">
					<h4 className="text-sm font-semibold">Third Subsection (Border-Top Variant)</h4>
					<p className="text-sm text-muted-foreground">Same visual weight, no extra vertical air.</p>
				</div>
			</CardContent>
		</Card>
	)
}

function CardWithSubContainer() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Card With Sub-Container</CardTitle>
				<CardDescription>A bordered island inside the card body for a conditional or grouped block.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-2 rounded-md border border-border p-4">
					<Label htmlFor="patterns-subcontainer-key" className="text-base">
						Sub-Container Title
					</Label>
					<p className="text-sm text-muted-foreground">
						Sub-containers use <code>rounded-md border border-border p-4</code>. Reach for one when a group of fields only applies under a
						specific condition (e.g. an API key only when a paid provider is selected).
					</p>
					<Input id="patterns-subcontainer-key" placeholder="api_..." className="font-mono" />
				</div>
			</CardContent>
		</Card>
	)
}

function DenseCard() {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Dense Card</CardTitle>
				<CardDescription>Tighter padding for nested or grid-of-peers usage.</CardDescription>
			</CardHeader>
			<CardContent>
				<span className="text-2xl font-bold tabular-nums">17</span>
			</CardContent>
		</Card>
	)
}

// ---------------------------------------------------------------------
// Form rows
// ---------------------------------------------------------------------

function FormRowsBlock() {
	return (
		<div className="space-y-6">
			<PatternBlock
				name="Toggle Row (Label Left, Control Right)"
				source="flex items-center justify-between gap-4"
				note="The canonical settings shape. Used for every enable-X switch and most simple selects."
			>
				<div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
					<div className="space-y-0.5">
						<Label htmlFor="patterns-toggle" className="text-base">
							Enable Barcode Lookup
						</Label>
						<p className="text-sm text-muted-foreground">
							When off, the mobile endpoint returns 503 and the iOS probe reports unavailable.
						</p>
					</div>
					<Switch id="patterns-toggle" defaultChecked />
				</div>
			</PatternBlock>

			<PatternBlock
				name="Select Row (Label Left, Control Right)"
				source="same shape as toggle row"
				note="Selects sit in the same justify-between row; cap the trigger width to keep the row from sprawling."
			>
				<div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
					<div className="space-y-0.5">
						<Label htmlFor="patterns-select" className="text-base">
							Primary Provider
						</Label>
						<p className="text-sm text-muted-foreground">Which provider fires first on a cache miss.</p>
					</div>
					<Select defaultValue="upcitemdb-trial">
						<SelectTrigger id="patterns-select" className="w-[220px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="upcitemdb-trial">UPCitemdb (Trial, Free)</SelectItem>
							<SelectItem value="go-upc">Go-UPC (Paid)</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Number Input Row"
				source="control width capped at w-[120px]"
				note="Numeric fields use a narrow input so the row reads like a stat, not a sentence."
			>
				<div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
					<div className="space-y-0.5">
						<Label htmlFor="patterns-number" className="text-base">
							Cache TTL (Hours)
						</Label>
						<p className="text-sm text-muted-foreground">Cached rows older than this are refreshed on the next lookup.</p>
					</div>
					<Input id="patterns-number" type="number" min={0} defaultValue={720} className="w-[120px]" />
				</div>
			</PatternBlock>

			<PatternBlock
				name="Indented Sub-Toggle"
				source="pl-6 + opacity-50 when parent toggle is off"
				note="Sub-controls of a parent toggle indent and fade when the parent is disabled."
			>
				<div className="space-y-4 rounded-md border border-border p-4">
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label htmlFor="patterns-parent" className="text-base">
								Enable Christmas Lists
							</Label>
							<p className="text-sm text-muted-foreground">Allow users to create Christmas-themed lists.</p>
						</div>
						<Switch id="patterns-parent" defaultChecked />
					</div>
					<div className="flex items-center justify-between gap-4 pl-6">
						<div className="space-y-0.5">
							<Label htmlFor="patterns-parent-child" className="text-base">
								Send Pre-Christmas Reminder Emails
							</Label>
							<p className="text-sm text-muted-foreground">Email every user N days before Christmas.</p>
						</div>
						<Switch id="patterns-parent-child" />
					</div>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Inline Input + Buttons (Secret Field Edit Mode)"
				source="flex items-center gap-2"
				note="Save / Cancel sit on the same line as the input. Trailing button is optional (e.g. a Test button)."
			>
				<div className="space-y-2 rounded-md border border-border p-4">
					<Label htmlFor="patterns-secret-edit" className="text-base">
						Go-UPC API Key
					</Label>
					<div className="flex items-center gap-2">
						<Input id="patterns-secret-edit" type="password" placeholder="goupc_…" className="font-mono" />
						<Button type="button">Save Key</Button>
						<Button type="button" variant="ghost">
							Cancel
						</Button>
					</div>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Masked Secret (Display Mode)"
				source="readOnly Input + Replace / Clear buttons"
				note="What an already-stored secret looks like before the user clicks Replace."
			>
				<div className="space-y-2 rounded-md border border-border p-4">
					<Label htmlFor="patterns-secret-display" className="text-base">
						Resend API Key
					</Label>
					<div className="flex items-center gap-2">
						<Input id="patterns-secret-display" value="••••••••••••" readOnly className="font-mono" />
						<Button type="button" variant="outline">
							Replace
						</Button>
						<Button type="button" variant="outline">
							Clear
						</Button>
					</div>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Label-Above Form (Stacked)"
				source="flex flex-col gap-2 (per field)"
				note="Used in profile / password / create-user forms. Fields stack full-width inside the card body."
			>
				<div className="space-y-4 rounded-md border border-border p-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="patterns-stacked-name">Display Name</Label>
						<Input id="patterns-stacked-name" defaultValue="Alex Rivera" />
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="patterns-stacked-email">Email</Label>
						<Input id="patterns-stacked-email" type="email" defaultValue="alex@example.com" />
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="patterns-stacked-bio">Bio</Label>
						<Textarea id="patterns-stacked-bio" rows={3} placeholder="A short blurb…" />
					</div>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Two-Column Grid (Birthday, Address, etc.)"
				source="grid grid-cols-2 sm:grid-cols-3 gap-3"
				note="When a single semantic field is made of multiple inputs (date parts, name parts)."
			>
				<div className="rounded-md border border-border p-4">
					<Label className="mb-2 block">Birthday</Label>
					<div className="grid grid-cols-3 gap-3">
						<Select defaultValue="march">
							<SelectTrigger>
								<SelectValue placeholder="Month" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="january">January</SelectItem>
								<SelectItem value="february">February</SelectItem>
								<SelectItem value="march">March</SelectItem>
							</SelectContent>
						</Select>
						<Input type="number" min={1} max={31} defaultValue={14} placeholder="Day" />
						<Input type="number" min={1900} defaultValue={1990} placeholder="Year" />
					</div>
				</div>
			</PatternBlock>
		</div>
	)
}

// ---------------------------------------------------------------------
// Input controls
// ---------------------------------------------------------------------

function InputControlsBlock() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			<PatternBlock name="Text Input" source="<Input />">
				<Input placeholder="Type here…" defaultValue="Default value" />
			</PatternBlock>

			<PatternBlock name="Number Input" source='<Input type="number" />'>
				<Input type="number" min={0} defaultValue={42} />
			</PatternBlock>

			<PatternBlock name="Password Input (Toggleable)" source="<PasswordInput />" note="Uses the eye toggle from /ui/password-input.">
				<PasswordInput defaultValue="hunter2hunter2" />
			</PatternBlock>

			<PatternBlock name="Textarea" source="<Textarea />">
				<Textarea rows={3} placeholder="Multiline notes…" />
			</PatternBlock>

			<PatternBlock name="Select" source="<Select />">
				<Select defaultValue="wishlist">
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="wishlist">Wishlist</SelectItem>
						<SelectItem value="christmas">Christmas</SelectItem>
						<SelectItem value="birthday">Birthday</SelectItem>
						<SelectItem value="giftideas">Gift Ideas</SelectItem>
					</SelectContent>
				</Select>
			</PatternBlock>

			<PatternBlock name="Switch" source="<Switch />" note="The default toggle. Pair with a Label.">
				<div className="flex items-center gap-3">
					<Switch id="patterns-switch-demo" defaultChecked />
					<Label htmlFor="patterns-switch-demo">Enable Feature</Label>
				</div>
			</PatternBlock>

			<PatternBlock name="Checkbox" source="<Checkbox />" note="Used for multi-select lists (e.g. confirm cascading edits).">
				<div className="flex flex-col gap-2">
					<label className="flex items-center gap-2 text-sm">
						<Checkbox defaultChecked />
						<span>Add Partner to All Public Lists</span>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<Checkbox defaultChecked />
						<span>Remove Previous Partner From All Editor Grants</span>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<Checkbox />
						<span>Send Notification Email</span>
					</label>
				</div>
			</PatternBlock>

			<PatternBlock name="Radio Group" source="<RadioGroup />">
				<RadioGroup defaultValue="catalog" className="gap-2">
					<label className="flex items-center gap-2 text-sm">
						<RadioGroupItem value="catalog" />
						<span>From Catalog</span>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<RadioGroupItem value="custom" />
						<span>Custom Date</span>
					</label>
				</RadioGroup>
			</PatternBlock>

			<PatternBlock name="Slider" source="<Slider />" note="Rarely used today, but available for ranged numeric settings.">
				<Slider defaultValue={[14]} max={30} step={1} />
			</PatternBlock>

			<PatternBlock
				name="Date Input"
				source='<Input type="date" /> or <DatePicker />'
				note="DatePicker (calendar dropdown) lives at /ui/date-picker; native fallback shown here."
			>
				<Input type="date" defaultValue="2026-12-25" />
			</PatternBlock>
		</div>
	)
}

// ---------------------------------------------------------------------
// Lists & tables
// ---------------------------------------------------------------------

const FAKE_USERS = [
	{ id: '1', name: 'Alex Rivera', email: 'alex@example.com', role: 'admin', verified: true, partner: true },
	{ id: '2', name: 'Bobbie Chen', email: 'bobbie@example.com', role: 'user', verified: true, partner: false },
	{ id: '3', name: 'Casey Park', email: 'casey@example.com', role: 'child', verified: false, partner: false },
] as const

function ResponsiveListBlock() {
	return (
		<div className="rounded-md border border-border">
			<div className="grid grid-cols-1 divide-y sm:grid-cols-[minmax(0,2fr)_max-content_max-content_max-content]">
				{FAKE_USERS.map(user => (
					<div key={user.id} className="grid grid-cols-subgrid col-span-full items-center gap-3 p-3 transition-colors hover:bg-muted/50">
						<div className="flex items-center gap-3 min-w-0">
							<UserAvatar name={user.name} />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{user.name}</div>
								<div className="truncate text-xs text-muted-foreground">{user.email}</div>
							</div>
						</div>
						<div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
							<span className="capitalize">{user.role}</span>
						</div>
						<div className="hidden sm:flex items-center gap-1.5">
							{user.partner && <Heart className="size-4 fill-pink-500 text-pink-500" />}
							{user.role === 'admin' && <ShieldCheck className="size-4 text-emerald-500" />}
						</div>
						<div className="hidden sm:flex items-center gap-1.5">
							{user.verified ? <MailCheck className="size-4 text-emerald-500" /> : <MailWarning className="size-4 text-amber-500" />}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

function DataTableBlock() {
	return (
		<div className="overflow-x-auto rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Started</TableHead>
						<TableHead>Endpoint</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Duration</TableHead>
						<TableHead>Summary</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow>
						<TableCell className="font-mono text-xs">2026-05-17 09:00</TableCell>
						<TableCell className="font-mono text-xs">/api/cron/birthday</TableCell>
						<TableCell>
							<Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
								success
							</Badge>
						</TableCell>
						<TableCell className="text-xs">1.2s</TableCell>
						<TableCell className="text-xs font-mono">archived: 4 · emailed: 3</TableCell>
					</TableRow>
					<TableRow>
						<TableCell className="font-mono text-xs">2026-05-17 08:00</TableCell>
						<TableCell className="font-mono text-xs">/api/cron/auto-archive</TableCell>
						<TableCell>
							<Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
								skipped
							</Badge>
						</TableCell>
						<TableCell className="text-xs">42ms</TableCell>
						<TableCell className="text-xs text-amber-600 dark:text-amber-400">skipped: no due lists</TableCell>
					</TableRow>
					<TableRow>
						<TableCell className="font-mono text-xs">2026-05-17 07:00</TableCell>
						<TableCell className="font-mono text-xs">/api/cron/intelligence</TableCell>
						<TableCell>
							<Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30">
								error
							</Badge>
						</TableCell>
						<TableCell className="text-xs">3.4s</TableCell>
						<TableCell className="text-xs text-red-500 font-mono">timeout calling provider</TableCell>
					</TableRow>
				</TableBody>
			</Table>
			<div className="flex items-center justify-between border-t px-3 py-2">
				<span className="text-xs text-muted-foreground">3 of 247 runs</span>
				<div className="flex items-center gap-1">
					<Button size="icon" variant="outline" disabled>
						<ChevronLeft className="size-4" />
					</Button>
					<Button size="icon" variant="outline">
						<ChevronRight className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	)
}

function BorderedRowListBlock() {
	return (
		<ul className="divide-y rounded-md border">
			<li className="flex items-center justify-between p-3">
				<div className="min-w-0">
					<div className="text-sm font-medium">iPhone 15 Pro</div>
					<div className="text-xs text-muted-foreground">Last used 2 hours ago</div>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="outline">
						Rename
					</Button>
					<Button size="sm" variant="outline">
						<Trash2 className="size-4" />
					</Button>
				</div>
			</li>
			<li className="flex items-center justify-between p-3">
				<div className="min-w-0">
					<div className="text-sm font-medium">MacBook Air</div>
					<div className="text-xs text-muted-foreground">Last used 3 days ago</div>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="outline">
						Rename
					</Button>
					<Button size="sm" variant="outline">
						<Trash2 className="size-4" />
					</Button>
				</div>
			</li>
		</ul>
	)
}

function EmptyStateBlock() {
	return (
		<div className="space-y-3">
			<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
				No passkeys registered yet. Add one to sign in without a password.
			</div>
			<div className="text-sm text-muted-foreground">
				Inline empty: <span className="italic">No users found</span>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------

function AlertsBlock() {
	return (
		<div className="space-y-3">
			<Alert>
				<AlertTitle>Info Alert</AlertTitle>
				<AlertDescription>Default variant. Use for neutral context the operator should read once.</AlertDescription>
			</Alert>
			<Alert variant="warning">
				<AlertTitle>Warning Alert</AlertTitle>
				<AlertDescription>
					Yellow tone. Used for "feature configured but not yet active" or "this will affect existing users".
				</AlertDescription>
			</Alert>
			<Alert variant="destructive">
				<AlertTitle>Destructive Alert</AlertTitle>
				<AlertDescription>Red tone. Used for errors and irreversible-action confirmations.</AlertDescription>
			</Alert>
			<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
				<p className="text-sm text-amber-700 dark:text-amber-400">
					Inline amber paragraph. Used for one-line warnings inside a card, like "No key set; lookups will return 503 until one is
					provided."
				</p>
			</div>
			<p className="text-sm text-destructive">Inline destructive text. Used for field-level errors.</p>
		</div>
	)
}

// ---------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------

function BadgesBlock() {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Badge variant="outline" className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
				Running
			</Badge>
			<Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
				Success
			</Badge>
			<Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30">
				Error
			</Badge>
			<Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
				Skipped
			</Badge>
			<Badge variant="secondary">Admin</Badge>
			<Badge variant="outline">User</Badge>
			<Badge variant="outline" className="border-violet-500/40 text-violet-700 dark:text-violet-300">
				<FlaskConical className="size-3" />
				Beta
			</Badge>
			<Badge variant="destructive">
				<Ban className="size-3" />
				Banned
			</Badge>
		</div>
	)
}

// ---------------------------------------------------------------------
// Action button placements
// ---------------------------------------------------------------------

function ButtonPlacementBlock() {
	return (
		<div className="space-y-4">
			<PatternBlock name="Top-Right of Card Header" source="CardHeader flex flex-row justify-between">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<div className="space-y-1.5">
							<CardTitle>Dependents</CardTitle>
							<CardDescription>Pets, babies, and anyone else you gift for.</CardDescription>
						</div>
						<Button size="sm">
							<Plus className="size-4" />
							Add Dependent
						</Button>
					</CardHeader>
				</Card>
			</PatternBlock>

			<PatternBlock name="Inline (Beside Field)" source="flex items-center gap-2 inside the row">
				<div className="flex items-center gap-2 rounded-md border border-border p-4">
					<Input placeholder="Barcode (UPC-A, EAN-13, ITF-14, etc.)" />
					<Button type="button">Test</Button>
				</div>
			</PatternBlock>

			<PatternBlock name="Footer Pair (Cancel + Primary)" source="flex justify-end gap-2 at the end of a form">
				<div className="rounded-md border border-border p-4">
					<div className="text-sm text-muted-foreground">Form body goes here.</div>
					<div className="mt-4 flex justify-end gap-2">
						<Button variant="ghost">Cancel</Button>
						<Button>Save Changes</Button>
					</div>
				</div>
			</PatternBlock>

			<PatternBlock name="Destructive Footer" source="variant='destructive' for the primary action">
				<div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
					<h4 className="text-sm font-semibold text-destructive">Delete Account</h4>
					<p className="mt-1 text-sm text-muted-foreground">Permanently removes your account and every list you own. Cannot be undone.</p>
					<div className="mt-4 flex justify-end gap-2">
						<Button variant="ghost">Cancel</Button>
						<Button variant="destructive">Delete Account</Button>
					</div>
				</div>
			</PatternBlock>
		</div>
	)
}

// ---------------------------------------------------------------------
// Dialog snippets (static representations - we don't open real dialogs
// in the catalog because the trigger flow isn't the point here)
// ---------------------------------------------------------------------

function DialogSnippetBlock() {
	return (
		<div className="space-y-4">
			<PatternBlock name="Form Dialog (Add / Edit)" source="<Dialog> from /ui/dialog">
				<div className="mx-auto w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
					<div className="space-y-1.5">
						<h2 className="text-lg font-semibold">Add Dependent</h2>
						<p className="text-sm text-muted-foreground">Add a pet, baby, or other gift recipient.</p>
					</div>
					<div className="mt-4 space-y-3">
						<div className="flex flex-col gap-2">
							<Label htmlFor="patterns-dialog-name">Name</Label>
							<Input id="patterns-dialog-name" placeholder="Cookie" />
						</div>
					</div>
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="ghost">Cancel</Button>
						<Button>Add Dependent</Button>
					</div>
				</div>
			</PatternBlock>

			<PatternBlock name="Destructive AlertDialog" source="<AlertDialog> from /ui/alert-dialog">
				<div className="mx-auto w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
					<div className="space-y-1.5">
						<h2 className="text-lg font-semibold">Delete Custom Holiday?</h2>
						<p className="text-sm text-muted-foreground">
							This will cascade <span className="font-semibold">2 active lists</span> to the deployment's default list type. Claims will not
							be cleared.
						</p>
					</div>
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="ghost">Cancel</Button>
						<Button variant="destructive">Delete Holiday</Button>
					</div>
				</div>
			</PatternBlock>
		</div>
	)
}

// ---------------------------------------------------------------------
// Page shell snippets (descriptive only - the live routes need TanStack
// Router context, which we don't wire up here)
// ---------------------------------------------------------------------

function PageShellBlock() {
	return (
		<div className="space-y-4">
			<PatternBlock
				name="Single Card Page"
				source='<Card className="animate-page-in max-w-2xl">'
				note="Default for narrow admin pages (/admin/barcode, /admin/auth, etc.). Max-width 2xl, page-in animation."
			>
				<div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
					<code>{'<Card className="animate-page-in max-w-2xl"> … </Card>'}</code>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Two-Column Sidebar + Content"
				source="grid grid-cols-[180px_1fr] md:grid-cols-[165px_1fr]"
				note="Admin and settings routes both use this. The sidebar holds nav links; the content area opens a container query (@container/admin-content) so child grids can adapt."
			>
				<div className="overflow-hidden rounded-md border">
					<div className="grid grid-cols-[120px_1fr]">
						<aside className="border-r bg-muted/30 p-3 text-xs">
							<div className="font-semibold">Admin</div>
							<ul className="mt-2 space-y-1 text-muted-foreground">
								<li>Settings</li>
								<li>Users</li>
								<li>Scheduling</li>
								<li>Email</li>
							</ul>
						</aside>
						<div className="p-4 text-xs text-muted-foreground">Page content here.</div>
					</div>
				</div>
			</PatternBlock>

			<PatternBlock
				name="Stacked Cards Page"
				source='Multiple Cards with className="animate-page-in" stacked in a flex col gap-6'
				note="When a single concern needs multiple sections (/admin/index, /admin/email). Each section is its own Card."
			>
				<div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
					<code>{'<div className="flex flex-col gap-6"> <Card>…</Card> <Card>…</Card> </div>'}</code>
				</div>
			</PatternBlock>
		</div>
	)
}

// ---------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------

export default function AdminPatterns() {
	return (
		<div className="flex flex-col gap-10">
			<header className="flex flex-col gap-1">
				<h2 className="text-2xl font-semibold tracking-tight">Admin & Settings Patterns</h2>
				<p className="text-sm text-muted-foreground">
					Every recurring layout and primitive used across <code>/admin/*</code> and <code>/settings/*</code>. Pairs with{' '}
					<a className="text-primary hover:underline underline-offset-4" href="?path=/story/utilities-theme-project-patterns--default">
						Project Patterns
					</a>
					. The goal: a single place to compare patterns so we can unify shapes that have drifted (label-above vs. label-left forms, inline
					vs. Alert warnings, etc.).
				</p>
			</header>

			<Section title="Page Shells" description="The outermost wrapper for an admin / settings route.">
				<PageShellBlock />
			</Section>

			<Separator />

			<Section title="Card Containers" description="Card is the universal building block. Variants below cover ~95% of existing usage.">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<StandardCard />
					<CardWithHeaderAction />
					<CardWithSubsections />
					<CardWithSubContainer />
					<DenseCard />
				</div>
			</Section>

			<Separator />

			<Section
				title="Form Rows"
				description="The currently-deployed mix. Note that label-left (settings shape) and label-above (profile / password shape) coexist; one of the unification questions is whether to standardize."
			>
				<FormRowsBlock />
			</Section>

			<Separator />

			<Section title="Input Controls" description="Every primitive from /components/ui that an admin or settings surface reaches for.">
				<InputControlsBlock />
			</Section>

			<Separator />

			<Section title="Lists & Tables" description="Three flavors: responsive grid, full data table, simple bordered list.">
				<div className="space-y-6">
					<PatternBlock name="Responsive Grid (User-Row Style)" source="grid grid-cols-subgrid + container queries">
						<ResponsiveListBlock />
					</PatternBlock>
					<PatternBlock name="Data Table (Sortable / Paginated)" source="<Table /> + TanStack Table">
						<DataTableBlock />
					</PatternBlock>
					<PatternBlock name="Bordered Row List (Passkeys / Devices)" source="divide-y rounded-md border">
						<BorderedRowListBlock />
					</PatternBlock>
					<PatternBlock name="Empty States" source="dashed border + muted text, or inline muted line">
						<EmptyStateBlock />
					</PatternBlock>
				</div>
			</Section>

			<Separator />

			<Section title="Alerts & Inline Warnings" description="Two shapes coexist: the structured Alert component and ad-hoc inline text.">
				<AlertsBlock />
			</Section>

			<Separator />

			<Section
				title="Badges"
				description="Status, role, and label badges. Status badges always use outline + colored tint to stay legible on both themes."
			>
				<BadgesBlock />
			</Section>

			<Separator />

			<Section title="Action Button Placement" description="Where buttons sit relative to the surrounding card / form.">
				<ButtonPlacementBlock />
			</Section>

			<Separator />

			<Section title="Dialogs" description="Static representations of the modal shapes. Real triggers live in the source pages.">
				<DialogSnippetBlock />
			</Section>
		</div>
	)
}
