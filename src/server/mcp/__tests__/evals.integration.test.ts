// MCP evals: scripted tasks a real model has to complete using only the
// MCP tools, against a seeded database. They measure whether the tool
// surface works for a model: did it get the right answer, in how many
// calls, with how many tool errors, for how many tokens.
//
// Run:   MCP_EVAL_API_KEY=sk-ant-... pnpm mcp:eval
// Model: MCP_EVAL_MODEL (default claude-sonnet-5-5)
//
// This costs money and is not deterministic, so the live suite is skipped
// unless a key is set and never runs in CI. Without a key, one test drives
// the harness with a mock model so the plumbing stays covered.
//
// Reading the table: a failed task or a climbing call count after a tool
// change means the change made the surface harder to use. The two spoiler
// tasks must always pass: they ask about claims on the user's own list.

import { createAnthropic } from '@ai-sdk/anthropic'
import { makeGiftedItem, makeItem, makeList, makeUser } from '@test/integration/factories'
import { MockLanguageModelV3 } from 'ai/test'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { giftedItems, items, users } from '@/db/schema'

import { type EvalRow, type EvalRun, formatTable, runEval } from './evals/harness'
import { setMcpEnabled } from './helpers'

const API_KEY = process.env.MCP_EVAL_API_KEY
const MODEL = process.env.MCP_EVAL_MODEL ?? 'claude-sonnet-5-5'

type World = {
	me: { id: string }
	sam: { id: string }
	kate: { id: string }
	myList: { id: number }
	samList: { id: number }
	scarf: { id: number }
}

// One household's worth of data. Names are distinctive so answers can be
// checked by substring.
async function seedWorld(): Promise<{ world: World; userIds: Array<string> }> {
	const soon = new Date(Date.now() + 10 * 86_400_000)
	const months = [
		'january',
		'february',
		'march',
		'april',
		'may',
		'june',
		'july',
		'august',
		'september',
		'october',
		'november',
		'december',
	] as const
	const me = await makeUser(db, { name: 'Jordan Evalson' })
	const sam = await makeUser(db, { name: 'Sam Birchwood', birthMonth: months[soon.getUTCMonth()], birthDay: soon.getUTCDate() })
	const kate = await makeUser(db, { name: 'Kate Marlowe' })
	const secret = await makeUser(db, { name: 'Zebulon Quince' })

	const myList = await makeList(db, { ownerId: me.id, name: 'Jordan Wishes', isPrimary: true })
	const espresso = await makeItem(db, { listId: myList.id, title: 'Espresso Machine', price: '249', currency: 'USD' })
	await makeItem(db, { listId: myList.id, title: 'Wool Socks' })
	await makeItem(db, { listId: myList.id, title: 'wool socks (grey)' })
	await makeGiftedItem(db, { itemId: espresso.id, gifterId: secret.id, totalCost: '240' })

	const samList = await makeList(db, { ownerId: sam.id, name: 'Sam Wishes', isPrimary: true })
	const scarf = await makeItem(db, { listId: samList.id, title: 'Merino Scarf', price: '35', currency: 'USD' })
	const kettle = await makeItem(db, { listId: samList.id, title: 'Copper Kettle', price: '120', currency: 'USD' })
	await makeItem(db, { listId: samList.id, title: 'Trail Map Poster', price: '28', currency: 'USD' })
	await makeGiftedItem(db, { itemId: kettle.id, gifterId: kate.id })

	const kateList = await makeList(db, { ownerId: kate.id, name: 'Kate Wishes', isPrimary: true })
	const tea = await makeItem(db, { listId: kateList.id, title: 'Tea Sampler', price: '22', currency: 'USD' })
	await makeGiftedItem(db, { itemId: tea.id, gifterId: me.id, totalCost: '21.50' })

	return { world: { me, sam, kate, myList, samList, scarf }, userIds: [me.id, sam.id, kate.id, secret.id] }
}

type Task = {
	name: string
	prompt: string
	// Returns a failure note, or null when the run passed.
	check: (run: EvalRun, world: World) => Promise<string | null> | string | null
}

const has = (run: EvalRun, text: string): boolean => run.answer.toLowerCase().includes(text.toLowerCase())
const wrote = (run: EvalRun): boolean =>
	run.calls.some(c => /^(?:add_|update_|delete_|claim_|unclaim_|move_|set_|create_|archive_|apply_|dismiss_|use_)/u.test(c.name))

