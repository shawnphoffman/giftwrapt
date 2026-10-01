import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
	dismissRecommendationImpl,
	getMyRecommendationsImpl,
	type IntelligenceRecRow,
	reactivateRecommendationImpl,
	refreshMyRecommendationsImpl,
} from '@/api/_intelligence-impl'
import { applyInputSchema, applyRecommendationImpl } from '@/api/intelligence'
import { recommendations } from '@/db/schema'
import type { RecommendationAction } from '@/lib/intelligence/types'
import { intelligenceRefreshLimiter } from '@/lib/rate-limits'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { lines, plural } from '../format'
import { defineTool } from '../server'

const actionSchema = z.object({
	index: z.number(),
	label: z.string(),
	description: z.string(),
	intent: z.enum(['do', 'noop', 'destructive', 'ai']),
	canApply: z.boolean().describe('true when apply_recommendation can run it'),
	confirmCopy: z.string().nullable(),
})

const recSchema = z.object({
	id: z.string(),
	title: z.string(),
	body: z.string(),
	kind: z.string(),
	severity: z.enum(['info', 'suggest', 'important']),
	status: z.enum(['active', 'dismissed', 'applied']),
	forDependent: z.object({ id: z.string(), name: z.string() }).nullable(),
	actions: z.array(actionSchema),
	createdAt: z.string(),
})

function actionsOf(rec: IntelligenceRecRow): Array<RecommendationAction> {
	const payload = rec.payload as { actions?: Array<RecommendationAction> } | null
	return payload?.actions ?? []
}

function toRecShape(rec: IntelligenceRecRow, forDependent: { id: string; name: string } | null): z.infer<typeof recSchema> {
	return {
		id: rec.id,
		title: rec.title,
		body: rec.body,
		kind: rec.kind,
		severity: rec.severity,
		status: rec.status,
		forDependent,
		actions: actionsOf(rec).map((a, index) => ({
			index,
			label: a.label,
			description: a.description,
			intent: a.intent,
			canApply: Boolean(a.apply),
			confirmCopy: a.confirmCopy ?? null,
		})),
		createdAt: rec.createdAt.toISOString(),
	}
}

