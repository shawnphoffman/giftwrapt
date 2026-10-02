import { Column, Hr, Img, Link, Row, Section, Text } from 'react-email'

import type { ReminderPickGroup } from '@/lib/cron/reminder-picks'

const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002'
const placeholderImage = `${baseUrl}/images/email/gift.png`

/**
 * "A few things still open" block shared by the relationship reminder
 * emails. Renders nothing without picks, so the email reads exactly as
 * it did before when there is nothing to suggest.
 *
 * It says only that these are still open. Who claimed anything else, and
 * how much of something is left, stay out of email.
 */
export function ReminderPicks({ picks }: { picks?: ReadonlyArray<ReminderPickGroup> }) {
	const groups = (picks ?? []).filter(g => g.items.length > 0)
	if (groups.length === 0) return null
	return (
		<>
			<Hr className="mx-0 my-[20px] w-full border border-[#eaeaea] border-solid" />
			{groups.map(group => (
				<Section key={group.personName} className="mb-[12px]">
					<Text className="m-0 mb-[8px] text-[14px] font-bold text-black leading-[24px]">Still open on {group.personName}’s list</Text>
					{group.items.map(item => (
						<Row key={item.path} className="mb-[8px]">
							<Column className="w-[56px] align-top">
								<Img src={item.imageUrl || placeholderImage} width="48" height="48" alt="" className="rounded" />
							</Column>
							<Column className="align-top">
								<Text className="m-0 text-[14px] text-black leading-[20px]">
									<Link href={`${baseUrl}${item.path}`}>{item.title}</Link>
								</Text>
								{item.price ? <Text className="m-0 text-[12px] text-[#666666] leading-[18px]">{item.price}</Text> : null}
							</Column>
						</Row>
					))}
				</Section>
			))}
		</>
	)
}
