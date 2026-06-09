// Client-safe input schemas + result types for the reveal-timing server fns.
// Kept separate from _archive-defer-impl.ts (which imports db / resend /
// settings) so the client bundle can pull the schemas for `inputValidator`
// without dragging the server-only impl graph in. The impl functions are only
// referenced inside `.handler()` bodies and get stripped from the client.

import { z } from 'zod'

export const ForceArchiveListInputSchema = z.object({ listId: z.number().int() })
export const SetArchiveDeferInputSchema = z.object({ listId: z.number().int(), deferUntil: z.coerce.date() })
export const CancelArchiveDeferInputSchema = z.object({ listId: z.number().int() })

export type ForceArchiveListResult =
	| { kind: 'ok'; updated: number; addonsArchived: number; emailSent: boolean }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'not-applicable' | 'too-early' | 'deferred' }

export type SetArchiveDeferResult =
	| { kind: 'ok'; deferUntil: string }
	| { kind: 'error'; reason: 'not-found' | 'not-authorized' | 'not-applicable' | 'too-early' | 'must-be-later' | 'exceeds-max' }

export type CancelArchiveDeferResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'not-authorized' }
