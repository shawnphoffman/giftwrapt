# Permissions integration tests

This directory exhaustively tests the permissions matrix:
**every role × every resource × every action × every relevant state**.

Each per-resource file iterates a slice of the central `_expectations.ts`
table with `it.each`, so adding a rule to `.notes/logic.md` mostly means
appending to that table.

## File map

| File                                           | Surface tested                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_seeds.ts`                                    | Per-role scenario fixtures (owner / guardian / partner / list-editor / user-edit / denied / default / child-role)                                             |
| `_expectations.ts`                             | The matrix tables, one slice per resource                                                                                                                     |
| `list.permissions.integration.test.ts`         | `canViewList`, `canViewListAsAnyone`, `canEditList` against every (role, listState) pair. Canonical template; copy this when filling out the other resources. |
| `item.permissions.integration.test.ts`         | Item-level actions (view, create, update, archive, delete). **Stub** until logic.md adds rules.                                                               |
| `claim.permissions.integration.test.ts`        | `claimItemGiftImpl`, `unclaimItemGiftImpl`, `updateCoGiftersImpl`. **Stub.**                                                                                  |
| `comment.permissions.integration.test.ts`      | Comment view/create/update/delete. **Stub.**                                                                                                                  |
| `list-editor.permissions.integration.test.ts`  | Adding / removing list editors (who can grant access). **Stub.**                                                                                              |
| `list-addon.permissions.integration.test.ts`   | Off-list addon CRUD by gifters. **Stub.**                                                                                                                     |
| `relationship.permissions.integration.test.ts` | Owner / viewer relationship upserts (canView / canEdit grants). **Stub.**                                                                                     |

## Running

```bash
pnpm test:integration src/api/__tests__/permissions/
# or one resource at a time
pnpm test:integration src/api/__tests__/permissions/list.permissions.integration.test.ts
```

## Adding a rule

1. Decide which resource it touches. If it spans multiple, prefer
   duplicating expectation rows over building a cross-resource helper.
   The matrix is meant to be flat and greppable.
2. If the rule introduces a new role or list sub-state, extend the
   unions in `src/lib/__tests__/permissions/_matrix-types.ts` first.
   TypeScript will surface every test file that needs updating.
3. Add the expectation row(s) to `_expectations.ts`. The
   `assertNoDuplicateExpectations` validator runs on import; if your
   row contradicts an existing rule, the suite fails to load instead
   of silently shadowing.
4. If the rule needs a new fixture shape (an item with a claim, a
   gift-ideas list with a target user, etc.), add a seed helper to
   `_seeds.ts` rather than inlining fixture setup in the test files.

## Linking back to logic.md

The helper-level expectations capture the **enforcement** behaviour:
what `canViewList` / `canEditList` return today. Some of `.notes/logic.md`'s
rules describe **higher-level** behaviour layered on top by impls
(e.g., "guardians can view private lists" is enforced by `getListForEditingImpl`,
not by `canViewList` itself). When that gap matters for a test, the
expectation row should call out the impl path explicitly with a
`reasonOnDeny` or comment so the matrix doesn't drift.
