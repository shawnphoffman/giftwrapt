// Client-safe. The admins' break-glass sign-in route while password sign-in
// is limited to admins (plan 41, src/lib/password-sign-in-gate.ts). The
// sign-in page shows the password form here; nothing links to it.
export const LOCAL_SIGN_IN_PATH = '/sign-in?local=1'
