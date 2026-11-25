// The gift exchange draw (plan 39). Pure functions: no database access and no
// server-only imports, so the client can run the same "can names be drawn?"
// check on an unsaved rule change.
//
// Everything works on member ids and an "allowed" relation: for each giver,
// the set of members they can gift to. Building that relation (the fixed
// limits plus the admin's No answers) is the server's job, see `rules.ts`.
// A giver is never allowed to draw themselves, whatever the relation says.
//
// Randomness comes from an injected `RandomInt` so tests are repeatable. On
// the server pass `secureRandomInt` from `secure-random.ts`.
//
// Avoiding repeats (plan 40): `avoid` is a list of pairs from an earlier
// exchange. It is a preference, never a rule: the draw leaves those pairs out
// when it can and uses them when it can't. See `drawAssignments` for where it
// ranks against loops and swaps.

// ===============================
// Types
// ===============================

/** Returns an integer in [0, maxExclusive). Same contract as `crypto.randomInt(max)`. */
export type RandomInt = (maxExclusive: number) => number

/** Giver member id to the member ids they can gift to. Missing giver means nobody. */
export type AllowedRelation = ReadonlyMap<string, ReadonlySet<string>>

/** One directed pair of members. */
export type MemberPair = { giverMemberId: string; recipientMemberId: string }

/**
 * A group that can't be matched although everyone in it has options.
 *
 * - `givers`: these givers can only gift to `recipients`, and there are fewer
 *   recipients than givers ("Ruth, Dana and Omar can only gift to Nora and Ben").
 * - `recipients`: only `givers` can gift to these recipients, and there are fewer
 *   givers than recipients ("Only Nora and Ben can gift to Ruth, Dana and Omar").
 *
 * In both shapes the short list has exactly one fewer person than the long one.
 */
export type StuckGroup =
	| { side: 'givers'; givers: Array<string>; recipients: Array<string> }
	| { side: 'recipients'; recipients: Array<string>; givers: Array<string> }

/** Why no perfect matching exists. */
export type MatchingProblem =
	| {
			reason: 'no-options'
			/** Members who have nobody they can gift to. */
			nobodyToGiftTo: Array<string>
			/** Members nobody can gift to. */
			nobodyCanGiftTo: Array<string>
	  }
	| { reason: 'stuck-group'; group: StuckGroup }

/** Why names can't be drawn. Adds the minimum size to the matching problems. */
export type DrawProblem = { reason: 'too-few-members'; memberCount: number; minimum: number } | MatchingProblem

export type MatchingCheck = { ok: true } | ({ ok: false } & MatchingProblem)
export type DrawCheck = { ok: true } | ({ ok: false } & DrawProblem)

/**
 * Which preference level the draw reached:
 * 1. `single-loop`: one loop through everyone.
 * 2. `no-swaps`: several loops, none of two people.
 * 3. `any`: swaps (two people who have each other) were needed.
 */
export type DrawLevel = 'single-loop' | 'no-swaps' | 'any'

export type DrawResult =
	| {
			ok: true
			/** Giver member id to recipient member id, one entry per member. */
			assignments: Map<string, string>
			level: DrawLevel
	  }
	| ({ ok: false } & DrawProblem)

export type DrawOptions = {
	randomInt: RandomInt
	/** Steps the single-loop search may take before giving up on that level. */
	loopStepBudget?: number
	/** Steps the no-swaps search may take before giving up on that level. */
	noSwapStepBudget?: number
	/**
	 * Pairs to leave out when possible (who had whom in an earlier exchange).
	 * One direction each. Pairs the relation doesn't allow anyway, or that name
	 * someone outside `memberIds`, are ignored.
	 */
	avoid?: Iterable<MemberPair>
}

// ===============================
// Constants
// ===============================

/** With two people each knows who has them, so the draw needs three. */
export const MIN_DRAW_MEMBERS = 3

export const DEFAULT_LOOP_STEP_BUDGET = 50_000
export const DEFAULT_NO_SWAP_STEP_BUDGET = 50_000

// ===============================
// Building the relation
// ===============================

/**
 * Builds an allowed relation where everyone can gift to everyone else in
 * `memberIds` except for the listed pairs. Self pairs are always left out.
 */
