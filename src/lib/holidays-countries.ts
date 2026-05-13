// Static display metadata for the countries the admin pickers offer
// by default. Kept in its own module (with NO `date-holidays` import)
// so client components like the admin app-settings editor can pull
// it without dragging the `date-holidays` library into the client
// bundle. Server code that needs the catalog plus library helpers
// still imports from `@/lib/holidays`, which re-exports this.
//
// This is the curated set of countries gift-giving features support
// out of the box: five English-speaking, six Western/Northern European,
// two Latin American, and one East Asian. Adding a country here is
// pointless without a matching block in HOLIDAY_CATALOG_SEED and a
// regenerated occurrences table (`pnpm holidays:generate`).
//
// Order matters for the admin pickers - the first four are the
// original launch set and stay grouped first; the rest are sorted
// alphabetically by display name.
export const SUPPORTED_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = [
	{ code: 'US', name: 'United States' },
	{ code: 'CA', name: 'Canada' },
	{ code: 'GB', name: 'United Kingdom' },
	{ code: 'AU', name: 'Australia' },
	{ code: 'BR', name: 'Brazil' },
	{ code: 'FR', name: 'France' },
	{ code: 'DE', name: 'Germany' },
	{ code: 'IE', name: 'Ireland' },
	{ code: 'IT', name: 'Italy' },
	{ code: 'JP', name: 'Japan' },
	{ code: 'MX', name: 'Mexico' },
	{ code: 'NL', name: 'Netherlands' },
	{ code: 'ES', name: 'Spain' },
	{ code: 'SE', name: 'Sweden' },
]
