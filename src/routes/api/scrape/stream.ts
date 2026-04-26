import { createFileRoute } from '@tanstack/react-router'

import { db } from '@/db'
import { auth } from '@/lib/auth'
import { createLogger } from '@/lib/logger'
import { buildDbBackedDeps } from '@/lib/scrapers/cache'
import { orchestrate } from '@/lib/scrapers/orchestrator'
import { fetchProvider } from '@/lib/scrapers/providers/fetch'
import { encodeStreamEvent } from '@/lib/scrapers/sse-format'
import type { StreamEvent } from '@/lib/scrapers/types'
import { getAppSettings } from '@/lib/settings'

const sseLog = createLogger('sse:scrape')

// SSE endpoint that drives the scraping orchestrator and streams per-attempt
// progress events back to the form. Same orchestrator the non-streaming
// scrapeUrl server fn uses; this route just hooks the emit callback up to a
// `text/event-stream` response.
//
// GET (so the browser's EventSource can consume it). Query parameters:
//   url      - required; the URL to scrape
//   force    - optional; set to "true" to bypass the dedup cache
//   itemId   - optional; attaches persisted attempt rows to an existing item
//   provider - optional; repeat the param to override the provider chain
//              (e.g. ?provider=fetch-provider&provider=browserless-provider)
export const Route = createFileRoute('/api/scrape/stream')({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers })
				if (!session?.user.id) {
					return new Response('Unauthorized', { status: 401 })
				}

				const requestUrl = new URL(request.url)
				const targetUrl = requestUrl.searchParams.get('url')
				if (!targetUrl) {
					return new Response('Missing `url` parameter', { status: 400 })
				}
				const force = requestUrl.searchParams.get('force') === 'true'
				const itemIdParam = requestUrl.searchParams.get('itemId')
				const itemId = itemIdParam ? Number(itemIdParam) : undefined
				if (itemIdParam && (!Number.isFinite(itemId) || itemId! <= 0)) {
					return new Response('Invalid `itemId`', { status: 400 })
				}
				const overrideValues = requestUrl.searchParams.getAll('provider')
				const providerOverride = overrideValues.length > 0 ? overrideValues : undefined
				const acceptLanguage = request.headers.get('accept-language') ?? undefined

				const settings = await getAppSettings(db)

				const { readable, writable } = new TransformStream<Uint8Array>()
				const writer = writable.getWriter()
				const encoder = new TextEncoder()

				const writeEvent = (event: StreamEvent): void => {
					try {
						void writer.write(encodeStreamEvent(event, encoder))
					} catch (err) {
						sseLog.debug({ err }, 'sse write failed')
					}
				}

				// Initial keepalive comment so proxies know the stream is live.
				try {
					void writer.write(encoder.encode(`: connected\n\n`))
				} catch {
					// If the very first write fails the client is already gone -
					// nothing useful to do.
				}

				// Run the orchestrator in the background; close the stream when it
				// finishes. We do *not* await this here so the response body starts
				// streaming immediately.
				void (async () => {
					try {
						await orchestrate(
							{
								url: targetUrl,
								itemId,
								force,
								providerOverride,
								acceptLanguage,
								signal: request.signal,
							},
							{
								...buildDbBackedDeps(db, {
									ttlHours: settings.scrapeCacheTtlHours,
									minScore: settings.scrapeQualityThreshold,
								}),
								providers: [fetchProvider],
								perProviderTimeoutMs: settings.scrapeProviderTimeoutMs,
								overallTimeoutMs: settings.scrapeOverallTimeoutMs,
								qualityThreshold: settings.scrapeQualityThreshold,
								emit: writeEvent,
							}
						)
					} catch (err) {
						sseLog.error({ err }, 'orchestrator threw unexpectedly')
					} finally {
						try {
							await writer.close()
						} catch {
							// already closed by client disconnect
						}
					}
				})()

				request.signal.addEventListener('abort', () => {
					sseLog.debug({ url: targetUrl }, 'sse client disconnected')
					// `request.signal` is forwarded into the orchestrator above,
					// which aborts the overall budget and surfaces a `timeout`
					// reason; the writer will close on its own when the
					// orchestrator returns.
				})

				return new Response(readable, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						Connection: 'keep-alive',
					},
				})
			},
		},
	},
})