export function registerIntelligenceTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'list_recommendations',
		title: 'List Suggestions',
		description:
			'GiftWrapt’s own suggestions for the user’s lists (stale items, duplicates, grouping, missing prices, set-up nudges), with the actions each one offers. Pass include_resolved to also see dismissed and applied ones. Requires the deployment’s intelligence feature.',
		inputSchema: { include_resolved: z.boolean().optional() },
		outputSchema: {
			recommendations: z.array(recSchema),
			lastRun: z.object({ finishedAt: z.string().nullable(), status: z.string(), skipReason: z.string().nullable() }).nullable(),
			nextEligibleRefreshAt: z.string().nullable(),
		},
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx, settings }) => {
			if (!settings.intelligenceEnabled) return toolError('feature-disabled', 'Suggestions are turned off on this deployment.')
			const page = await getMyRecommendationsImpl(actor.userId, dbx)
			const all = [
				...page.recs.map(r => toRecShape(r, null)),
				...page.byDependent.flatMap(g => g.recs.map(r => toRecShape(r, { id: g.dependent.id, name: g.dependent.name }))),
			]
			const recs = args.include_resolved ? all : all.filter(r => r.status === 'active')
			const text = recs.length
				? lines([
						`${plural(recs.length, 'suggestion')}${page.providerConfigured ? '' : ' (no AI provider configured; only heuristic suggestions run)'}.`,
						...recs.map(
							r =>
								`${r.id}: [${r.severity}] ${r.title}${r.forDependent ? ` (for ${r.forDependent.name})` : ''} — ${r.body}${r.actions.length ? ` Actions: ${r.actions.map(a => `${a.index}=${a.label}${a.canApply ? '' : ' (manual)'}`).join(', ')}` : ''}`
						),
					])
				: 'No suggestions right now.'
			return toolOk(text, {
				recommendations: recs,
				lastRun: page.lastRun
					? { finishedAt: page.lastRun.finishedAt?.toISOString() ?? null, status: page.lastRun.status, skipReason: page.lastRun.skipReason }
					: null,
				nextEligibleRefreshAt: page.nextEligibleRefreshAt?.toISOString() ?? null,
			})
		},
	})

	defineTool(server, ctx, {
		name: 'apply_recommendation',
		title: 'Apply a Suggestion',
		description:
			'Run one of a suggestion’s applicable actions (by its index from list_recommendations). Actions marked destructive should be confirmed with the user first.',
		inputSchema: { recommendation_id: z.string().uuid(), action_index: z.number().int().min(0) },
		outputSchema: { ok: z.literal(true), kind: z.string(), result: z.record(z.string(), z.unknown()) },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
		handler: async (args, { actor, dbx, settings }) => {
			if (!settings.intelligenceEnabled) return toolError('feature-disabled', 'Suggestions are turned off on this deployment.')
			const rec = await dbx.query.recommendations.findFirst({
				where: and(eq(recommendations.id, args.recommendation_id), eq(recommendations.userId, actor.userId)),
				columns: { id: true, payload: true },
			})
			if (!rec) return toolError('not-found', 'No such suggestion.')
			const action = ((rec.payload as { actions?: Array<RecommendationAction> }).actions ?? []).at(args.action_index)
			if (!action) return toolError('invalid-input', 'No action at that index.')
			if (!action.apply) return toolError('invalid-input', 'That action is informational; it cannot be applied automatically.')
			const parsed = applyInputSchema.safeParse({ id: rec.id, apply: action.apply })
			if (!parsed.success) return toolError('invalid-input', 'That action’s payload is not applicable.')
			const result = await dbx.transaction(tx => applyRecommendationImpl(tx, actor.userId, parsed.data))
			if (!result.ok) return toolError(result.reason, `Could not apply: ${result.reason}.`)
			const { ok: _ok, kind, ...rest } = result
			return toolOk(`Applied "${action.label}" (${kind}).`, { ok: true as const, kind, result: rest })
		},
	})

	defineTool(server, ctx, {
		name: 'dismiss_recommendation',
		title: 'Dismiss a Suggestion',
		description: 'Hide a suggestion (it stays hidden across regenerations). Pass undo true to bring a dismissed one back.',
		inputSchema: { recommendation_id: z.string().uuid(), undo: z.boolean().optional() },
		outputSchema: { ok: z.literal(true), recommendationId: z.string(), status: z.enum(['dismissed', 'active']) },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx, settings }) => {
			if (!settings.intelligenceEnabled) return toolError('feature-disabled', 'Suggestions are turned off on this deployment.')
			const result = args.undo
				? await reactivateRecommendationImpl(actor.userId, args.recommendation_id, dbx)
				: await dismissRecommendationImpl(actor.userId, args.recommendation_id, dbx)
			if (!result.ok) return toolError('not-found', 'No such suggestion.')
			const status = args.undo ? ('active' as const) : ('dismissed' as const)
			return toolOk(`Suggestion ${args.recommendation_id} is now ${status}.`, {
				ok: true as const,
				recommendationId: args.recommendation_id,
				status,
			})
		},
	})

	defineTool(server, ctx, {
		name: 'refresh_recommendations',
		title: 'Refresh Suggestions',
		description:
			'Regenerate the user’s suggestions now instead of waiting for the nightly run. Subject to a per-user cooldown; may take a while and may call an AI provider.',
		inputSchema: {},
		outputSchema: { status: z.string(), reason: z.string().nullable() },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		handler: async (_args, { actor, dbx, settings }) => {
			if (!settings.intelligenceEnabled) return toolError('feature-disabled', 'Suggestions are turned off on this deployment.')
			const limit = intelligenceRefreshLimiter.consume(`user:${actor.userId}`)
			if (!limit.allowed) return toolError('rate-limited')
			const result = await refreshMyRecommendationsImpl(actor.userId, dbx)
			const status = String(result.status)
			const reason = 'reason' in result && typeof result.reason === 'string' ? result.reason : null
			return toolOk(status === 'skipped' ? `Refresh skipped (${reason ?? 'unknown'}).` : `Refresh ${status}.`, { status, reason })
		},
	})
}
