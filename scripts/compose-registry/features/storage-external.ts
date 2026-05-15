import type { EnvExampleSection } from '../types.ts'

/**
 * Shared STORAGE_* block. Used by every selfhost deployment regardless of
 * whether the bucket is bundled (garage/rustfs sidecar) or external
 * (AWS / R2 / Supabase). The garage-specific bundled secrets live in
 * `garage.ts`'s `bundledGarageEnvSection`.
 */
export const storageEnvSection: EnvExampleSection = {
	id: 'storage',
	body: `# -----------------------------------------------------------------------------
# Object storage (S3-compatible) - [required for image uploads]
# -----------------------------------------------------------------------------
# GiftWrapt speaks S3. Any S3-compatible bucket works: Garage (bundled in the
# Docker Compose stack as an optional sidecar), AWS S3, Cloudflare R2,
# Supabase Storage's S3 API, etc. See docs/storage.md for recipes.
#
# When INIT_GARAGE=true (the self-host compose default), the app's entrypoint
# bootstraps the Garage sidecar on first boot via its admin HTTP API: layout
# assign, bucket create, key import, permission grant. Idempotent on re-run.
# For an external S3 bucket, leave INIT_GARAGE unset and the bootstrap is
# skipped.
STORAGE_ENDPOINT=http://garage:3900
STORAGE_REGION=garage
STORAGE_BUCKET=giftwrapt
# Garage enforces specific formats (AWS/R2 don't care).
# Generate: printf 'GK%s' "$(openssl rand -hex 12)"
STORAGE_ACCESS_KEY_ID=GKreplace-with-24-hex-chars
# Generate: openssl rand -hex 32
STORAGE_SECRET_ACCESS_KEY=replace-with-64-hex-chars
STORAGE_FORCE_PATH_STYLE=true   # true for Garage/MinIO, false for AWS/R2
# STORAGE_PUBLIC_URL=           # unset = app serves images via /api/files/*;
                                # set to a CDN base URL (e.g. https://cdn.example.com)
                                # to hand clients direct URLs instead
# STORAGE_MAX_UPLOAD_MB=8       # max upload size before Sharp runs
`,
}
