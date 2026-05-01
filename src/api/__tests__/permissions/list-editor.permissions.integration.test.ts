// List-editor management permissions matrix.
//
// Surfaces to cover when populated:
//   - getListEditorsImpl       (owner-only)
//   - addListEditorImpl        (owner-only; denies children, self, blocked users, duplicates)
//   - getAddableEditorsImpl    (excludes children, denied users, existing editors)
//   - removeListEditorImpl     (owner-only)
//
// Important asymmetry: a list editor cannot grant edit access to anyone
// else. Only the owner manages the editor list, even though editors can
// otherwise mutate the list itself.

import { describe, expect, it } from 'vitest'

import { listEditorExpectations } from './_expectations'

describe('list-editor management permissions × matrix', () => {
	it.skipIf(listEditorExpectations.length === 0)('matrix is populated', () => {
		expect(listEditorExpectations.length).toBeGreaterThan(0)
	})

	if (listEditorExpectations.length === 0) {
		it.todo('populate listEditorExpectations and replace with it.each')
	}
})
