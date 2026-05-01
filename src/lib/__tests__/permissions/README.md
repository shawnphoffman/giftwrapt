# Permissions tests

This directory holds the **unit-level** entry points for the permissions
test suite. Today the unit slice is small (just `_matrix-types.ts` -
the shared types), but it lives here so future synchronous helpers
(role classifiers, denial-precedence calculators, etc.) have an obvious
home that mirrors `src/lib/__tests__/permissions-matrix.test.ts`.

The bulk of the matrix coverage lives at the integration layer, where
the real DB-backed predicates (`canViewList`, `canEditList`, plus the
impl-level checks in `_lists-impl.ts` and friends) can be exercised
against the same fixtures. See `src/api/__tests__/permissions/` for
the integration suite.

## Why two locations

The unit and integration projects in `vitest.config.ts` are deliberately
separate — unit tests run in pure node with no DB stubbing, integration
tests use a per-worker pglite + per-test savepoint rollback. The shared
types live in the unit project because they have no runtime dependencies;
copying them into the integration project would risk drift.

## Adding new permission rules

When a rule lands in `.notes/logic.md`:

1. If the rule introduces a new role or list sub-state, extend the unions
   in `_matrix-types.ts`. Both sides import from here, so the type system
   forces every test file to acknowledge the new dimension.
2. Add the rule's expectations to the relevant resource table in
   `src/api/__tests__/permissions/_expectations.ts`.
3. The per-resource integration test files iterate the table with
   `it.each` — no test changes needed unless the new rule requires a
   new seed shape.

The duplicate-key validator at the bottom of `_matrix-types.ts`
(`assertNoDuplicateExpectations`) runs at table-import time and bails
loudly if two rows agree on `(role, listState, action)` but disagree on
`expected`. That keeps the matrix internally consistent as it grows.

## Existing unit test (kept separately)

`src/lib/__tests__/permissions-matrix.test.ts` covers the
synchronous cell-classification logic that powers the admin
permissions matrix UI. It's a different concept (display-time
classification, not access enforcement) and stays where it is.
