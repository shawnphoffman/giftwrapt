# Upgrading shadcn components

shadcn is copy-paste, not a dependency. Every component in [`src/components/ui/`](../src/components/ui/) is owned by this repo, which means:

- **We can customize anything freely.** Project customizations live in those files directly, marked with a leading `// project customization: ...` comment on the changed line (see [card.tsx](../src/components/ui/card.tsx)).
- **Upstream improvements don't auto-arrive.** We pull them in intentionally via the CLI.

## The `--diff` workflow (recommended)

Never use `--overwrite` without reviewing first. Use the diff flow:

```bash
# 1. See what would change, without touching anything.
npx shadcn@latest add card --dry-run

# 2. For any file listed, view the diff between upstream and our copy.
npx shadcn@latest add card --diff src/components/ui/card.tsx

# 3. Decide per file:
#    - No local changes, or trivial diff -> let the CLI overwrite it.
#    - Has our customizations -> apply the upstream changes manually,
#      keep our `// project customization` lines intact.
```

If you want to refresh a stock component (one we haven't customized), overwrite is fine:

```bash
npx shadcn@latest add table --overwrite
```

## Where project customizations live

Grep to find them:

```bash
rg "project customization" src/components/ui/
```

Keeping the comment convention consistent lets `--diff` reviews stay quick: if a line has that comment, don't let upstream clobber it without a reason.

## Style and base config

The current style + theme is configured in [components.json](../components.json):

- `style: "radix-vega"`
- `baseColor: "neutral"`
- `iconLibrary: "lucide"`

To pull a fresh stylesheet against the configured style, use the regular `add` flow above. Refreshing every component at once (e.g. after a major shadcn release) is best done on a dedicated branch so the diff stays reviewable.
