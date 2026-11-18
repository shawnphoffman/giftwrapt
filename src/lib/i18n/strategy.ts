// The one Paraglide locale strategy the app uses (plan 36b). Its name is
// shared by paraglide.config.ts, the server entry and the client setup, so it
// lives in a file with no imports.
//
// - Server (src/server.ts): cookie, Accept-Language, deployment default.
// - Client (src/lib/i18n/client.ts): whatever the server rendered into
//   `<html lang>`, so both sides always agree and hydration never drifts.
export const LOCALE_STRATEGY = 'custom-gw'