export function buildAllowedRelation(memberIds: ReadonlyArray<string>, disallowed: Iterable<MemberPair> = []): Map<string, Set<string>> {
	const relation = new Map<string, Set<string>>()
	for (const giver of memberIds) {
		relation.set(giver, new Set(memberIds.filter(r => r !== giver)))
	}
	for (const { giverMemberId, recipientMemberId } of disallowed) {
		relation.get(giverMemberId)?.delete(recipientMemberId)
	}
	return relation
}

// Allowed recipients of each member, limited to members in the set and never
// the member themselves. Ordered as in `memberIds` so results don't depend
// on Set insertion order.
function normalize(memberIds: ReadonlyArray<string>, allowed: AllowedRelation): Map<string, Array<string>> {
	const members = new Set(memberIds)
	const out = new Map<string, Array<string>>()
	for (const giver of memberIds) {
		const set = allowed.get(giver)
		out.set(
			giver,
			memberIds.filter(r => r !== giver && members.has(r) && (set?.has(r) ?? false))
		)
	}
	return out
}

function reverse(memberIds: ReadonlyArray<string>, options: Map<string, Array<string>>): Map<string, Array<string>> {
	const givers = new Map<string, Array<string>>(memberIds.map(id => [id, []]))
	for (const giver of memberIds) {
		for (const r of options.get(giver) ?? []) givers.get(r)!.push(giver)
	}
	return givers
}

// `options` with the `avoid` pairs taken out. Null when that removes nothing,
// so a draw with nothing to avoid takes exactly the steps, and the random
// numbers, of a draw with no `avoid` at all.
function withoutPairs(
	memberIds: ReadonlyArray<string>,
	options: Map<string, Array<string>>,
	avoid: Iterable<MemberPair> | undefined
): Map<string, Array<string>> | null {
	if (!avoid) return null
	const dropped = new Map<string, Set<string>>()
	for (const { giverMemberId, recipientMemberId } of avoid) {
		if (!(options.get(giverMemberId)?.includes(recipientMemberId) ?? false)) continue
		const set = dropped.get(giverMemberId) ?? new Set<string>()
		set.add(recipientMemberId)
		dropped.set(giverMemberId, set)
	}
	if (dropped.size === 0) return null
	return new Map(
		memberIds.map(giver => {
			const drop = dropped.get(giver)
			const all = options.get(giver)!
			return [giver, drop ? all.filter(r => !drop.has(r)) : all]
		})
	)
}

// ===============================
// Matching (augmenting paths)
// ===============================

type Matching = {
	/** giver -> recipient */
	giverTo: Map<string, string>
	/** recipient -> giver */
	recipientFrom: Map<string, string>
}

// Kuhn's algorithm. Givers are tried in `giverOrder` and each giver's options
// in the order given, so shuffling both gives a random maximum matching.
function maximumMatching(giverOrder: ReadonlyArray<string>, options: Map<string, ReadonlyArray<string>>): Matching {
	const giverTo = new Map<string, string>()
	const recipientFrom = new Map<string, string>()

	const tryAssign = (giver: string, visited: Set<string>): boolean => {
		for (const r of options.get(giver) ?? []) {
			if (visited.has(r)) continue
			visited.add(r)
			const holder = recipientFrom.get(r)
			if (holder === undefined || tryAssign(holder, visited)) {
				giverTo.set(giver, r)
				recipientFrom.set(r, giver)
				return true
			}
		}
		return false
	}

	for (const giver of giverOrder) tryAssign(giver, new Set())
	return { giverTo, recipientFrom }
}

/**
 * Whether every member can be given exactly one person to gift to with each
 * member gifted to exactly once, and if not, why. Does not apply the minimum
 * size; see `checkDraw`.
 */
export function checkMatching(memberIds: ReadonlyArray<string>, allowed: AllowedRelation): MatchingCheck {
	const options = normalize(memberIds, allowed)
	const giversOf = reverse(memberIds, options)

	const nobodyToGiftTo = memberIds.filter(id => options.get(id)!.length === 0)
	const nobodyCanGiftTo = memberIds.filter(id => giversOf.get(id)!.length === 0)
	if (nobodyToGiftTo.length > 0 || nobodyCanGiftTo.length > 0) {
		return { ok: false, reason: 'no-options', nobodyToGiftTo, nobodyCanGiftTo }
	}

	const matching = maximumMatching(memberIds, options)
	if (matching.giverTo.size === memberIds.length) return { ok: true }
	return { ok: false, reason: 'stuck-group', group: findStuckGroup(memberIds, options, giversOf, matching) }
}

