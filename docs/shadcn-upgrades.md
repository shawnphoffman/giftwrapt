# Upgrading shadcn components

shadcn is copy-paste, not a dependency. Every component in `src/components/ui/` is owned by this repo, which means:

- **We can customize anything freely.** Project customizations live in those files directly, marked with a leading `// project customization: ...` comment on the changed line (see [card.tsx](../src/components/ui/card.tsx)).
- **Upstream improvements don't auto-arrive.** We pull them in intentionally via the CLI.

## The `--diff` workflow (recommended for pulling upstream changes)

Never use `--overwrite` without reviewing first. Use the diff flow:

```bash
# 1. See what would change, without touching anything.
npx shadcn@latest add card --dry-run

# 2. For any file listed, view the diff between upstream and our copy.
npx shadcn@latest add card --diff src/components/ui/card.tsx

# 3. Decide per file:
#    - No local changes, or trivial diff → let the CLI overwrite it.
#    - Has our customizations → apply the upstream changes manually,
#      keep our `// project customization` lines intact.
```

If you want to refresh a stock component (one we haven't customized), overwrite is fine:

```bash
npx shadcn@latest add table --overwrite
```

## Refreshing multiple components / the whole preset

We use preset `b2oWHw1Hc`. To refresh everything at once (this is how the initial theme reset landed):

```bash
npx shadcn@latest apply --preset b2oWHw1Hc
```

This overwrites every installed component, `utils.ts`, `use-mobile.ts`, and `components.json`. Do it on a dedicated branch and review the diff carefully, then hand-merge any `// project customization` lines back in.

## Where project customizations live

Grep to find them:

```bash
rg "project customization" src/components/ui/
```

Keeping the comment convention consistent lets `--diff` reviews stay quick: if a line has that comment, don't let upstream clobber it without a reason.

## Backup of the hand-tuned theme

The pre-preset theme tokens are preserved at [`theme-backup.md`](./theme-backup.md) in case we need to reference what the green-forward theme used before the reset to preset `b2oWHw1Hc`.
