# Local dev admin

The seeded local-dev admin account:

| Field    | Value                |
| -------- | -------------------- |
| Email    | `admin@example.test` |
| Password | `SeedPass123!`       |
| Role     | `admin`              |

This user only exists after you've run the seed against your local DB. The seed
script (`scripts/seed.ts`) is the source of truth - if the credentials here
drift from the script, the script wins.

## Creating (or recreating) it

```bash
SEED_SAFE=1 pnpm db:seed
```

> [!WARNING]
> `db:seed` **truncates everything first** - users, lists, items, sessions,
> accounts, verifications, the lot. The script refuses to run unless
> `DATABASE_URL` points at a known-local host (`localhost`, `127.0.0.1`, `::1`,
> `host.docker.internal`, `postgres`, `db`) AND `SEED_SAFE=1` is set, so it
> can't clobber a remote DB by accident. But it absolutely will clobber your
> local one. Don't run it against a DB whose contents you care about.

## Other seeded users

All share the password `SeedPass123!`:

| Email                | Role  | Notes                                             |
| -------------------- | ----- | ------------------------------------------------- |
| `admin@example.test` | admin | -                                                 |
| `alice@example.test` | user  | Partnered with Bob; guardian of Kid; b. Mar 14    |
| `bob@example.test`   | user  | Partnered with Alice; editor on Alice's todo list |
| `carol@example.test` | user  | Solo; mutual view-only relationship with Alice    |
| `kid@example.test`   | child | Guarded by Alice                                  |

## Regaining access without reseeding

If the admin record got wiped but you want to keep everything else intact, use
the break-glass CLIs instead of `db:seed`:

```bash
# Create a new admin (fails if the email already exists).
pnpm admin:create \
  --email=admin@example.test \
  --password='SeedPass123!' \
  --name='Admin'

# Reset the password on an existing account.
# Also revokes all that user's active sessions.
pnpm admin:reset-password \
  --email=admin@example.test \
  --password='SeedPass123!'
```

These CLIs have **no** env guard - their authentication barrier is "you have
shell access to the process." They're safe to run against any DB; point
`DATABASE_URL` at whichever one you mean to touch. See the doc comments at the
top of `scripts/admin-create.ts` and `scripts/admin-reset-password.ts` for
details.

## Fresh deployments (no seed)

On a fresh deploy with an empty DB, seeding isn't appropriate. Instead, the
first-admin bootstrap in `src/lib/auth.ts` promotes the first user who signs up
to `admin`. If that's not workable (e.g. you want a specific email, or the DB
isn't actually empty), exec into the container and run `admin:create` or
`admin:reset-password` as above.