/** `checkMatching` plus the three-person minimum. What Draw Names and Redraw check. */
export function checkDraw(memberIds: ReadonlyArray<string>, allowed: AllowedRelation): DrawCheck {
	if (memberIds.length < MIN_DRAW_MEMBERS) {
		return { ok: false, reason: 'too-few-members', memberCount: memberIds.length, minimum: MIN_DRAW_MEMBERS }
	}
	return checkMatching(memberIds, allowed)
}

// ===============================
// Stuck group (Hall's condition)
// ===============================

// From an unmatched giver, follow alternating paths (any allowed edge from a
// giver, the matched edge back from a recipient). Every recipient reached is
// matched (otherwise there would be an augmenting path), so the reached givers
// outnumber their combined options by exactly one. The recipient side is the
// mirror image. Each unmatched member is tried and the smallest group on each
// side kept; the shorter side is reported, givers on a tie.
function findStuckGroup(
	memberIds: ReadonlyArray<string>,
	options: Map<string, Array<string>>,
	giversOf: Map<string, Array<string>>,
	matching: Matching
): StuckGroup {
	const order = new Map(memberIds.map((id, i) => [id, i]))
	const sorted = (ids: Iterable<string>) => [...ids].sort((a, b) => order.get(a)! - order.get(b)!)

	let bestGivers: { givers: Set<string>; recipients: Set<string> } | null = null
	for (const start of memberIds) {
		if (matching.giverTo.has(start)) continue
		const givers = new Set([start])
		const recipients = new Set<string>()
		const queue = [start]
		while (queue.length > 0) {
			const g = queue.shift()!
			for (const r of options.get(g)!) {
				if (recipients.has(r)) continue
				recipients.add(r)
				const next = matching.recipientFrom.get(r)
				if (next !== undefined && !givers.has(next)) {
					givers.add(next)
					queue.push(next)
				}
			}
		}
		if (!bestGivers || givers.size < bestGivers.givers.size) bestGivers = { givers, recipients }
	}

	let bestRecipients: { givers: Set<string>; recipients: Set<string> } | null = null
	for (const start of memberIds) {
		if (matching.recipientFrom.has(start)) continue
		const recipients = new Set([start])
		const givers = new Set<string>()
		const queue = [start]
		while (queue.length > 0) {
			const r = queue.shift()!
			for (const g of giversOf.get(r)!) {
				if (givers.has(g)) continue
				givers.add(g)
				const next = matching.giverTo.get(g)
				if (next !== undefined && !recipients.has(next)) {
					recipients.add(next)
					queue.push(next)
				}
			}
		}
		if (!bestRecipients || recipients.size < bestRecipients.recipients.size) bestRecipients = { givers, recipients }
	}

	// A non-perfect matching on a square relation leaves both an unmatched
	// giver and an unmatched recipient, so both searches found a group.
	if (bestRecipients && (!bestGivers || bestRecipients.recipients.size < bestGivers.givers.size)) {
		return { side: 'recipients', recipients: sorted(bestRecipients.recipients), givers: sorted(bestRecipients.givers) }
	}
	return { side: 'givers', givers: sorted(bestGivers!.givers), recipients: sorted(bestGivers!.recipients) }
}

// ===============================
// The draw
// ===============================

function shuffled<T>(items: ReadonlyArray<T>, randomInt: RandomInt): Array<T> {
	const out = [...items]
	for (let i = out.length - 1; i > 0; i--) {
		const j = randomInt(i + 1)
		;[out[i], out[j]] = [out[j], out[i]]
	}
	return out
}

/**
 * Draws names. Tries, in order, a single loop through everyone, then a draw
 * with no swaps (nobody has the person who has them), then any draw. Random
 * within the best level reached. Running out of step budget at a level counts
 * as that level being impossible; the last level always succeeds when a
 * matching exists. Never assigns a pair the relation doesn't allow.
 *
 * With `avoid`, the order is:
 * 1. a single loop, no avoided pair
 * 2. no swaps, no avoided pair
 * 3. a single loop
 * 4. no swaps
 * 5. any draw with no avoided pair
 * 6. any draw
 *
 * So the single loop is given up to avoid a repeat, but a swap is never
 * accepted to avoid one: a swap tells two people who has them, a repeat is
 * only less fun. `level` reports the shape reached, with or without repeats;
 * `findRepeats` says whether there are any.
 */