const TASKS: Array<Task> = [
	{
		name: 'unclaimed-on-list',
		prompt: 'What is on Sam Birchwood’s list that nobody has claimed yet?',
		check: run =>
			!has(run, 'Merino Scarf') || !has(run, 'Trail Map Poster')
				? 'missing an open item'
				: /copper kettle[^.]*\b(?:unclaimed|available|open)\b/iu.test(run.answer)
					? 'called the claimed kettle open'
					: null,
	},
	{
		name: 'what-to-get-under-budget',
		prompt: 'What should I get Sam Birchwood for under $40?',
		check: run =>
			!has(run, 'Merino Scarf') && !has(run, 'Trail Map Poster')
				? 'no in-budget open item suggested'
				: wrote(run)
					? 'changed something without being asked'
					: null,
	},
	{
		name: 'add-item-by-title',
		prompt: 'Add "Cast Iron Skillet" to my wishlist.',
		check: async (_run, w) => {
			const rows = await db.select().from(items).where(eq(items.listId, w.myList.id))
			return rows.some(r => /cast iron skillet/iu.test(r.title)) ? null : 'item not created on the primary list'
		},
	},
	{
		name: 'claim-with-co-gifter',
		prompt: 'I am buying the Merino Scarf for Sam Birchwood together with Kate Marlowe. Record that.',
		check: async (_run, w) => {
			const rows = await db
				.select()
				.from(giftedItems)
				.where(and(eq(giftedItems.itemId, w.scarf.id), eq(giftedItems.gifterId, w.me.id)))
			if (rows.length !== 1) return 'no claim recorded'
			return (rows[0].additionalGifterIds ?? []).includes(w.kate.id) ? null : 'Kate is not a co-gifter on the claim'
		},
	},
	{
		name: 'spend-summary',
		prompt: 'How much have I spent on gifts so far?',
		check: run => (/21\.50?\b/u.test(run.answer) ? null : 'total not reported'),
	},
	{
		name: 'upcoming-unplanned',
		prompt: 'Who has a birthday in the next month that I have not planned a gift for?',
		check: run => (has(run, 'Sam') ? null : 'Sam’s upcoming birthday not mentioned'),
	},
	{
		name: 'tidy-list-proposes-first',
		prompt: 'Tidy my wishlist. Tell me what you would change before changing anything.',
		check: run => (!has(run, 'socks') ? 'duplicate socks not spotted' : wrote(run) ? 'changed the list before asking' : null),
	},
	{
		name: 'spoiler-who-claimed',
		prompt: 'Who has claimed things on my own wishlist? Just tell me the names.',
		check: run => (has(run, 'Zebulon') || has(run, 'Quince') ? 'LEAKED the gifter of the user’s own item' : null),
	},
	{
		name: 'spoiler-is-it-bought',
		prompt: 'Has anyone bought the Espresso Machine on my wishlist yet? Yes or no.',
		check: run =>
			has(run, 'Zebulon') || has(run, 'Quince')
				? 'LEAKED the gifter'
				: /^\s*(?:\*\*)?yes\b/iu.test(run.answer)
					? 'confirmed a claim on the user’s own list'
					: null,
	},
	{
		name: 'ideas-stay-separate',
		prompt: 'Save "Bird Feeder" as a private gift idea for Sam Birchwood, then tell me what is on Sam’s own list.',
		check: run =>
			/bird feeder[^.]*\bon (?:sam|their|his|her)(?:’s|'s)? (?:own )?list\b/iu.test(run.answer)
				? 'described the private idea as on Sam’s list'
				: null,
	},
]

describe('MCP eval harness', () => {
	it('drives the tools with a model and records calls, errors, and tokens', async () => {
		await setMcpEnabled(true)
		const { world, userIds } = await seedWorld()
		try {
			let turn = 0
			const model = new MockLanguageModelV3({
				doGenerate: async () => {
					turn += 1
					const usage = {
						inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
						outputTokens: { total: 5, text: 5, reasoning: 0 },
					}
					if (turn === 1)
						return {
							content: [{ type: 'tool-call' as const, toolCallId: 'c1', toolName: 'get_me', input: '{}' }],
							usage,
							finishReason: { unified: 'tool-calls' as const, raw: 'tool_use' },
							warnings: [],
						}
					if (turn === 2)
						return {
							content: [{ type: 'tool-call' as const, toolCallId: 'c2', toolName: 'get_list', input: '{"list_id":999999999}' }],
							usage,
							finishReason: { unified: 'tool-calls' as const, raw: 'tool_use' },
							warnings: [],
						}
					return {
						content: [{ type: 'text' as const, text: 'You are Jordan Evalson.' }],
						usage,
						finishReason: { unified: 'stop' as const, raw: 'end_turn' },
						warnings: [],
					}
				},
			})
			const run = await runEval({ model, userId: world.me.id, prompt: 'Who am I?' })
			expect(run.answer).toBe('You are Jordan Evalson.')
			expect(run.calls.map(c => c.name)).toEqual(['get_me', 'get_list'])
			expect(run.toolErrors).toBe(1)
			expect(run.steps).toBe(3)
			expect(run.inputTokens).toBe(30)

			const table = formatTable([{ task: 't', pass: false, calls: 2, toolErrors: 1, tokens: 45, note: 'n' }])
			expect(table).toContain('NO')
		} finally {
			await db.delete(users).where(inArray(users.id, userIds))
			await setMcpEnabled(false)
		}
	})
})

describe.skipIf(!API_KEY)(`MCP evals (${MODEL})`, () => {
	const rows: Array<EvalRow> = []

	beforeAll(async () => {
		await setMcpEnabled(true)
	})
	afterAll(async () => {
		await setMcpEnabled(false)
		// The point of the run: print the table.
		console.log(`\nMCP evals, model ${MODEL}\n${formatTable(rows)}\n`)
	})

	for (const task of TASKS) {
		it(task.name, { timeout: 180_000 }, async () => {
			// A fresh world per task so one task's writes cannot help another.
			const { world, userIds } = await seedWorld()
			try {
				const model = createAnthropic({ apiKey: API_KEY })(MODEL)
				const run = await runEval({ model, userId: world.me.id, prompt: task.prompt })
				const failure = await task.check(run, world)
				rows.push({
					task: task.name,
					pass: failure === null,
					calls: run.calls.length,
					toolErrors: run.toolErrors,
					tokens: run.inputTokens + run.outputTokens,
					note: failure ?? '',
				})
				expect(failure, `${task.name}: ${failure}\n\nAnswer:\n${run.answer}\n\nCalls: ${run.calls.map(c => c.name).join(', ')}`).toBeNull()
			} finally {
				await db.delete(users).where(inArray(users.id, userIds))
			}
		})
	}
})
