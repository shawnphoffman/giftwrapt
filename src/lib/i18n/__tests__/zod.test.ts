import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { zodIssuesText, zodParams } from '../zod'

const schema = z.object({
	title: z.string().min(1, 'Title is required'),
	quantity: z.number().min(1),
})

describe('zodParams', () => {
	it('leaves a message the schema names alone', () => {
		const result = schema.safeParse({ title: '', quantity: 1 }, zodParams('fr'))
		expect(result.success).toBe(false)
		if (!result.success) expect(result.error.issues[0].message).toBe('Title is required')
	})

	it('puts stock messages in the requested language', () => {
		const en = schema.safeParse({ title: 'x', quantity: 0 }, zodParams('en'))
		const fr = schema.safeParse({ title: 'x', quantity: 0 }, zodParams('fr'))
		expect(en.success).toBe(false)
		expect(fr.success).toBe(false)
		if (!en.success && !fr.success) {
			expect(en.error.issues[0].message).toMatch(/too small/i)
			expect(fr.error.issues[0].message).toMatch(/trop petit/i)
		}
	})

	it('matches what zod says by default in English', () => {
		const plain = schema.safeParse({ title: 'x', quantity: 0 })
		const en = schema.safeParse({ title: 'x', quantity: 0 }, zodParams('en'))
		if (!plain.success && !en.success) expect(en.error.issues[0].message).toBe(plain.error.issues[0].message)
	})
})

describe('zodIssuesText', () => {
	it('joins distinct messages once each', () => {
		const dup = z.object({ a: z.string().min(1, 'Required'), b: z.string().min(1, 'Required'), c: z.number().min(5, 'Too low') })
		const result = dup.safeParse({ a: '', b: '', c: 1 })
		expect(result.success).toBe(false)
		if (!result.success) expect(zodIssuesText(result.error)).toBe('Required, Too low')
	})
})
