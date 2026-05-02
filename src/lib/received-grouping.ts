import type { GifterUnit, ReceivedAddonRow, ReceivedGiftRow } from '@/api/received'

// ===============================
// Received-page grouping
// ===============================
// Mirror of `purchases-grouping.ts` but flipped along the natural axis of the
// received page: the viewer is the recipient, so rows are grouped by gifter
// household ("unit"). Two co-gifters from the same household collapse into
// one unit; partner-pair gifters appear as a single row labeled "Alice &
// Bob". The viewer's own partner is forced solo by the API layer (see
// `buildGifterUnits`), so they appear as their own row here.
//
// Cost is intentionally absent. Recipients shouldn't see dollar amounts; all
// metrics are item / addon counts.

export type ReceivedRow = ReceivedGiftRow | ReceivedAddonRow

export type GifterUnitGroup = {
	key: string
	label: string
	members: GifterUnit['members']
	rows: Array<ReceivedRow>
	giftCount: number
	addonCount: number
	totalCount: number
}

// A row credited to multiple units appears in each unit's group, so the sum
// of `totalCount` across groups can exceed `rows.length` (matches how the
// purchases page treats co-gifters across recipients).
export function groupByGifterUnit(rows: ReadonlyArray<ReceivedRow>): Array<GifterUnitGroup> {
	const map = new Map<string, GifterUnitGroup>()
	for (const row of rows) {
		for (const unit of row.gifterUnits) {
			let group = map.get(unit.key)
			if (!group) {
				group = {
					key: unit.key,
					label: unit.label,
					members: unit.members,
					rows: [],
					giftCount: 0,
					addonCount: 0,
					totalCount: 0,
				}
				map.set(unit.key, group)
			}
			group.rows.push(row)
			if (row.type === 'item') group.giftCount++
			else group.addonCount++
			group.totalCount++
		}
	}
	return Array.from(map.values()).sort((a, b) => b.totalCount - a.totalCount)
}
