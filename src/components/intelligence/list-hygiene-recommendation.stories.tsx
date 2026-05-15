// Storybook stories per list-hygiene rec variant. Bucketed under
// `Intelligence / List hygiene` so screenshots are easy to scan and tweak
// when copy or layout shifts. Each variant exercises a distinct rec kind
// or rec state (active / dismissed / applied) so QA can verify the card
// renders correctly across the analyzer's whole decision tree.

import type { Meta, StoryObj } from '@storybook/react-vite'

import { withPageContainer } from '../../../.storybook/decorators'
import { listHygieneRecsByKind } from './__fixtures__/data'
import { RecommendationCard } from './recommendation-card'

const meta = {
	title: 'Intelligence/List hygiene',
	component: RecommendationCard,
	parameters: { layout: 'fullscreen' },
	decorators: [withPageContainer],
} satisfies Meta<typeof RecommendationCard>

export default meta
type Story = StoryObj<typeof meta>

// === Branch 1: convert public non-matching list ===

export const ConvertPublicListForBirthday: Story = {
	args: { rec: listHygieneRecsByKind.convertBirthday },
}

export const ConvertPublicListForChristmas: Story = {
	args: { rec: listHygieneRecsByKind.convertChristmas },
}

export const ConvertPublicListHolidayRebind: Story = {
	args: { rec: listHygieneRecsByKind.convertHolidayRebind },
}

// AI-assisted rename variant (phase 2). Same rec card; the difference
// is the proposed `newName` in the apply payload — what the AI returns
// when the toggle is enabled and the response passes validation.
// Renders to verify the card looks right when the model rebuilds the
// owner's first name around the event (regex path would preserve
// "Sam's Big List" verbatim instead).
export const ConvertPublicListWithAiName: Story = {
	args: { rec: listHygieneRecsByKind.convertBirthdayAiNamed },
}

// === Branch 2: flip private matching list public ===

export const MakePrivateMatchingListPublic: Story = {
	args: { rec: listHygieneRecsByKind.makePublic },
}

// === Branch 3: create event list ===

export const CreateEventListForUser: Story = {
	args: { rec: listHygieneRecsByKind.createEventList },
}

export const CreateEventListForDependent: Story = {
	args: { rec: listHygieneRecsByKind.createEventListDependent },
}

// === Branch 4: rotate primary ===

export const WrongPrimaryForEvent: Story = {
	args: { rec: listHygieneRecsByKind.wrongPrimary },
}

// === Duplicate-event-lists merge (phase 2) ===

export const MergeTwoWishlists: Story = {
	args: { rec: listHygieneRecsByKind.mergeTwoWishlists },
}

export const MergeThreeWishlists: Story = {
	args: { rec: listHygieneRecsByKind.mergeThreeWishlists },
}

export const MergeHolidayCluster: Story = {
	args: { rec: listHygieneRecsByKind.mergeHolidayCluster },
}

// === Stale-public-list (phase 2) ===
// Two-action card (Archive + Convert to wishlist). Branch-specific
// body copy varies — event-passed mentions the event/days-ago,
// inactive mentions the year-without-touches, the combined variant
// appends the "also" sentence.

export const StalePublicEventPassed: Story = {
	args: { rec: listHygieneRecsByKind.stalePublicEventPassed },
}

export const StalePublicInactive: Story = {
	args: { rec: listHygieneRecsByKind.stalePublicInactive },
}

export const StalePublicBoth: Story = {
	args: { rec: listHygieneRecsByKind.stalePublicBoth },
}

// === States ===

export const ConvertDismissed: Story = {
	args: { rec: { ...listHygieneRecsByKind.convertBirthday, status: 'dismissed', dismissedAt: new Date() } },
}

export const ConvertApplied: Story = {
	args: { rec: { ...listHygieneRecsByKind.convertBirthday, status: 'applied' } },
}

export const ConvertBusy: Story = {
	args: { rec: listHygieneRecsByKind.convertBirthday, pending: true },
}