export function drawAssignments(memberIds: ReadonlyArray<string>, allowed: AllowedRelation, opts: DrawOptions): DrawResult {
	const check = checkDraw(memberIds, allowed)
	if (!check.ok) return check

	const { randomInt } = opts
	const loopBudget = opts.loopStepBudget ?? DEFAULT_LOOP_STEP_BUDGET
	const noSwapBudget = opts.noSwapStepBudget ?? DEFAULT_NO_SWAP_STEP_BUDGET
	const options = normalize(memberIds, allowed)
	const fresh = withoutPairs(memberIds, options, opts.avoid)

	if (fresh) {
		const loop = findSingleLoop(memberIds, fresh, randomInt, loopBudget)
		if (loop) return { ok: true, assignments: loop, level: 'single-loop' }

		const noSwaps = findNoSwapMatching(memberIds, fresh, randomInt, noSwapBudget)
		if (noSwaps) return { ok: true, assignments: noSwaps, level: 'no-swaps' }
	}

	const loop = findSingleLoop(memberIds, options, randomInt, loopBudget)
	if (loop) return { ok: true, assignments: loop, level: 'single-loop' }

	const noSwaps = findNoSwapMatching(memberIds, options, randomInt, noSwapBudget)
	if (noSwaps) return { ok: true, assignments: noSwaps, level: 'no-swaps' }

	if (fresh) {
		const matching = randomMatching(memberIds, fresh, randomInt)
		if (matching.giverTo.size === memberIds.length) return { ok: true, assignments: matching.giverTo, level: 'any' }
	}

	// checkDraw already proved a perfect matching exists, and Kuhn's
	// algorithm finds a maximum one whatever the order.
	return { ok: true, assignments: randomMatching(memberIds, options, randomInt).giverTo, level: 'any' }
}

function randomMatching(memberIds: ReadonlyArray<string>, options: Map<string, Array<string>>, randomInt: RandomInt): Matching {
	const shuffledOptions = new Map<string, Array<string>>(memberIds.map(id => [id, shuffled(options.get(id)!, randomInt)]))
	return maximumMatching(shuffled(memberIds, randomInt), shuffledOptions)
}

/**
 * Whether a draw under `allowed` is going to give someone a pair from
 * `avoid`. Walks the same steps as `drawAssignments` with a fixed order
 * instead of a random one, so it says the same thing each time it is asked.
 * False when names can't be drawn at all, and when nothing in `avoid` applies.
 *
 * Exact unless a search runs out of its step budget, which a draw of this
 * size would too.
 */
export function willRepeat(
	memberIds: ReadonlyArray<string>,
	allowed: AllowedRelation,
	avoid: Iterable<MemberPair>,
	opts: Pick<DrawOptions, 'loopStepBudget' | 'noSwapStepBudget'> = {}
): boolean {
	if (!checkDraw(memberIds, allowed).ok) return false
	const options = normalize(memberIds, allowed)
	const fresh = withoutPairs(memberIds, options, avoid)
	if (!fresh) return false

	const first: RandomInt = () => 0
	const loopBudget = opts.loopStepBudget ?? DEFAULT_LOOP_STEP_BUDGET
	const noSwapBudget = opts.noSwapStepBudget ?? DEFAULT_NO_SWAP_STEP_BUDGET
	// A single loop is also a draw with no swaps, so the loop search only
	// saves the wider one some work.
	const noSwapsIn = (candidates: Map<string, Array<string>>) =>
		findSingleLoop(memberIds, candidates, first, loopBudget) !== null ||
		findNoSwapMatching(memberIds, candidates, first, noSwapBudget) !== null

	if (noSwapsIn(fresh)) return false
	// No draw without swaps avoids every pair, so if one exists at all the
	// draw takes it, repeat included.
	if (noSwapsIn(options)) return true
	return maximumMatching(memberIds, fresh).giverTo.size !== memberIds.length
}

