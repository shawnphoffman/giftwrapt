import { AlertTriangle, AtSign, Bold, ChevronRight, Copy, Info, Italic, MoreHorizontal, Search, Star, Underline } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type Swatch = {
	name: string
	bg: string
	fg?: string
	border?: boolean
}

const CORE_SWATCHES: Array<Swatch> = [
	{ name: 'background', bg: 'bg-background', fg: 'text-foreground', border: true },
	{ name: 'foreground', bg: 'bg-foreground', fg: 'text-background' },
	{ name: 'card', bg: 'bg-card', fg: 'text-card-foreground', border: true },
	{ name: 'popover', bg: 'bg-popover', fg: 'text-popover-foreground', border: true },
	{ name: 'primary', bg: 'bg-primary', fg: 'text-primary-foreground' },
	{ name: 'secondary', bg: 'bg-secondary', fg: 'text-secondary-foreground' },
	{ name: 'muted', bg: 'bg-muted', fg: 'text-muted-foreground' },
	{ name: 'accent', bg: 'bg-accent', fg: 'text-accent-foreground' },
	{ name: 'destructive', bg: 'bg-destructive', fg: 'text-destructive-foreground' },
]

const SIDEBAR_SWATCHES: Array<Swatch> = [
	{ name: 'sidebar', bg: 'bg-sidebar', fg: 'text-sidebar-foreground', border: true },
	{ name: 'sidebar-primary', bg: 'bg-sidebar-primary', fg: 'text-sidebar-primary-foreground' },
	{ name: 'sidebar-accent', bg: 'bg-sidebar-accent', fg: 'text-sidebar-accent-foreground' },
]

const UTILITY_SWATCHES: Array<Swatch> = [
	{ name: 'border', bg: 'bg-border' },
	{ name: 'input', bg: 'bg-input' },
	{ name: 'ring', bg: 'bg-ring' },
	{ name: 'sidebar-border', bg: 'bg-sidebar-border' },
	{ name: 'sidebar-ring', bg: 'bg-sidebar-ring' },
]

const CHART_SWATCHES: Array<Swatch> = [
	{ name: 'chart-1', bg: 'bg-chart-1' },
	{ name: 'chart-2', bg: 'bg-chart-2' },
	{ name: 'chart-3', bg: 'bg-chart-3' },
	{ name: 'chart-4', bg: 'bg-chart-4' },
	{ name: 'chart-5', bg: 'bg-chart-5' },
]

function SwatchCard({ swatch }: { swatch: Swatch }) {
	return (
		<div className="flex flex-col gap-1">
			<div
				className={`${swatch.bg} ${swatch.fg ?? ''} ${swatch.border ? 'border' : ''} flex items-end justify-between h-20 px-3 pb-2 rounded-md shadow-xs`}
			>
				{swatch.fg && <span className="text-xs font-medium">Aa</span>}
				<span className="text-[10px] font-mono opacity-60">{swatch.name}</span>
			</div>
			<code className="text-[11px] text-muted-foreground font-mono">{swatch.bg.replace('bg-', '--color-')}</code>
		</div>
	)
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<div>
				<h4 className="font-semibold">{title}</h4>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{children}
		</section>
	)
}

