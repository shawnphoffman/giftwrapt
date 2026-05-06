# OIDC smoke test

End-to-end verification of the OIDC sign-in flow (web + iOS) using
[`navikt/mock-oauth2-server`](https://github.com/navikt/mock-oauth2-server)
as a drop-in identity provider. Stateless, no DB, "log in" is a
click-through "pick a user" page. Useful for confirming the wire
contract of `/v1/auth/oidc/{begin, _jump, _native-done, finish}`
without needing a real Authentik / Pocket ID / Keycloak running.

For a more realistic integration test (real users, passkeys, an
admin UI), use Pocket ID instead - same admin form values, just
with a real provider.

## Boot the stack

```bash
# Boot Postgres + your usual storage profile + the mock IdP.
docker compose --profile garage --profile mock-oidc up -d

# Verify the discovery doc resolves at the issuer URL we'll wire
# into the admin form below.
curl -s http://localhost:8080/default/.well-known/openid-configuration | jq .issuer
# -> "http://localhost:8080/default"

pnpm dev   # runs the app on http://localhost:3000
```

The mock server publishes a default issuer `default` (you can pick
any path - `default` is the convention). The discovery doc lists
its own authorization / token / userinfo / JWKS endpoints, all
pointing at `http://localhost:8080/default/...`.

## Configure GiftWrapt

Sign in to GiftWrapt as an admin, navigate to **/admin/auth**, and
fill in the OIDC card:

| Field                        | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| Enable OIDC                  | on                                             |
| Issuer URL                   | `http://localhost:8080/default`                |
| Client ID                    | `giftwrapt-mobile-test` (any non-empty string) |
| Client Secret                | `dev-secret` (any non-empty string)            |
| Scopes                       | `openid email profile` (the default)           |
| Button Text                  | `Sign in with mock IdP`                        |
| Match existing users by      | `email`                                        |
| Auto Register                | on                                             |
| Allowed Mobile Redirect URIs | `wishlists://oauth`                            |

`mock-oauth2-server` accepts any client_id / client_secret, so the
values above don't need to be registered anywhere.

Save, then **restart the dev server** (`pnpm dev`'s
`auth.ts` reads OIDC config at module load via top-level await; a
hot reload won't pick up the change).

## Smoke test the web flow

1. Open `http://localhost:3000/sign-in` in any browser.
2. Click **Sign in with mock IdP**.
3. The redirect lands on the mock server's "log in" page; pick any
   sub claim, set an email matching an existing user (or any new
   email if `Auto Register` is on), submit.
4. The redirect chain hands back to `/api/auth/oauth2/callback/oidc`,
   which exchanges the code, mints a session, redirects to the
   post-auth target.

If any step 4xx's, the better-auth log line in the dev server's
stderr names the exact problem (`unsupported response_type`,
`state mismatch`, etc).

## Smoke test the iOS flow

Same boot stack as above, plus:

1. Open `wish-lists-ios/WishLists.xcodeproj` and run the WishLists
   scheme on the iOS Simulator.
2. On the host-entry screen, type `http://localhost:3000`.
3. Tap **Continue**. The capabilities probe should populate the
   methods step with email + password fields and the **Sign in with
   mock IdP** button.
4. Tap the OIDC button. `ASWebAuthenticationSession` opens onto
   `http://localhost:3000/api/mobile/v1/auth/oidc/_jump?token=...`,
   which 302s to the mock IdP login page.
5. Pick a user, submit. The chain runs through better-auth's
   callback, GiftWrapt's `_native-done`, and ends with a 302 to
   `wishlists://oauth?token=...`. The auth session captures the
   redirect, hands control back to the app.
6. iOS posts `oidc/finish`, gets the `{ apiKey, user, device }`
   envelope, and `RootView` swaps to the authenticated tab view.

Common gotchas:

- **"Sign-in expired"** on the iOS error banner: the begin TTL is
  10 minutes, but if the dev server restarted between begin and
  finish, the in-memory state is gone. Sign in again.
- **"redirect-not-allowed"**: check the admin form has
  `wishlists://oauth` literally in the Allowed Mobile Redirect URIs
  textarea (one per line, no trailing whitespace).
- **`http://` cookies blocked**: Safari refuses to set the
  `Secure`-flagged session cookie on plain HTTP unless the site is
  on `localhost` (which it is). Other LAN hostnames need
  `INSECURE_COOKIES=true` in `.env.local`.

## Tear down

```bash
docker compose --profile mock-oidc down
```

Or to nuke everything (Postgres + storage + IdP):

```bash
docker compose down -v
```

## Switching to Pocket ID later

When ready to test against a real self-hosted IdP:

1. Stop `mock-oidc` (`docker compose --profile mock-oidc down`).
2. Boot Pocket ID per
   [its docs](https://pocket-id.org/docs/setup/installation).
3. In Pocket ID's admin: register a new OIDC client. Set the
   redirect URI to `<server>/api/auth/oauth2/callback/oidc`. Note
   the issued client_id + client_secret.
4. Update GiftWrapt's `/admin/auth` form: replace the issuer URL,
   client_id, client_secret. Keep `wishlists://oauth` on the
   mobile-redirect-URIs list.
5. Restart the dev server. Re-run the iOS smoke test.

The wire contract is identical - any OIDC-compliant provider works.
