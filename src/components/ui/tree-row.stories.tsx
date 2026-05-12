import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'

import { Input } from './input'
import { Label } from './label'
import { Switch } from './switch'
import { TreeBranch, TreeGroup, TreeRow } from './tree-row'

function ParentRow({
	id,
	title,
	description,
	checked,
	onChange,
}: {
	id: string
	title: string
	description: string
	checked: boolean
	onChange: (v: boolean) => void
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-base">
					{title}
				</Label>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<Switch id={id} checked={checked} onCheckedChange={onChange} />
		</div>
	)
}

function DaysControl({ id, value, disabled }: { id: string; value: number; disabled?: boolean }) {
	return (
		<div className="flex items-center gap-2">
			<Input id={id} type="number" defaultValue={value} disabled={disabled} className="w-20" />
			<span className="text-sm text-muted-foreground">days</span>
		</div>
	)
}

const meta = {
	title: 'Utilities/Components/TreeRow',
	parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ThreeChildren: Story = {
	render: () => {
		const [on, setOn] = React.useState(true)
		return (
			<div className="max-w-2xl">
				<TreeGroup>
					<ParentRow
						id="parent-a"
						title="Parent toggle"
						description="Three direct children. Trunk should terminate at the last child's elbow."
						checked={on}
						onChange={setOn}
					/>
					<TreeBranch>
						<TreeRow
							htmlFor="child-1"
							label="First child"
							description="A simple labelled row with a switch."
							control={<Switch id="child-1" defaultChecked />}
							disabled={!on}
						/>
						<TreeRow
							htmlFor="child-2"
							label="Second child"
							description="A row with a numeric control."
							control={<DaysControl id="child-2" value={7} disabled={!on} />}
							disabled={!on}
						/>
						<TreeRow
							htmlFor="child-3"
							label="Third child"
							description="Last child - the trunk should stop at this elbow."
							control={<Switch id="child-3" />}
							disabled={!on}
						/>
					</TreeBranch>
				</TreeGroup>
			</div>
		)
	},
}

export const Grandchild: Story = {
	render: () => {
		const [on, setOn] = React.useState(true)
		const [inner, setInner] = React.useState(true)
		return (
			<div className="max-w-2xl">
				<TreeGroup>
					<ParentRow
						id="parent-b"
						title="Parent toggle"
						description="One child has a deeper nested child below it."
						checked={on}
						onChange={setOn}
					/>
					<TreeBranch>
						<TreeRow
							htmlFor="b-1"
							label="Plain child"
							description="A normal child row."
							control={<Switch id="b-1" defaultChecked />}
							disabled={!on}
						/>
						<TreeRow
							htmlFor="b-2"
							label="Child with nested branch"
							description="Toggling this enables the grandchild below."
							control={<Switch id="b-2" checked={inner} onCheckedChange={setInner} />}
							disabled={!on}
						>
							<TreeBranch>
								<TreeRow
									htmlFor="b-2-1"
									label="Grandchild"
									description="Depth 2 row. Its own short trunk emerges from its parent's elbow."
									control={<DaysControl id="b-2-1" value={30} disabled={!on || !inner} />}
									disabled={!on || !inner}
								/>
							</TreeBranch>
						</TreeRow>
					</TreeBranch>
				</TreeGroup>
			</div>
		)
	},
}

export const ConditionalChildren: Story = {
	render: () => {
		const [on, setOn] = React.useState(true)
		const [showMiddle, setShowMiddle] = React.useState(false)
		return (
			<div className="max-w-2xl space-y-6">
				<div className="flex items-center justify-between rounded-md border border-dashed p-3">
					<Label htmlFor="show-middle" className="text-sm">
						Show middle child (toggle to verify `:last-child` re-resolves)
					</Label>
					<Switch id="show-middle" checked={showMiddle} onCheckedChange={setShowMiddle} />
				</div>
				<TreeGroup>
					<ParentRow
						id="parent-c"
						title="Parent toggle"
						description="Middle child is conditionally rendered."
						checked={on}
						onChange={setOn}
					/>
					<TreeBranch>
						<TreeRow htmlFor="c-1" label="First child" control={<Switch id="c-1" defaultChecked />} disabled={!on} />
						{showMiddle && <TreeRow htmlFor="c-2" label="Middle child (conditional)" control={<Switch id="c-2" />} disabled={!on} />}
						<TreeRow
							htmlFor="c-3"
							label="Last child"
							description="Trunk must terminate here regardless of the middle row's presence."
							control={<Switch id="c-3" />}
							disabled={!on}
						/>
					</TreeBranch>
				</TreeGroup>
			</div>
		)
	},
}

export const DisabledBranch: Story = {
	render: () => (
		<div className="max-w-2xl">
			<TreeGroup>
				<ParentRow
					id="parent-d"
					title="Disabled parent"
					description="Children content fades but tree lines stay full-opacity so the hierarchy is still legible."
					checked={false}
					onChange={() => {}}
				/>
				<TreeBranch>
					<TreeRow
						htmlFor="d-1"
						label="Faded child"
						description="Content should be 50% opacity."
						control={<Switch id="d-1" disabled />}
						disabled
					/>
					<TreeRow
						htmlFor="d-2"
						label="Faded child"
						description="Content should be 50% opacity."
						control={<DaysControl id="d-2" value={14} disabled />}
						disabled
					/>
					<TreeRow
						htmlFor="d-3"
						label="Faded child"
						description="Content should be 50% opacity."
						control={<Switch id="d-3" disabled />}
						disabled
					/>
				</TreeBranch>
			</TreeGroup>
		</div>
	),
}

export const HolidayListsMockup: Story = {
	render: () => {
		const [holidaysOn, setHolidaysOn] = React.useState(true)
		const [emailsOn, setEmailsOn] = React.useState(false)
		const [remindersOn, setRemindersOn] = React.useState(false)
		const disabled = !holidaysOn
		return (
			<div className="max-w-2xl space-y-2">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold">Holiday Lists</h2>
					<p className="text-sm text-muted-foreground">
						Generic holiday lists (Easter, Mother&apos;s Day, Halloween, and more), with auto-archiving after each holiday and an optional
						email summary.
					</p>
				</div>
				<div className="pt-4">
					<TreeGroup>
						<ParentRow
							id="enableGenericHolidayLists"
							title="Enable Holiday Lists"
							description="Allow users to create lists for occasions like Easter, Mother's Day, Halloween, Diwali, etc. Christmas remains a separate list type above."
							checked={holidaysOn}
							onChange={setHolidaysOn}
						/>
						<TreeBranch>
							<TreeRow
								htmlFor="archiveDaysAfterHoliday"
								label="Archive after holiday"
								description="Days after a holiday's end date to automatically archive claimed items on holiday-typed lists. Multi-day holidays archive against the end of the festival."
								control={<DaysControl id="archiveDaysAfterHoliday" value={14} disabled={disabled} />}
								disabled={disabled}
							/>
							<TreeRow
								htmlFor="enableGenericHolidayEmails"
								label="Enable holiday emails"
								description="Send a generic post-holiday email when items are auto-archived on holiday lists"
								control={<Switch id="enableGenericHolidayEmails" checked={emailsOn} onCheckedChange={setEmailsOn} disabled={disabled} />}
								disabled={disabled}
							/>
							<TreeRow
								htmlFor="enableHolidayReminderEmails"
								label="Send pre-holiday reminder emails"
								description="Broadcast a reminder N days before each custom holiday, prompting users to make a list"
								control={
									<Switch id="enableHolidayReminderEmails" checked={remindersOn} onCheckedChange={setRemindersOn} disabled={disabled} />
								}
								disabled={disabled}
							>
								<TreeBranch>
									<TreeRow
										htmlFor="holidayReminderLeadDays"
										label="Holiday reminder lead time"
										description="Days before a holiday to broadcast the pre-holiday reminder"
										control={<DaysControl id="holidayReminderLeadDays" value={30} disabled={disabled || !remindersOn} />}
										disabled={disabled || !remindersOn}
									/>
								</TreeBranch>
							</TreeRow>
						</TreeBranch>
					</TreeGroup>
				</div>
			</div>
		)
	},
}