// Level 1: a single loop through everyone (a Hamiltonian cycle), by
// randomised depth-first search with forward checking: every member not yet
// on the path must still have someone to gift to (an unvisited member, or the
// start to close the loop) and someone who can gift to them (an unvisited
// member, or the path's current end).
function findSingleLoop(
	memberIds: ReadonlyArray<string>,
	options: Map<string, Array<string>>,
	randomInt: RandomInt,
	budget: number
): Map<string, string> | null {
	const n = memberIds.length
	const giversOf = reverse(memberIds, options)
	const start = memberIds[randomInt(n)]
	const path = [start]
	const onPath = new Set([start])
	let steps = 0

	const viable = (tail: string): boolean => {
		for (const m of memberIds) {
			if (onPath.has(m)) continue
			if (!options.get(m)!.some(r => r === start || !onPath.has(r))) return false
			if (!giversOf.get(m)!.some(g => g === tail || !onPath.has(g))) return false
		}
		return true
	}

	const extend = (): boolean => {
		if (++steps > budget) return false
		const tail = path[path.length - 1]
		if (path.length === n) return options.get(tail)!.includes(start)
		for (const next of shuffled(options.get(tail)!, randomInt)) {
			if (onPath.has(next)) continue
			path.push(next)
			onPath.add(next)
			if (viable(next) && extend()) return true
			path.pop()
			onPath.delete(next)
			if (steps > budget) return false
		}
		return false
	}

	if (!extend()) return null
	return new Map(path.map((giver, i) => [giver, path[(i + 1) % n]]))
}

// Level 2: a matching with no swaps, by randomised backtracking. Givers with
// fewer options go first (random among equals); after each choice every
// giver still waiting must keep at least one option that is free and isn't
// the person who already has them.
function findNoSwapMatching(
	memberIds: ReadonlyArray<string>,
	options: Map<string, Array<string>>,
	randomInt: RandomInt,
	budget: number
): Map<string, string> | null {
	const tiebreak = new Map(shuffled(memberIds, randomInt).map((id, i) => [id, i]))
	const order = [...memberIds].sort((a, b) => options.get(a)!.length - options.get(b)!.length || tiebreak.get(a)! - tiebreak.get(b)!)
	const giverTo = new Map<string, string>()
	const taken = new Set<string>()
	let steps = 0

	const usable = (giver: string, r: string) => !taken.has(r) && giverTo.get(r) !== giver

	const viable = (from: number): boolean => {
		for (let i = from; i < order.length; i++) {
			const g = order[i]
			if (!options.get(g)!.some(r => usable(g, r))) return false
		}
		return true
	}

	const assign = (index: number): boolean => {
		if (++steps > budget) return false
		if (index === order.length) return true
		const giver = order[index]
		for (const r of shuffled(options.get(giver)!, randomInt)) {
			if (!usable(giver, r)) continue
			giverTo.set(giver, r)
			taken.add(r)
			if (viable(index + 1) && assign(index + 1)) return true
			giverTo.delete(giver)
			taken.delete(r)
			if (steps > budget) return false
		}
		return false
	}

	return assign(0) ? giverTo : null
}

// ===============================
// Inspecting a draw
// ===============================

/** Pairs in `assignments` where the two members have each other. Each pair is listed once. */
export function findSwaps(assignments: ReadonlyMap<string, string>): Array<[string, string]> {
	const out: Array<[string, string]> = []
	for (const [giver, recipient] of assignments) {
		if (giver < recipient && assignments.get(recipient) === giver) out.push([giver, recipient])
	}
	return out
}

/** The pairs in `assignments` that are also in `avoid`. */
export function findRepeats(assignments: ReadonlyMap<string, string>, avoid: Iterable<MemberPair>): Array<MemberPair> {
	const out: Array<MemberPair> = []
	const seen = new Set<string>()
	for (const pair of avoid) {
		if (assignments.get(pair.giverMemberId) !== pair.recipientMemberId || seen.has(pair.giverMemberId)) continue
		seen.add(pair.giverMemberId)
		out.push({ giverMemberId: pair.giverMemberId, recipientMemberId: pair.recipientMemberId })
	}
	return out
}

/** The loops `assignments` forms, each starting from its first member in `assignments` order. */
export function findLoops(assignments: ReadonlyMap<string, string>): Array<Array<string>> {
	const seen = new Set<string>()
	const loops: Array<Array<string>> = []
	for (const start of assignments.keys()) {
		if (seen.has(start)) continue
		const loop: Array<string> = []
		let current: string | undefined = start
		while (current !== undefined && !seen.has(current)) {
			seen.add(current)
			loop.push(current)
			current = assignments.get(current)
		}
		loops.push(loop)
	}
	return loops
}