export default function ThemeReference() {
	const [sliderValue, setSliderValue] = useState([60])
	const [switchOn, setSwitchOn] = useState(true)
	const [checkedState, setCheckedState] = useState<'checked' | 'indeterminate' | 'unchecked'>('checked')
	const uid = useId()
	const id = (name: string) => `${uid}-${name}`

	return (
		<div className="flex flex-col gap-10">
			{/* CORE COLORS */}
			<Section title="Core colors" description="Semantic tokens paired with their -foreground counterpart.">
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
					{CORE_SWATCHES.map(s => (
						<SwatchCard key={s.name} swatch={s} />
					))}
				</div>
			</Section>

			{/* SIDEBAR */}
			<Section title="Sidebar colors" description="Used by the app shell; lives on its own scale so sidebars can differ from the main canvas.">
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
					{SIDEBAR_SWATCHES.map(s => (
						<SwatchCard key={s.name} swatch={s} />
					))}
				</div>
			</Section>

			{/* BORDER / INPUT / RING */}
			<Section title="Borders, inputs, rings" description="Flat tokens used for structural lines and focus states.">
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
					{UTILITY_SWATCHES.map(s => (
						<SwatchCard key={s.name} swatch={s} />
					))}
				</div>
			</Section>

			{/* CHART */}
			<Section title="Chart palette" description="Sequential data-viz palette.">
				<div className="grid grid-cols-5 gap-3">
					{CHART_SWATCHES.map(s => (
						<SwatchCard key={s.name} swatch={s} />
					))}
				</div>
			</Section>

			<Separator />

			{/* RADIUS */}
			<Section title="Border radius" description="Scales off --radius (0.625rem by default).">
				<div className="flex flex-wrap items-end gap-4">
					{[
						{ label: 'sm', cls: 'rounded-sm' },
						{ label: 'md', cls: 'rounded-md' },
						{ label: 'lg', cls: 'rounded-lg' },
						{ label: 'xl', cls: 'rounded-xl' },
						{ label: 'full', cls: 'rounded-full' },
					].map(r => (
						<div key={r.label} className="flex flex-col items-center gap-1">
							<div className={`size-16 bg-primary ${r.cls}`} />
							<code className="text-xs text-muted-foreground font-mono">{r.label}</code>
						</div>
					))}
				</div>
			</Section>

			<Separator />

			{/* TYPOGRAPHY */}
			<Section title="Typography" description="Global h1-h4 styles come from styles.css base layer.">
				<div className="flex flex-col gap-2">
					<h1>Heading 1, the big one</h1>
					<h2>Heading 2, section title</h2>
					<h3>Heading 3, subsection</h3>
					<h4>Heading 4, grouping</h4>
					<p className="text-base">Body text. The quick brown fox jumps over the lazy dog.</p>
					<p className="text-sm text-muted-foreground">Muted body. Secondary commentary, hints, helper copy.</p>
					<p className="text-xs text-muted-foreground">Extra small muted text, used for timestamps and microcopy.</p>
					<p className="text-sm">
						Inline <a className="text-primary hover:underline underline-offset-4">link color</a>, a{' '}
						<code className="bg-muted px-1 py-0.5 rounded text-[0.85em] font-mono">code span</code>, and{' '}
						<strong>bold emphasis</strong>.
					</p>
				</div>
			</Section>

			<Separator />

			{/* BUTTONS */}
			<Section title="Buttons" description="Every variant at every size, plus a disabled row.">
				<div className="flex flex-col gap-3">
					{(['default', 'sm', 'lg', 'icon'] as const).map(size => (
						<div key={size} className="flex flex-row flex-wrap items-center gap-2">
							<code className="text-xs text-muted-foreground w-12 font-mono">{size}</code>
							<Button size={size} variant="default" onClick={() => toast.success('default')}>
								{size === 'icon' ? <Star /> : 'default'}
							</Button>
							<Button size={size} variant="secondary" onClick={() => toast.success('secondary')}>
								{size === 'icon' ? <Star /> : 'secondary'}
							</Button>
							<Button size={size} variant="outline" onClick={() => toast.success('outline')}>
								{size === 'icon' ? <Star /> : 'outline'}
							</Button>
							<Button size={size} variant="ghost" onClick={() => toast.success('ghost')}>
								{size === 'icon' ? <Star /> : 'ghost'}
							</Button>
							<Button size={size} variant="destructive" onClick={() => toast.error('destructive')}>
								{size === 'icon' ? <Star /> : 'destructive'}
							</Button>
							<Button size={size} variant="link" onClick={() => toast('link')}>
								{size === 'icon' ? <Star /> : 'link'}
							</Button>
						</div>
					))}
					<div className="flex flex-row flex-wrap items-center gap-2">
						<code className="text-xs text-muted-foreground w-12 font-mono">disabled</code>
						<Button disabled>default</Button>
						<Button disabled variant="secondary">
							secondary
						</Button>
						<Button disabled variant="outline">
							outline
						</Button>
						<Button disabled variant="destructive">
							destructive
						</Button>
					</div>
				</div>
			</Section>

			{/* BADGES */}
			<Section title="Badges">
				<div className="flex flex-row flex-wrap gap-2">
					<Badge>default</Badge>
					<Badge variant="secondary">secondary</Badge>
					<Badge variant="outline">outline</Badge>
					<Badge variant="destructive">destructive</Badge>
					<Badge>
						<Star /> with icon
					</Badge>
				</div>
			</Section>

			<Separator />

			{/* FORM CONTROLS */}
			<Section title="Form controls" description="Default, focused, invalid, and disabled states.">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div className="flex flex-col gap-2">
						<Label htmlFor={id('input-default')}>Input (default)</Label>
						<Input id={id('input-default')} placeholder="Type something" />
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor={id('input-invalid')}>Input (invalid)</Label>
						<Input id={id('input-invalid')} aria-invalid defaultValue="bad value" />
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor={id('input-disabled')}>Input (disabled)</Label>
						<Input id={id('input-disabled')} disabled placeholder="Disabled" />
					</div>
					<div className="flex flex-col gap-2">
						<Label>Select</Label>
						<Select>
							<SelectTrigger>
								<SelectValue placeholder="Pick an option" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="one">Option one</SelectItem>
								<SelectItem value="two">Option two</SelectItem>
								<SelectItem value="three">Option three</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor={id('textarea')}>Textarea</Label>
						<Textarea id={id('textarea')} placeholder="Multi-line input" rows={3} />
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
					<div className="flex flex-col gap-3">
						<Label>Checkbox</Label>
						<div className="flex flex-col gap-2">
							<label className="flex items-center gap-2 text-sm">
								<Checkbox
									checked={checkedState === 'indeterminate' ? 'indeterminate' : checkedState === 'checked'}
									onCheckedChange={v => setCheckedState(v === 'indeterminate' ? 'indeterminate' : v ? 'checked' : 'unchecked')}
								/>
								Toggle me ({checkedState})
							</label>
							<label className="flex items-center gap-2 text-sm text-muted-foreground">
								<Checkbox disabled /> Disabled
							</label>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox aria-invalid defaultChecked /> Invalid
							</label>
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<Label>Switch</Label>
						<div className="flex flex-col gap-2">
							<label className="flex items-center gap-2 text-sm">
								<Switch checked={switchOn} onCheckedChange={setSwitchOn} />
								{switchOn ? 'On' : 'Off'}
							</label>
							<label className="flex items-center gap-2 text-sm text-muted-foreground">
								<Switch disabled /> Disabled
							</label>
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<Label>Radio group</Label>
						<RadioGroup defaultValue="a">
							<label className="flex items-center gap-2 text-sm">
								<RadioGroupItem value="a" /> Option A
							</label>
							<label className="flex items-center gap-2 text-sm">
								<RadioGroupItem value="b" /> Option B
							</label>
							<label className="flex items-center gap-2 text-sm text-muted-foreground">
								<RadioGroupItem value="c" disabled /> Disabled
							</label>
						</RadioGroup>
					</div>
				</div>

				<div className="flex flex-col gap-2 mt-2">
					<Label>Slider</Label>
					<Slider value={sliderValue} onValueChange={setSliderValue} max={100} step={1} />
					<span className="text-xs text-muted-foreground font-mono">value: {sliderValue[0]}</span>
				</div>
			</Section>

			<Separator />

			{/* FIELD COMPOSITION */}
			<Section title="Field composition" description="Canonical shadcn form layout: FieldGroup + Field + FieldLabel + FieldDescription + FieldError.">
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={id('field-email')}>Email</FieldLabel>
						<Input id={id('field-email')} placeholder="hello@example.com" />
						<FieldDescription>We'll never share this. Helper copy lives here.</FieldDescription>
					</Field>
					<Field data-invalid>
						<FieldLabel htmlFor={id('field-invalid')}>Invalid field</FieldLabel>
						<Input id={id('field-invalid')} aria-invalid defaultValue="not-an-email" />
						<FieldError>Must be a valid email address.</FieldError>
					</Field>
					<Field data-disabled>
						<FieldLabel htmlFor={id('field-disabled')}>Disabled field</FieldLabel>
						<Input id={id('field-disabled')} disabled defaultValue="Locked" />
						<FieldDescription>This field can't be edited.</FieldDescription>
					</Field>
				</FieldGroup>
			</Section>

			{/* INPUT GROUP */}
			<Section title="Input group" description="Input with a leading/trailing icon, text, or button addon.">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<InputGroup>
						<InputGroupAddon align="inline-start">
							<Search data-icon="inline-start" />
						</InputGroupAddon>
						<InputGroupInput placeholder="Search..." />
					</InputGroup>
					<InputGroup>
						<InputGroupAddon align="inline-start">
							<AtSign data-icon="inline-start" />
						</InputGroupAddon>
						<InputGroupInput placeholder="username" />
					</InputGroup>
					<InputGroup>
						<InputGroupInput defaultValue="https://example.com/share/abc123" readOnly />
						<InputGroupAddon align="inline-end">
							<Button size="sm" variant="ghost" onClick={() => toast.success('Copied')}>
								<Copy data-icon="inline-start" />
								Copy
							</Button>
						</InputGroupAddon>
					</InputGroup>
					<InputGroup>
						<InputGroupAddon align="inline-start">
							<InputGroupText>$</InputGroupText>
						</InputGroupAddon>
						<InputGroupInput placeholder="0.00" />
						<InputGroupAddon align="inline-end">
							<InputGroupText>USD</InputGroupText>
						</InputGroupAddon>
					</InputGroup>
				</div>
			</Section>

			<Separator />

			{/* OVERLAYS */}
			<Section title="Overlays" description="Tooltip, Popover, DropdownMenu, Dialog, AlertDialog.">
				<div className="flex flex-row flex-wrap items-center gap-3">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="outline">Hover for tooltip</Button>
						</TooltipTrigger>
						<TooltipContent>Tooltip content, anchored above.</TooltipContent>
					</Tooltip>

					<Popover>
						<PopoverTrigger asChild>
							<Button variant="outline">Open popover</Button>
						</PopoverTrigger>
						<PopoverContent className="w-64 flex flex-col gap-2">
							<p className="text-sm font-medium">Popover title</p>
							<p className="text-xs text-muted-foreground">Free-form content inside a popover surface.</p>
							<Button size="sm">Do thing</Button>
						</PopoverContent>
					</Popover>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">
								Dropdown <MoreHorizontal data-icon="inline-end" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent>
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem>
									Edit <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem>
									Duplicate <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem variant="destructive">
									Delete <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<Dialog>
						<DialogTrigger asChild>
							<Button variant="outline">Open dialog</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Dialog title</DialogTitle>
								<DialogDescription>Dialog copy. Used for modal interactions that interrupt the current flow.</DialogDescription>
							</DialogHeader>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor={id('dialog-name')}>Name</FieldLabel>
									<Input id={id('dialog-name')} placeholder="Your name" />
								</Field>
							</FieldGroup>
							<DialogFooter>
								<Button variant="outline">Cancel</Button>
								<Button>Save</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Open alert</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Are you sure?</AlertDialogTitle>
								<AlertDialogDescription>This action can't be undone.</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction>Delete</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</Section>

			{/* ALERTS */}
			<Section title="Alerts">
				<div className="flex flex-col gap-3">
					<Alert>
						<Info />
						<AlertTitle>Heads up</AlertTitle>
						<AlertDescription>Default alert, used for informational messages anchored to a section.</AlertDescription>
					</Alert>
					<Alert variant="destructive">
						<AlertTriangle />
						<AlertTitle>Something went wrong</AlertTitle>
						<AlertDescription>Destructive alert, inline errors that don't warrant a toast.</AlertDescription>
					</Alert>
				</div>
			</Section>

			{/* CARDS */}
			<Section title="Cards" description="Card compositions: full shell, title-only, with action, borders, images, and sizes.">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Full composition</CardTitle>
							<CardDescription>Header, title, description, content, and footer.</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							Body copy lives here. Uses <code className="font-mono">bg-card</code> + <code className="font-mono">text-card-foreground</code>.
						</CardContent>
						<CardFooter className="justify-end gap-2">
							<Button size="sm" variant="outline">
								Cancel
							</Button>
							<Button size="sm">Save</Button>
						</CardFooter>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Header with action</CardTitle>
							<CardDescription>CardAction slots to the right of the title.</CardDescription>
							<CardAction>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button size="sm" variant="ghost">
											<MoreHorizontal />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem>Edit</DropdownMenuItem>
										<DropdownMenuItem>Duplicate</DropdownMenuItem>
										<DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</CardAction>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">Use this when the card needs a menu or overflow control.</CardContent>
					</Card>

					<Card>
						<CardHeader className="border-b">
							<CardTitle>Bordered header</CardTitle>
							<CardDescription>Add `border-b` to CardHeader for a divider.</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							Content sits flush under the divider. Common for settings groups or list-style cards.
						</CardContent>
						<CardFooter className="border-t justify-between">
							<span className="text-xs text-muted-foreground">Updated 2m ago</span>
							<Button size="sm" variant="ghost">
								View
							</Button>
						</CardFooter>
					</Card>

					<Card size="sm">
						<CardHeader>
							<CardTitle>Compact (size="sm")</CardTitle>
							<CardDescription>Reduced padding and tighter type.</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">Good for sidebars or dense dashboards.</CardContent>
					</Card>

					<Card>
						<CardContent className="text-sm">
							<p className="font-medium">Content-only card</p>
							<p className="text-muted-foreground">No header or footer. Just the surface.</p>
						</CardContent>
					</Card>

					<Card className="bg-muted/40">
						<CardHeader>
							<CardTitle>Muted background</CardTitle>
							<CardDescription>Overriding `bg-card` to compare layering against neighbors.</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							Useful when cards sit on a card-colored surface and need visual separation.
						</CardContent>
					</Card>

					<Card>
						<img src="https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=640&auto=format&fit=crop&q=80" alt="" className="h-32 w-full object-cover" />
						<CardHeader>
							<CardTitle>Media card</CardTitle>
							<CardDescription>Image as the first child auto-removes the top padding.</CardDescription>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">Pair with CardFooter for a media + meta layout.</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Stat card</CardTitle>
							<CardDescription>Emphasis on a single value.</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-baseline gap-2">
								<span className="text-3xl font-bold tabular-nums">$12,430</span>
								<Badge variant="secondary">+4.2%</Badge>
							</div>
							<p className="text-xs text-muted-foreground mt-1">Revenue this month</p>
						</CardContent>
					</Card>
				</div>
			</Section>

			{/* AVATAR */}
			<Section title="Avatars" description="Image + fallback, grouped, and with a badge.">
				<div className="flex flex-row flex-wrap items-center gap-4">
					<Avatar>
						<AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
						<AvatarFallback>SH</AvatarFallback>
					</Avatar>
					<Avatar>
						<AvatarFallback>AB</AvatarFallback>
					</Avatar>
					<Avatar className="size-12">
						<AvatarFallback>LG</AvatarFallback>
					</Avatar>
					<AvatarGroup>
						<Avatar>
							<AvatarFallback>A</AvatarFallback>
						</Avatar>
						<Avatar>
							<AvatarFallback>B</AvatarFallback>
						</Avatar>
						<Avatar>
							<AvatarFallback>C</AvatarFallback>
						</Avatar>
						<AvatarGroupCount>+4</AvatarGroupCount>
					</AvatarGroup>
				</div>
			</Section>

			{/* TABLE */}
			<Section title="Table" description="Structured data display.">
				<Table>
					<TableCaption>A list of recent invoices.</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead>Invoice</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Method</TableHead>
							<TableHead className="text-right">Amount</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						<TableRow>
							<TableCell className="font-medium">INV001</TableCell>
							<TableCell>
								<Badge>Paid</Badge>
							</TableCell>
							<TableCell>Card</TableCell>
							<TableCell className="text-right">$250.00</TableCell>
						</TableRow>
						<TableRow>
							<TableCell className="font-medium">INV002</TableCell>
							<TableCell>
								<Badge variant="secondary">Pending</Badge>
							</TableCell>
							<TableCell>PayPal</TableCell>
							<TableCell className="text-right">$150.00</TableCell>
						</TableRow>
						<TableRow>
							<TableCell className="font-medium">INV003</TableCell>
							<TableCell>
								<Badge variant="destructive">Failed</Badge>
							</TableCell>
							<TableCell>Card</TableCell>
							<TableCell className="text-right">$350.00</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			</Section>

			{/* BREADCRUMB */}
			<Section title="Breadcrumb">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href="#">Home</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator>
							<ChevronRight />
						</BreadcrumbSeparator>
						<BreadcrumbItem>
							<BreadcrumbLink href="#">Lists</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator>
							<ChevronRight />
						</BreadcrumbSeparator>
						<BreadcrumbItem>
							<BreadcrumbPage>Current list</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</Section>

			{/* TOGGLE GROUP */}
			<Section title="Toggle group" description="Single and multiple selection, with and without outline.">
				<div className="flex flex-col gap-3">
					<ToggleGroup type="multiple" defaultValue={['bold']}>
						<ToggleGroupItem value="bold" aria-label="Bold">
							<Bold />
						</ToggleGroupItem>
						<ToggleGroupItem value="italic" aria-label="Italic">
							<Italic />
						</ToggleGroupItem>
						<ToggleGroupItem value="underline" aria-label="Underline">
							<Underline />
						</ToggleGroupItem>
					</ToggleGroup>
					<ToggleGroup type="single" defaultValue="left" variant="outline">
						<ToggleGroupItem value="left">Left</ToggleGroupItem>
						<ToggleGroupItem value="center">Center</ToggleGroupItem>
						<ToggleGroupItem value="right">Right</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</Section>

			<Separator />

			{/* SKELETON */}
			<Section title="Skeleton" description="Loading placeholders.">
				<div className="flex flex-col gap-2 max-w-md">
					<Skeleton className="h-6 w-3/4" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<div className="flex items-center gap-3 mt-2">
						<Skeleton className="size-10 rounded-full" />
						<div className="flex flex-col gap-2 flex-1">
							<Skeleton className="h-4 w-1/3" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
				</div>
			</Section>

			<Separator />

			{/* TOASTS */}
			<Section title="Toasts" description="Sonner-based toasts, triggered from buttons.">
				<div className="flex flex-row flex-wrap gap-2">
					<Button onClick={() => toast('Neutral toast')}>Neutral</Button>
					<Button variant="secondary" onClick={() => toast.info('Info toast')}>
						Info
					</Button>
					<Button onClick={() => toast.success('Success toast')}>Success</Button>
					<Button variant="destructive" onClick={() => toast.error('Error toast')}>
						Error
					</Button>
				</div>
			</Section>
		</div>
	)
}
