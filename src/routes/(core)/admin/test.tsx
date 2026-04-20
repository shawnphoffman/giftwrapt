import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Info, Star } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/(core)/admin/test')({
	component: RouteComponent,
})

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

function RouteComponent() {
	const [sliderValue, setSliderValue] = useState([60])
	const [switchOn, setSwitchOn] = useState(true)
	const [checkedState, setCheckedState] = useState<'checked' | 'indeterminate' | 'unchecked'>('checked')

	return (
		<Card className="animate-page-in">
			<CardHeader>
				<CardTitle className="text-2xl">Theme Reference</CardTitle>
				<p className="text-sm text-muted-foreground">
					Every semantic color token, radius, and common component rendered side-by-side. Swap light and dark mode to verify
					contrast.
				</p>
			</CardHeader>
			<CardContent className="flex flex-col gap-10">
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
						<h1>Heading 1 — the big one</h1>
						<h2>Heading 2 — section title</h2>
						<h3>Heading 3 — subsection</h3>
						<h4>Heading 4 — grouping</h4>
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
							<Label>Input (default)</Label>
							<Input placeholder="Type something" />
						</div>
						<div className="flex flex-col gap-2">
							<Label>Input (invalid)</Label>
							<Input aria-invalid defaultValue="bad value" />
						</div>
						<div className="flex flex-col gap-2">
							<Label>Input (disabled)</Label>
							<Input disabled placeholder="Disabled" />
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
							<Label>Textarea</Label>
							<Textarea placeholder="Multi-line input" rows={3} />
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

				{/* ALERTS */}
				<Section title="Alerts">
					<div className="flex flex-col gap-3">
						<Alert>
							<Info />
							<AlertTitle>Heads up</AlertTitle>
							<AlertDescription>Default alert — used for informational messages anchored to a section.</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<AlertTriangle />
							<AlertTitle>Something went wrong</AlertTitle>
							<AlertDescription>Destructive alert — inline errors that don't warrant a toast.</AlertDescription>
						</Alert>
					</div>
				</Section>

				{/* CARDS */}
				<Section title="Cards" description="Card surface on page background.">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Card>
							<CardHeader>
								<CardTitle>Card title</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								Card content. Uses <code className="font-mono">bg-card</code> + <code className="font-mono">text-card-foreground</code>.
							</CardContent>
							<CardFooter className="justify-end">
								<Button size="sm">Action</Button>
							</CardFooter>
						</Card>
						<Card className="bg-muted/40">
							<CardHeader>
								<CardTitle>Muted card</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								Same card component with a muted background to compare layering.
							</CardContent>
						</Card>
					</div>
				</Section>

				<Separator />

				{/* TOASTS + SKELETON */}
				<Section title="Toasts & skeleton" description="Keep the original smoke tests handy.">
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
					<LoadingSkeleton />
				</Section>
			</CardContent>
		</Card>
	)
}
