import type { QueryClient } from '@tanstack/react-query'

import { itemsKeys } from '@/lib/queries/items'
import { listDetailKeys } from '@/lib/queries/lists'
import type { ListEvent } from '@/routes/api/sse/list.$listId'

type LocalEventDeps = {
	queryClient: Pick<QueryClient, 'invalidateQueries'>
	/** Optional: loader-driven surfaces (purchases, received, edit view) refresh via the router. */
	router?: { invalidate: () => void | Promise<unknown> }
}

/**
 * Apply a `ListEvent` to the LOCAL React Query cache + route loaders,
 * immediately after the acting user's own mutation succeeds.
 *
 * Why this exists: real-time cross-client updates ride the in-memory SSE
 * broadcast in `src/routes/api/sse/list.$listId.ts`. That broadcast only
 * reaches clients sharing the mutating server's process - true on a
 * long-running host (Docker/Railway/Render), but NOT on Vercel, where each
 * function invocation is its own isolate and the mutation never reaches the
 * SSE writer holding the viewer's connection. The result was that a user's
 * OWN action (e.g. claiming a gift) didn't reflect until a full page reload.
 *
 * The fix: the actor doesn't need the network round-trip of SSE to see their
 * own change. On a successful mutation we dispatch the same event locally and
 * invalidate the UNION of every surface's queries for that kind. SSE stays as
 * a best-effort cross-client layer on top.
 *
 * Invalidating a query that isn't currently mounted is cheap - React Query
 * just marks it stale and refetches on next mount - so we can safely fan out
 * to every surface (`/lists/$id`, `/me`, `/recent`, `/purchases`, etc.) from
 * one call without knowing which the actor is looking at.
 *
 * Spoiler-safety: a `claim` event only ever originates from a gifter action
 * (owners cannot claim their own list), so invalidating the item list here
 * never refetches on an owner's edit view. Owner-side item edits emit `item`,
 * not `claim`.
 */
export function applyListEventLocally(event: ListEvent, deps: LocalEventDeps): void {
	const { queryClient, router } = deps
	const { listId } = event

	switch (event.kind) {
		case 'claim':
			// list-detail (gifter view), home-page badges, /me rows, recent feed.
			queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
			queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
			// /purchases and /purchases/received are loader-driven.
			void router?.invalidate()
			return
		case 'item':
			queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) })
			queryClient.invalidateQueries({ queryKey: ['recent', 'items'] })
			if (event.shape) {
				queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
				queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			}
			// archive-reveal (item, no shape) surfaces on /purchases/received.
			void router?.invalidate()
			return
		case 'comment':
			queryClient.invalidateQueries({ queryKey: ['item-comments', event.itemId] })
			queryClient.invalidateQueries({ queryKey: ['recent', 'conversations'] })
			return
		case 'addon':
			queryClient.invalidateQueries({ queryKey: listDetailKeys.addons(listId) })
			// edit view (composite loader) + /purchases/received are loader-driven.
			void router?.invalidate()
			return
		case 'list':
			queryClient.invalidateQueries({ queryKey: listDetailKeys.byList(listId) })
			queryClient.invalidateQueries({ queryKey: ['lists', 'public', 'grouped'] })
			queryClient.invalidateQueries({ queryKey: ['my-lists'] })
			void router?.invalidate()
			return
	}
}
