# Changelog

## [0.16.0](https://github.com/shawnphoffman/wish-lists/compare/v0.15.0...v0.16.0) (2026-04-27)


### Features

* **admin:** add /admin/scrapes for inspecting scrape attempts ([eba34c9](https://github.com/shawnphoffman/wish-lists/commit/eba34c9988404a1fa7df881e70a5654296f5b7f0))
* **admin:** each scraper has its own Save button instead of autosave on blur ([8ef0ce8](https://github.com/shawnphoffman/wish-lists/commit/8ef0ce8d2e12e3c66d961d04997b8822d3af21f7))
* **admin:** make scraper form rows responsive via container queries ([edd0228](https://github.com/shawnphoffman/wish-lists/commit/edd0228cba8008206f5a557677474c3d69630f98))
* **admin:** pin the Inspect column to the left edge + widen the detail dialog ([f403d8a](https://github.com/shawnphoffman/wish-lists/commit/f403d8a110878029419d17191a516ad14444bbe6))
* **scraper:** replace single auth header with multiline custom headers ([4ea3506](https://github.com/shawnphoffman/wish-lists/commit/4ea350691b900eb7ec1850958456f507c199790c))
* **scraper:** show user-facing names in the streaming progress UX ([ef35576](https://github.com/shawnphoffman/wish-lists/commit/ef35576fe75c9abfc03cd40e5750d105b4f18651))
* **scraper:** support 0:N custom HTTP scrapers + show timing in seconds ([3250912](https://github.com/shawnphoffman/wish-lists/commit/3250912b51d326fb488d7b5b00bfcfa35107e648))


### Bug Fixes

* **items:** tame Add Item dialog overflow and align Notes with Edit Item ([b36f857](https://github.com/shawnphoffman/wish-lists/commit/b36f8578d194eb5be33ee0e34decc00a15b0cc59))
* **scraper:** allow toggling custom HTTP on before endpoint is typed ([49fa2c0](https://github.com/shawnphoffman/wish-lists/commit/49fa2c024834a5337a8f97484e521c3e3129b79a))

## [0.15.0](https://github.com/shawnphoffman/wish-lists/compare/v0.14.0...v0.15.0) (2026-04-27)


### Features

* **admin:** add AI provider configuration page ([3496598](https://github.com/shawnphoffman/wish-lists/commit/34965980bd1c0698543ac75f086581d82f2292fc))
* **admin:** add AI scraping section to AI page ([1223bda](https://github.com/shawnphoffman/wish-lists/commit/1223bda8cc46769b170c6036fb221ff860f68954))
* **admin:** add scraper providers form ([4a1da3e](https://github.com/shawnphoffman/wish-lists/commit/4a1da3e0083b536e1a11669f983165c8979ee4f8))
* **ai:** adopt vercel ai sdk and support openai/anthropic/compatible ([1b6f5f7](https://github.com/shawnphoffman/wish-lists/commit/1b6f5f77ee641d1f305251c8c551c68ed2cab836))
* **avatar:** color fallback by name hash ([b0e8055](https://github.com/shawnphoffman/wish-lists/commit/b0e8055b7fd60ea38d0e5943669eb7599d649940))
* **items:** add ClaimUsers and rework QuantityRemainingBadge claim states ([692550b](https://github.com/shawnphoffman/wish-lists/commit/692550b5c5a119b4e71ffc67998265fcc59b85df))
* **items:** add depth shadow to priority tab ([4b00fa3](https://github.com/shawnphoffman/wish-lists/commit/4b00fa35decf3b5a6672b2f51337f1677d0d93ba))
* **items:** add image picker to add-item form ([c5f5e92](https://github.com/shawnphoffman/wish-lists/commit/c5f5e922316f3fdf536a13cafc852ecbe3d56b5a))
* **items:** add overflow menu for item groups with move-to-list ([a65d6f5](https://github.com/shawnphoffman/wish-lists/commit/a65d6f5c9faa4ba0a57f77684777fd306eb7e834))
* **items:** add scrape progress alert component ([5aeb6eb](https://github.com/shawnphoffman/wish-lists/commit/5aeb6eb273cbed6c16a9b6dec41042a268f8842d))
* **items:** consolidate claim/lock UI in ItemRow ([5b9b81d](https://github.com/shawnphoffman/wish-lists/commit/5b9b81d04e403a6135b59fce294aadc3f4a40ab8))
* **items:** convert add-item flow to modal over my-lists ([0c6ce2d](https://github.com/shawnphoffman/wish-lists/commit/0c6ce2d931eb540bcbeed15a94e7b8e9a3ac9549))
* **items:** filter gifter view by vendor ([89caec1](https://github.com/shawnphoffman/wish-lists/commit/89caec11cb18db1ea4ef1d25094c801f851c5136))
* **items:** move URL above title and add scrape button to dialogs ([324cc5a](https://github.com/shawnphoffman/wish-lists/commit/324cc5a5421907b8a6eab31c7400347f4369b74f))
* **items:** mute fully-claimed cards, keep Edit claim vivid ([ecbacd1](https://github.com/shawnphoffman/wish-lists/commit/ecbacd15a5c725b43026e35a33b8333952f2a61b))
* **items:** mute locked rows and explain lock reason in a popover ([3556dac](https://github.com/shawnphoffman/wish-lists/commit/3556dac64602719808464266d29057f8307f7e90))
* **items:** re-scrape fills empty fields instead of skipping touched ([2ce393f](https://github.com/shawnphoffman/wish-lists/commit/2ce393ff4362f3f6cd0da2dbb6bdfbada4fd50e1))
* **items:** replace priority select with 4-way toggle group ([f80f687](https://github.com/shawnphoffman/wish-lists/commit/f80f6877f2a1d8713b4f67fed0c96b8a4c61d57f))
* **items:** restructure row layout and consolidate dimming ([97ce036](https://github.com/shawnphoffman/wish-lists/commit/97ce0369d52c19dc001be27500b0d14dc5dd7824))
* **items:** toggle availability, block claims, show date tooltip ([c539ac5](https://github.com/shawnphoffman/wish-lists/commit/c539ac57e17bb7c18bda887a6f2c175708ce1b5b))
* **items:** wire scraping into add-item dialog ([5610cb9](https://github.com/shawnphoffman/wish-lists/commit/5610cb91c79cab842153649dc4b8a6b944e2c528))
* **list-settings:** allow editing gift-ideas recipient ([f3f6349](https://github.com/shawnphoffman/wish-lists/commit/f3f634910c5d285e1473a4fb2c29dba59c717214))
* **lists:** warn when gift ideas recipient is also an editor ([27e6459](https://github.com/shawnphoffman/wish-lists/commit/27e645986db992508a1553b90eb100e13d5ed9ad))
* **permissions:** enforce relationship rules and partner editor flows ([639692b](https://github.com/shawnphoffman/wish-lists/commit/639692b82f84c64e95d13f152db14aded8379c68))
* **recent:** scope feeds to viewer access, add jump-to-item links ([a284cd7](https://github.com/shawnphoffman/wish-lists/commit/a284cd7dc009fb77d8fc22c808157667df3c202f))
* **scraper:** add ai-provider as parallel racer ([091f8f8](https://github.com/shawnphoffman/wish-lists/commit/091f8f874226f040e6667846e92c5e94054c1c5c))
* **scraper:** add browserless-provider ([dc313b8](https://github.com/shawnphoffman/wish-lists/commit/dc313b84ffb09445bfc5f760a9eca25584635d11))
* **scraper:** add clean-title post-pass ([612ff0b](https://github.com/shawnphoffman/wish-lists/commit/612ff0ba9e2cf4915a43862d738ca3609c83eaa1))
* **scraper:** add custom-http-provider ([8566351](https://github.com/shawnphoffman/wish-lists/commit/856635155d322df1ad97928caee74fac0ae11d81))
* **scraper:** add fetch-provider with UA rotation ([b903ed5](https://github.com/shawnphoffman/wish-lists/commit/b903ed534ee9fdb792ef80e27b3bd2cb15419748))
* **scraper:** add flaresolverr-provider ([eb0df9a](https://github.com/shawnphoffman/wish-lists/commit/eb0df9a7dd6049d201d8759d3c5d34d6eb1b5b45))
* **scraper:** add HTML extractor, scoring, and image filter ([abc9fa7](https://github.com/shawnphoffman/wish-lists/commit/abc9fa79962a20aad2b651ed2d55b5c4751cdbc9))
* **scraper:** add provider types and orchestrator skeleton ([01c6163](https://github.com/shawnphoffman/wish-lists/commit/01c616313ad13646cf643135ac5b270342150cd6))
* **scraper:** add streaming SSE route handler ([e544956](https://github.com/shawnphoffman/wish-lists/commit/e544956e60bea89f08f770477cba6fb066ab6e73))
* **scraper:** add useScrapeUrl hook ([01de42b](https://github.com/shawnphoffman/wish-lists/commit/01de42b850f4d6d286162de8d71d2eee4bea3996))
* **scraper:** register all four providers in the orchestrator entry points ([32acbe6](https://github.com/shawnphoffman/wish-lists/commit/32acbe66eb416192af19335c9b97b5669fbcd921))
* **scraper:** wire ai-provider into both orchestrator entry points ([febcca2](https://github.com/shawnphoffman/wish-lists/commit/febcca21f360ae5a9eb2db4822104a13aedcf61a))
* **scraper:** wire scrapeUrl server fn and DB cache ([af8978a](https://github.com/shawnphoffman/wish-lists/commit/af8978a39733cb969759af18026a95f4b7d84c30))
* **settings:** redesign permissions page with unified rows ([8ac8eb5](https://github.com/shawnphoffman/wish-lists/commit/8ac8eb54a67eef3fe36005c4f2f949d25ce8f2c0))
* **storage:** add RustFS as a peer to Garage for self-hosting ([4d1abe6](https://github.com/shawnphoffman/wish-lists/commit/4d1abe678420282cf497981996592debeedd4b8e))
* **storybook:** add light/dark theme playground stories ([09373b0](https://github.com/shawnphoffman/wish-lists/commit/09373b048c806a6ff415603b08be604d8c244098))
* **users:** add optional birth year field ([af09fac](https://github.com/shawnphoffman/wish-lists/commit/af09facfd5c0b16c823f9e1b9f207efa8096d694))


### Bug Fixes

* **a11y:** add aria-label to icon-only buttons ([ab281cc](https://github.com/shawnphoffman/wish-lists/commit/ab281ccc1125c12acbc76a934fa970f08bd0fe66))
* **admin:** stop settings upsert from resetting unrelated fields ([2d3583e](https://github.com/shawnphoffman/wish-lists/commit/2d3583ef0293304960a4feebac173ef617d581b7))
* **items:** animate comments panel close, not just open ([1374fbe](https://github.com/shawnphoffman/wish-lists/commit/1374fbeaee9577efef6186f10de7c712b3f36764))
* **permissions:** allow list editors to update list settings ([4a83952](https://github.com/shawnphoffman/wish-lists/commit/4a83952fa60084cd5357e78e6554275b4f8d9d8b))
* **permissions:** grant guardian edit access to child lists ([b932247](https://github.com/shawnphoffman/wish-lists/commit/b9322472a11f1708465252d69d6d2bb1fa4e6323))
* **seed:** force gift-ideas lists to isPrivate ([4806304](https://github.com/shawnphoffman/wish-lists/commit/4806304edcbdb1c898c9ff9115214f40113d0af5))
* **storybook:** export moveGroupToList from api mock ([17dfa9d](https://github.com/shawnphoffman/wish-lists/commit/17dfa9db2ad8df3a9605aeefa037c6cda3060585))
* **ui:** unify empty state and remove redundant list-row underline ([c611821](https://github.com/shawnphoffman/wish-lists/commit/c611821fd5794759f9d397cd4486284260a0d308))
* **user-badge:** title-case all role labels ([6fac819](https://github.com/shawnphoffman/wish-lists/commit/6fac8195e579e2d6110c5134d420d6af2c1a7660))


### Performance Improvements

* **client:** drop dotenv from client bundle and lazy-load motion/markdown ([334f0e4](https://github.com/shawnphoffman/wish-lists/commit/334f0e4e93271824e09c8b53fad7a380521ca2b7))
* **nav:** cut sidebar navigation latency on Vercel ([a51344f](https://github.com/shawnphoffman/wish-lists/commit/a51344fcde526ee8936e2cd1ba2ca81b8060b0fe))

## [0.14.0](https://github.com/shawnphoffman/wish-lists/compare/v0.13.1...v0.14.0) (2026-04-24)


### Features

* **claims:** merge unclaim into edit dialog, add ConfirmDialog ([90dc427](https://github.com/shawnphoffman/wish-lists/commit/90dc4276737591426aa9843cdeeba2dbeae8e28a))
* **comments:** expand by default, blue styling, relative time ([429bd79](https://github.com/shawnphoffman/wish-lists/commit/429bd798c040f33f518a4f685c7275a59df19ef6))
* **comments:** show comment count on item rows without expanding ([ebe958e](https://github.com/shawnphoffman/wish-lists/commit/ebe958e272611100e7f93c0d837e0da7f5fbad49))
* **items:** consolidate qty/price into comment-row pills ([0b94be3](https://github.com/shawnphoffman/wish-lists/commit/0b94be30015b095f4e52d26290a940ffa2eace2a))
* **items:** money-style total cost input with $ prefix ([cf40d80](https://github.com/shawnphoffman/wish-lists/commit/cf40d80251d4d49824a5e404006422ed5a0eb7af))
* **items:** storybook overhaul, image lightbox, grouped prop rename ([a05e694](https://github.com/shawnphoffman/wish-lists/commit/a05e694c959859363a73b5d10937e252215db151))

## [0.13.1](https://github.com/shawnphoffman/wish-lists/compare/v0.13.0...v0.13.1) (2026-04-23)


### Bug Fixes

* **docker:** bump node heap to 4GB during build ([b9a947a](https://github.com/shawnphoffman/wish-lists/commit/b9a947ac0c5f96fbd50b123d21a415ae748ed96d))

## [0.13.0](https://github.com/shawnphoffman/wish-lists/compare/v0.12.1...v0.13.0) (2026-04-23)


### Features

* **admin:** email settings tab with db-backed resend config ([0840e44](https://github.com/shawnphoffman/wish-lists/commit/0840e4419971c4197ce0c33fa0a8df1ee69684ab))
* **admin:** upload avatars for other users ([1793380](https://github.com/shawnphoffman/wish-lists/commit/1793380032de14b517fc44f1bb6ab56fef9fb0ca))
* **auth:** animated gradient background on sign-in and sign-up ([e519cbd](https://github.com/shawnphoffman/wish-lists/commit/e519cbd92df136d94f7489ea6a545671b48d6a34))
* **comments:** edit-page, motion, Cmd+Enter ([47b78e2](https://github.com/shawnphoffman/wish-lists/commit/47b78e2ed025fa175cbbc76fde3f852cf332cf75))


### Bug Fixes

* **admin:** replace number birth day input with month-aware select ([55b5d3d](https://github.com/shawnphoffman/wish-lists/commit/55b5d3daa3ab7238595a44573d1a27ae91f4d9af))
* **uploads:** hide upload hints when storage is disabled ([a293019](https://github.com/shawnphoffman/wish-lists/commit/a2930193dc3b8522f3b0d3b6aa08199caf5eabb3))

## [0.12.1](https://github.com/shawnphoffman/wish-lists/compare/v0.12.0...v0.12.1) (2026-04-23)


### Bug Fixes

* **compose:** don't gate app on garage healthcheck during cold boot ([2e4a995](https://github.com/shawnphoffman/wish-lists/commit/2e4a99505cbe994ecc03809ea564498c7f5d66c9))
* **docker:** bump base to node:22-slim, strip vendored npm ([05e11ef](https://github.com/shawnphoffman/wish-lists/commit/05e11ef42a27353b6b535059dbd37cbca44f597b))
* **uploads:** invalidate auth cookie cache on avatar update ([1bbd3a4](https://github.com/shawnphoffman/wish-lists/commit/1bbd3a467e2315f5e21bfaeb6cf2b3b94518974b))

## [0.12.0](https://github.com/shawnphoffman/wish-lists/compare/v0.11.0...v0.12.0) (2026-04-23)


### Features

* **items:** file uploads for item images, cleanup orphaned objects on delete ([80662da](https://github.com/shawnphoffman/wish-lists/commit/80662da1ee143adac75aaa21c44be11bdd44f86a))
* **lists:** add ListsCard composable component ([4a0ee8d](https://github.com/shawnphoffman/wish-lists/commit/4a0ee8d80b4a83ad5d1d0997bdd82a72dffd645a))
* **purchases:** polish row UI, chart tooltip, color scheme, icons ([b5480a4](https://github.com/shawnphoffman/wish-lists/commit/b5480a430d18a6c06387b41000aa4d8df99d8660))
* **purchases:** restructure metrics, add Spend by Recipient chart ([7d573f2](https://github.com/shawnphoffman/wish-lists/commit/7d573f21ff1b04f5e640ac9bb9e2e803ee352b63))
* **settings:** wire avatar upload and remove ([1a3a9b8](https://github.com/shawnphoffman/wish-lists/commit/1a3a9b8f6323cf6748600f26aac244661f795855))
* **storage:** add S3-compatible adapter + boot validation ([67835f1](https://github.com/shawnphoffman/wish-lists/commit/67835f12d3e13e07ae35a61d5e101a2d308c5542))
* **storage:** boot Garage in docker compose with one-shot init ([6baffab](https://github.com/shawnphoffman/wish-lists/commit/6baffaba6d124da901c63aa0cdd055ef0f84915d))
* **storage:** fold Garage bootstrap into the app entrypoint ([3a0ae8c](https://github.com/shawnphoffman/wish-lists/commit/3a0ae8c0551f3eab4b4778b2d18e6c0bda00909f))
* **storage:** upload API and /api/files proxy route ([6c56d53](https://github.com/shawnphoffman/wish-lists/commit/6c56d53d36cbf3998ebc1ac51279147ef2140885))


### Bug Fixes

* **loading:** center app-load spinner in viewport ([f4ab3e3](https://github.com/shawnphoffman/wish-lists/commit/f4ab3e383d57222e92047a9451ce3ea606910278))
* **seed:** load .env.local when running db:seed via tsx ([0eb1e83](https://github.com/shawnphoffman/wish-lists/commit/0eb1e83b1e252825815248763c483c8bd97981d3))
* **storage:** gracefully degrade when STORAGE_* env vars are missing ([5df0c0d](https://github.com/shawnphoffman/wish-lists/commit/5df0c0d0cda4268bde96379428ca45eaf5a71d14))
* **storage:** scope disabled banner to admin page only ([890e508](https://github.com/shawnphoffman/wish-lists/commit/890e508869d2f82f1b3200ea69c1b12a874f4d40))
* **storage:** scope disabled banner to authenticated app shell ([fd613da](https://github.com/shawnphoffman/wish-lists/commit/fd613da6c9e188a05715b03d1772dead83fbab37))
* **storybook:** alias @/api/storage-status to mocks ([0c8a1d2](https://github.com/shawnphoffman/wish-lists/commit/0c8a1d24d2d8975973f36aacc92a638c2e9cdc75))
* **storybook:** alias @/api/uploads to mocks ([e7b4670](https://github.com/shawnphoffman/wish-lists/commit/e7b4670fad4ba1e1660da900a4f3aeadfe494757))
* **storybook:** wrap stories in TooltipProvider ([e979afa](https://github.com/shawnphoffman/wish-lists/commit/e979afae8c3c6a8130eb996c160d1632dc7a9047))

## [0.11.0](https://github.com/shawnphoffman/wish-lists/compare/v0.10.0...v0.11.0) (2026-04-21)


### Features

* **purchases:** consolidate My Purchases and Summary into one page ([f234770](https://github.com/shawnphoffman/wish-lists/commit/f2347707ecac8154ffe4847fc72b0d4aff8e393f))

## [0.10.0](https://github.com/shawnphoffman/wish-lists/compare/v0.9.1...v0.10.0) (2026-04-21)


### Features

* **admin:** add data export and import for backup/restore ([678207e](https://github.com/shawnphoffman/wish-lists/commit/678207e6f37de13f2cb57dda4988c4da5a30f7c7))
* **devtools:** gate TanStack devtools on env + worktree ([da46d5d](https://github.com/shawnphoffman/wish-lists/commit/da46d5d37e336949c32e9a5a37ac8fcd20dc90d0))
* **list-addons:** restyle as cards, drop gifter-facing mark-as-given ([b076380](https://github.com/shawnphoffman/wish-lists/commit/b076380f6263f7b0d7399cb6a57622a482a7ac8b))
* **list-view:** restyle items to match edit page, add filter/sort ([a8212d7](https://github.com/shawnphoffman/wish-lists/commit/a8212d709e12ff8d5e9c4f5c676a174ca790b457))
* **logging:** pino-based structured logging with runtime LOG_LEVEL ([8220c8f](https://github.com/shawnphoffman/wish-lists/commit/8220c8ffaa8b9ce3532562ef062d924b972c4244))
* **nav:** split Purchases sidebar section with Received ([39b8431](https://github.com/shawnphoffman/wish-lists/commit/39b8431e3b20ee8333a0ff3da20f2f996fe4685d))
* **settings:** remove connections page ([27a8b1c](https://github.com/shawnphoffman/wish-lists/commit/27a8b1c608273d2be33c4e44037a86096922f90a))
* **sidebar:** enable icon-only collapsed mode ([b3c5045](https://github.com/shawnphoffman/wish-lists/commit/b3c504531a3ec0e93cdee04ee50eb9e75ef19a32))


### Bug Fixes

* **docker:** follow PORT env in healthcheck, hit 127.0.0.1 not localhost ([807c4ba](https://github.com/shawnphoffman/wish-lists/commit/807c4bafda26bf4ad411c0dd5be01143c1286306))
* **permissions:** center checkboxes under their column icons ([1eacf5b](https://github.com/shawnphoffman/wish-lists/commit/1eacf5b5a095bea6e77bda1bc70bc9765fff0ed1))
* stop leaking server env access into the client bundle ([ee079dc](https://github.com/shawnphoffman/wish-lists/commit/ee079dc11d4b400c7f76978d85e456f324c70bc2))

## [0.9.1](https://github.com/shawnphoffman/wish-lists/compare/v0.9.0...v0.9.1) (2026-04-21)


### Bug Fixes

* **selfhost:** boot on plain-HTTP non-localhost origins ([bdb9e9a](https://github.com/shawnphoffman/wish-lists/commit/bdb9e9a18ceb87ef7bbda2d8962434d9bfb36e53))

## [0.9.0](https://github.com/shawnphoffman/wish-lists/compare/v0.8.1...v0.9.0) (2026-04-21)


### Features

* **auth:** support multi-origin self-host configs ([357a85e](https://github.com/shawnphoffman/wish-lists/commit/357a85eba50586137a9b0f53660bf1833ae20deb))

## [0.8.1](https://github.com/shawnphoffman/wish-lists/compare/v0.8.0...v0.8.1) (2026-04-21)


### Bug Fixes

* **security:** drop upgrade-insecure-requests from CSP ([a00175d](https://github.com/shawnphoffman/wish-lists/commit/a00175d2850252bca76791c7d0afded45f3ea29e))

## [0.8.0](https://github.com/shawnphoffman/wish-lists/compare/v0.7.2...v0.8.0) (2026-04-21)


### Features

* **security:** add CSP and HSTS response headers ([2186396](https://github.com/shawnphoffman/wish-lists/commit/218639662be18d8f017a9861e7fe68380123d7aa))


### Bug Fixes

* **auth:** use window.location.origin as client baseURL fallback ([e938f9f](https://github.com/shawnphoffman/wish-lists/commit/e938f9f1d5ddab5936230a093167c91e44b939bb))

## [0.7.2](https://github.com/shawnphoffman/wish-lists/compare/v0.7.1...v0.7.2) (2026-04-21)


### Bug Fixes

* **ssr:** let start manifest auto-inject stylesheet link ([9bc6134](https://github.com/shawnphoffman/wish-lists/commit/9bc6134df6888968829a3fc71273d8dd32c8ede6))


### Performance Improvements

* **images:** convert logo and email icons to webp ([058483d](https://github.com/shawnphoffman/wish-lists/commit/058483da7c779a95820a996af499495294d722f8))

## [0.7.1](https://github.com/shawnphoffman/wish-lists/compare/v0.7.0...v0.7.1) (2026-04-21)


### Bug Fixes

* **auth:** match sign-up layout to sign-in ([a35864c](https://github.com/shawnphoffman/wish-lists/commit/a35864c0e8318049dff8d14a60394b3c91b43138))

## [0.7.0](https://github.com/shawnphoffman/wish-lists/compare/v0.6.1...v0.7.0) (2026-04-20)


### Features

* **auth:** redirect sign-in to sign-up when no admin exists ([5297218](https://github.com/shawnphoffman/wish-lists/commit/5297218f54f2c3d2fe159567317071d68f11605a))
* **lists:** style empty users state and link admins to invite page ([318e8da](https://github.com/shawnphoffman/wish-lists/commit/318e8da36ef27256d8c810894a825b98569a344c))


### Bug Fixes

* **auth:** clear cookies when session points at a deleted user ([afa1ead](https://github.com/shawnphoffman/wish-lists/commit/afa1ead2924ae7e24f0f40cb514d5888c218f0a1))
* **email:** make Resend optional so the server boots without RESEND_API_KEY ([00ed6c0](https://github.com/shawnphoffman/wish-lists/commit/00ed6c0c887ed2431122da2278817f09ea255a2b))

## [0.6.1](https://github.com/shawnphoffman/wish-lists/compare/v0.6.0...v0.6.1) (2026-04-20)


### Bug Fixes

* **docker:** skip husky prepare in prod-deps stage ([a658d2e](https://github.com/shawnphoffman/wish-lists/commit/a658d2e8c187d898906b0fa0752da5ba69b374e2))

## [0.6.0](https://github.com/shawnphoffman/wish-lists/compare/v0.5.0...v0.6.0) (2026-04-20)


### Features

* **admin:** consolidate general settings, move test email to debug ([516869b](https://github.com/shawnphoffman/wish-lists/commit/516869b871b3e16bf29bd1b9a8e03e4661e2ffe8))
* **admin:** expand theme test page with overlays, fields, tables ([f64edf2](https://github.com/shawnphoffman/wish-lists/commit/f64edf228d189d334a108e17063b78b796fd3d76))
* **admin:** restructure settings into General + Scheduling, add comment toggles ([2008cf3](https://github.com/shawnphoffman/wish-lists/commit/2008cf3d63c524f2e026b4cb1f9642b8badb4f98))
* **admin:** show row id label in list/item action menus ([78479f5](https://github.com/shawnphoffman/wish-lists/commit/78479f5dbce805a79fe791d4301400d63b54c6cc))
* **auth:** gate (core) routes behind sign-in ([4a5cdee](https://github.com/shawnphoffman/wish-lists/commit/4a5cdeec84c31b3250245a9f7b2da6a4a2ddddae))
* **common:** MarkdownTextarea with connected toolbar ([dd57988](https://github.com/shawnphoffman/wish-lists/commit/dd57988ba5da8ab58182b64ef91ccc5c7aab329e))
* **docker:** polish self-hosted deployment ([#11](https://github.com/shawnphoffman/wish-lists/issues/11)) ([1ecf879](https://github.com/shawnphoffman/wish-lists/commit/1ecf8796153c425e08a26728429cd6e6c7266ec4))
* **emails:** credit partners and co-gifters in post-birthday summary ([e74eb33](https://github.com/shawnphoffman/wish-lists/commit/e74eb33d25548448bf960929aa3c74e13837228a))
* **gifts:** claim flow - create + read ([#2](https://github.com/shawnphoffman/wish-lists/issues/2)) ([00eb082](https://github.com/shawnphoffman/wish-lists/commit/00eb082f87b415b918ecc4ed915f3167c779e7d1))
* **gifts:** unclaim + edit-claim flow; drop unused isArchived ([#3](https://github.com/shawnphoffman/wish-lists/issues/3)) ([818f338](https://github.com/shawnphoffman/wish-lists/commit/818f338faf187512d5f43c06eb9bc91523e4a240))
* **groups:** add contextual help to group badges ([459376c](https://github.com/shawnphoffman/wish-lists/commit/459376ca3c5d1f11be3aea66d853801123f41d31))
* **groups:** add sortOrder + bulk priority/delete + mixed reorder ([f80a3d9](https://github.com/shawnphoffman/wish-lists/commit/f80a3d9c344f2fd114dc4f01fd8c48ecc39aaa6c))
* **groups:** larger hoverable help icon next to group badge ([336907a](https://github.com/shawnphoffman/wish-lists/commit/336907aed6e470c257eb4f2e41e0185d7d5b3c1d))
* **groups:** lock later items in an ordered group ([d3acfd2](https://github.com/shawnphoffman/wish-lists/commit/d3acfd2a3bf98bde0bd7b2ae888a804ca2b39664))
* **groups:** lock sibling items in pick-one group after a claim ([26580eb](https://github.com/shawnphoffman/wish-lists/commit/26580ebe931d05a03b03b0d02e91692852451df4))
* **groups:** optional name and priority on item groups ([18e6e7d](https://github.com/shawnphoffman/wish-lists/commit/18e6e7da68d85ac53713c31bf80ff0c6fbccd4c7))
* **groups:** reorder items inside an ordered group from the editor ([b68c980](https://github.com/shawnphoffman/wish-lists/commit/b68c980b4e0b6453e98ecfd0114d9b85703158f9))
* **groups:** show connector pill between items in pick-one and ordered groups ([83dbdc4](https://github.com/shawnphoffman/wish-lists/commit/83dbdc482841d27fbcb282634cc2ee5a7d3fe89c))
* **item-import:** reorganize form, add grouped list picker ([1b391a0](https://github.com/shawnphoffman/wish-lists/commit/1b391a0906fc247194a7e0beb22d8d7aaf4b0cf0))
* **items:** add sortOrder column for manual list-level ordering ([103e1e6](https://github.com/shawnphoffman/wish-lists/commit/103e1e6fc3eca7f09550044ba79d794ff211f3cf))
* **items:** add sortOrder column for manual list-level ordering ([209e5bb](https://github.com/shawnphoffman/wish-lists/commit/209e5bb85c5280cdef017071aa967eb288bae9e9))
* **items:** bulk move/archive/delete/priority/reorder server actions ([7e347df](https://github.com/shawnphoffman/wish-lists/commit/7e347df371f2ba4d9105d4a53bda4d97f3045298))
* **list-addons:** off-list gifts CRUD with archive ([#4](https://github.com/shawnphoffman/wish-lists/issues/4)) ([7e38ed9](https://github.com/shawnphoffman/wish-lists/commit/7e38ed9512bbb7a2271a8c1d002484b822a261fd))
* **list-addons:** support markdown in off-list gift notes ([8af9d87](https://github.com/shawnphoffman/wish-lists/commit/8af9d87e14929b2d2e8cf1873ea2466457859502))
* **list-editors:** grant/revoke + V1 list_type migration ([#5](https://github.com/shawnphoffman/wish-lists/issues/5)) ([8fa6528](https://github.com/shawnphoffman/wish-lists/commit/8fa6528f7abe30853975fbe5b3f39f1485419ef3))
* **lists/edit:** redesign groups layout with inline sub-items ([de5c7fd](https://github.com/shawnphoffman/wish-lists/commit/de5c7fde7fa88228f4dfb10a25a44c1928beabfc))
* **lists:** add Organize page with bulk actions and comment-purge on move ([b5a9763](https://github.com/shawnphoffman/wish-lists/commit/b5a9763acda64e74349dddef76907288a65fc59e))
* **lists:** allow private lists as primary, clarify copy on My Lists ([2179a06](https://github.com/shawnphoffman/wish-lists/commit/2179a0665be6ff400033c88856e9475c08753856))
* **lists:** auto-open create dialog on /me#new hash ([bda6888](https://github.com/shawnphoffman/wish-lists/commit/bda688863098d03cd2e9e650358c497957fb9a83))
* **lists:** drag-and-drop reorder into priority buckets ([c4b608e](https://github.com/shawnphoffman/wish-lists/commit/c4b608e273f123031ab30d001ab85965ff704a88))
* **lists:** inline editor picker in settings sheet ([4fb2eda](https://github.com/shawnphoffman/wish-lists/commit/4fb2eda266976e4852dec2bc417c69a397944d53))
* **lists:** live unclaimed/total badge on home page ([65c0923](https://github.com/shawnphoffman/wish-lists/commit/65c0923ff5e8f7b78b91564bb233cd9436ebb88e))
* **lists:** move list settings + editors into right-side sheet ([c56fd23](https://github.com/shawnphoffman/wish-lists/commit/c56fd2303f8225356b3d21c0c42f2e90c8b5b226))
* **lists:** peeking priority tab on groups + standalone items ([3d127bb](https://github.com/shawnphoffman/wish-lists/commit/3d127bbc4d90930c444a5458ee06907c9ce63cb2))
* **lists:** show partner name on per-user list card ([a1e7a8c](https://github.com/shawnphoffman/wish-lists/commit/a1e7a8c22a0a17076f8d24441afb5280fe355b9c))
* **lists:** type icons in selects, show description, border empty states ([91af086](https://github.com/shawnphoffman/wish-lists/commit/91af086d91b63e58f5bb8223f951411badccef6d))
* **organize:** polish Bulk Actions and Reorder visuals ([97b020b](https://github.com/shawnphoffman/wish-lists/commit/97b020bdc6d68e2645293c46c4e736ad93a045e8))
* **organize:** redesign Reorder panel and add group bulk actions ([409a181](https://github.com/shawnphoffman/wish-lists/commit/409a1811438be78e59b6d372df47a29ae4ef1cd1))
* **organize:** show group type badge after the title ([ecfe3fd](https://github.com/shawnphoffman/wish-lists/commit/ecfe3fd416a317170a4d6627fd84fea5ef656261))
* Phase 1 + 1.5 - tooling, schema, local dev, admin recovery ([#1](https://github.com/shawnphoffman/wish-lists/issues/1)) ([9996c7b](https://github.com/shawnphoffman/wish-lists/commit/9996c7ba2e89b3258402a979176eebb490f8df2d))
* Phase 4 - comments, URL scraping, recent feeds ([#8](https://github.com/shawnphoffman/wish-lists/issues/8)) ([4abe54b](https://github.com/shawnphoffman/wish-lists/commit/4abe54bd55b1cff369cc426853727f701c657646))
* Phase 5 - child accounts, connections page, SSE real-time ([#9](https://github.com/shawnphoffman/wish-lists/issues/9)) ([87a1cfe](https://github.com/shawnphoffman/wish-lists/commit/87a1cfe6582d4c11fec3d844be17183d76aaa5e9))
* Phase 6 - birthday cron, received gifts, item import, polish ([#10](https://github.com/shawnphoffman/wish-lists/issues/10)) ([95456ae](https://github.com/shawnphoffman/wish-lists/commit/95456ae22a10d297d22e15c77b19498312e09486))
* **profile:** transactional partner sync and unlink confirmation ([6bc8463](https://github.com/shawnphoffman/wish-lists/commit/6bc8463ebdcf4fc05856d8f5e4fd141ce175cdbe))
* **purchases:** convert summary breakdown to data table with columns ([a4fe470](https://github.com/shawnphoffman/wish-lists/commit/a4fe4702ca624f54456e5bbc1a49d67eadef11ac))
* **purchases:** expand summary with metrics, timeframe, per-person chips ([2490ec0](https://github.com/shawnphoffman/wish-lists/commit/2490ec055a5e736dfe3d21d4bc21d3ac73c931c6))
* **purchases:** include co-gifter claims at $0 in summary ([dc9a231](https://github.com/shawnphoffman/wish-lists/commit/dc9a2316c42722a1bff8de08169e05b34f315ced))
* **purchases:** inline edit links on summary item rows ([3f04a84](https://github.com/shawnphoffman/wish-lists/commit/3f04a8428362c9f38a6c01369685fd2cd1f5c59f))
* **purchases:** timeframe filter, group-by-person, edit dialog ([45eb2d0](https://github.com/shawnphoffman/wish-lists/commit/45eb2d0ee82ebc4f53b2582181d9f9971fad71e6))
* **received:** credit partners and co-gifters on received gifts ([24a9516](https://github.com/shawnphoffman/wish-lists/commit/24a951681b368eac490d791f2278ce80ebdc5511))
* **sidebar:** keep active nav icon colored on downstream pages ([4996803](https://github.com/shawnphoffman/wish-lists/commit/4996803db08ab7aa7dca36ddc45fa9ddac247fc1))
* **sidebar:** smarter active matching for edit and admin pages ([72144a9](https://github.com/shawnphoffman/wish-lists/commit/72144a93911f60dff5d8c8ef182a3845409a97d6))
* **storybook:** add list item stories for recipient and buyer views ([d731be8](https://github.com/shawnphoffman/wish-lists/commit/d731be83a044022ee73b52a3093f5e48b017b0c9))
* **theme:** add list reference + follow-up card/avatar cleanups ([1ae1559](https://github.com/shawnphoffman/wish-lists/commit/1ae1559fde4897ff02d00bd4894928d5c4bf2a42))
* **theme:** expand Cards section with composition variants ([e74233e](https://github.com/shawnphoffman/wish-lists/commit/e74233e17303639e6a69c234eb3d04c81bcc38b2))
* **theme:** extract ThemeReference component, add Storybook stories ([9e428e7](https://github.com/shawnphoffman/wish-lists/commit/9e428e79a837b7afc162494a83dc9625c7acf2ec))
* **theme:** reset shadcn theme to preset b2oWHw1Hc ([34df63c](https://github.com/shawnphoffman/wish-lists/commit/34df63c7b17a7fd80c56db9cbef71006ffb847e5))
* **ui:** bump card shadow to shadow-sm + document upgrade workflow ([16b00c9](https://github.com/shawnphoffman/wish-lists/commit/16b00c9004774b093032f2c8bf3af9197dad8712))
* **ui:** tri-state Checkbox + match qty side of price badge ([46b2f29](https://github.com/shawnphoffman/wish-lists/commit/46b2f29f37b6b8e2c39f8e1e54e0593e7231a565))


### Bug Fixes

* **auth:** redirect stale cookie-cached sessions to sign-in ([fd632f3](https://github.com/shawnphoffman/wish-lists/commit/fd632f3d05efbc3d4a847f9900ffba7683e7606f))
* **db:** disambiguate users&lt;-&gt;lists relations ([b79f79c](https://github.com/shawnphoffman/wish-lists/commit/b79f79cd6534d7b0e81012929d23ba49fdd39918))
* **deploy:** heal prod Vercel rollout after V2 schema rewrite ([425ec19](https://github.com/shawnphoffman/wish-lists/commit/425ec19e41035e3d2c8b20f1b22b09a511e441e3))
* **docker:** use corepack for pnpm, resolves EACCES on container start ([e9892b6](https://github.com/shawnphoffman/wish-lists/commit/e9892b69e6c2e1dd077f87959ba5c2b8aa37b6a5))
* **items:** sub-items never show their own priority ring ([b4765d0](https://github.com/shawnphoffman/wish-lists/commit/b4765d047d1dd6c388096261e6cb9ae252268a23))
* **lint:** resolve typecheck errors and scope lint to source files ([21c0bfc](https://github.com/shawnphoffman/wish-lists/commit/21c0bfc2b19ebe26285ed12df51485733628a7e1))
* **lists:** restore border-b between grouped sub-items ([ef6c0a5](https://github.com/shawnphoffman/wish-lists/commit/ef6c0a595f54dda5fbcdafff526f80b4003a4a11))
* **lists:** ring overlay element so priority rings stay visible ([acac3f5](https://github.com/shawnphoffman/wish-lists/commit/acac3f5572f6e42c43f3688bf7e023b67b3c7228))
* **organize:** clip reorder bucket header to rounded corners ([b460a34](https://github.com/shawnphoffman/wish-lists/commit/b460a347b09c74c3ba27812bb9c8949933edbc78))
* **organize:** match reorder rows to home-card styling in light mode ([e225b4e](https://github.com/shawnphoffman/wish-lists/commit/e225b4e125dac67d50bd93c786f8c92fb81de6d5))
* **purchases:** exclude self as recipient from purchase summary ([17952f6](https://github.com/shawnphoffman/wish-lists/commit/17952f62e0567b6febc87a2a539efc3d89659e16))
* **router:** reload once on dynamic-import failure ([ebdf685](https://github.com/shawnphoffman/wish-lists/commit/ebdf685a301ff57d7af2f6eca7fa03e1e5f448e4))
* **scraper:** disable URL scraping to unblock /item/import ([48d5b9a](https://github.com/shawnphoffman/wish-lists/commit/48d5b9a9e886e4192dc39d36a4f90e2ce2851c90))
* **sidebar:** highlight My Lists for /lists/:id/organize ([eb0b3a5](https://github.com/shawnphoffman/wish-lists/commit/eb0b3a593eee56a88e2214c4ad7736fdb6999054))
* **theme:** wrap app in TooltipProvider and neutralize --accent ([52a4ece](https://github.com/shawnphoffman/wish-lists/commit/52a4ecefaf688583cbc5dbbb7ccd276f8bff9c89))
* **tooltip:** use theme-aware popover colors ([3142f1a](https://github.com/shawnphoffman/wish-lists/commit/3142f1a53fac0403ab6b524275415df9a63d0ee3))
* **ui:** default Input/Textarea autoComplete to off ([fb029df](https://github.com/shawnphoffman/wish-lists/commit/fb029dfd8e755f2cb9b45e2bcbaae4f50a9eca86))
* **ui:** sidebar theme toggle padding + organize row card styling ([7d34544](https://github.com/shawnphoffman/wish-lists/commit/7d345447cb868a6690ec8ed5d56eb399517818aa))
* **ui:** stop clamping dropdown menu width to trigger width ([f81da9e](https://github.com/shawnphoffman/wish-lists/commit/f81da9e5a75f90932103d7dbf2ab35da4e45e796))

## [0.5.0](https://github.com/shawnphoffman/wish-lists/compare/group-wish-lists-open-v0.4.0...group-wish-lists-open-v0.5.0) (2026-04-20)


### Features

* **admin:** consolidate general settings, move test email to debug ([516869b](https://github.com/shawnphoffman/wish-lists/commit/516869b871b3e16bf29bd1b9a8e03e4661e2ffe8))
* **admin:** restructure settings into General + Scheduling, add comment toggles ([2008cf3](https://github.com/shawnphoffman/wish-lists/commit/2008cf3d63c524f2e026b4cb1f9642b8badb4f98))
* **admin:** show row id label in list/item action menus ([78479f5](https://github.com/shawnphoffman/wish-lists/commit/78479f5dbce805a79fe791d4301400d63b54c6cc))
* **auth:** gate (core) routes behind sign-in ([4a5cdee](https://github.com/shawnphoffman/wish-lists/commit/4a5cdeec84c31b3250245a9f7b2da6a4a2ddddae))
* **common:** MarkdownTextarea with connected toolbar ([dd57988](https://github.com/shawnphoffman/wish-lists/commit/dd57988ba5da8ab58182b64ef91ccc5c7aab329e))
* **docker:** polish self-hosted deployment ([#11](https://github.com/shawnphoffman/wish-lists/issues/11)) ([1ecf879](https://github.com/shawnphoffman/wish-lists/commit/1ecf8796153c425e08a26728429cd6e6c7266ec4))
* **emails:** credit partners and co-gifters in post-birthday summary ([e74eb33](https://github.com/shawnphoffman/wish-lists/commit/e74eb33d25548448bf960929aa3c74e13837228a))
* **gifts:** claim flow - create + read ([#2](https://github.com/shawnphoffman/wish-lists/issues/2)) ([00eb082](https://github.com/shawnphoffman/wish-lists/commit/00eb082f87b415b918ecc4ed915f3167c779e7d1))
* **gifts:** unclaim + edit-claim flow; drop unused isArchived ([#3](https://github.com/shawnphoffman/wish-lists/issues/3)) ([818f338](https://github.com/shawnphoffman/wish-lists/commit/818f338faf187512d5f43c06eb9bc91523e4a240))
* **groups:** add contextual help to group badges ([459376c](https://github.com/shawnphoffman/wish-lists/commit/459376ca3c5d1f11be3aea66d853801123f41d31))
* **groups:** add sortOrder + bulk priority/delete + mixed reorder ([f80a3d9](https://github.com/shawnphoffman/wish-lists/commit/f80a3d9c344f2fd114dc4f01fd8c48ecc39aaa6c))
* **groups:** larger hoverable help icon next to group badge ([336907a](https://github.com/shawnphoffman/wish-lists/commit/336907aed6e470c257eb4f2e41e0185d7d5b3c1d))
* **groups:** lock later items in an ordered group ([d3acfd2](https://github.com/shawnphoffman/wish-lists/commit/d3acfd2a3bf98bde0bd7b2ae888a804ca2b39664))
* **groups:** lock sibling items in pick-one group after a claim ([26580eb](https://github.com/shawnphoffman/wish-lists/commit/26580ebe931d05a03b03b0d02e91692852451df4))
* **groups:** optional name and priority on item groups ([18e6e7d](https://github.com/shawnphoffman/wish-lists/commit/18e6e7da68d85ac53713c31bf80ff0c6fbccd4c7))
* **groups:** reorder items inside an ordered group from the editor ([b68c980](https://github.com/shawnphoffman/wish-lists/commit/b68c980b4e0b6453e98ecfd0114d9b85703158f9))
* **groups:** show connector pill between items in pick-one and ordered groups ([83dbdc4](https://github.com/shawnphoffman/wish-lists/commit/83dbdc482841d27fbcb282634cc2ee5a7d3fe89c))
* **item-import:** reorganize form, add grouped list picker ([1b391a0](https://github.com/shawnphoffman/wish-lists/commit/1b391a0906fc247194a7e0beb22d8d7aaf4b0cf0))
* **items:** add sortOrder column for manual list-level ordering ([103e1e6](https://github.com/shawnphoffman/wish-lists/commit/103e1e6fc3eca7f09550044ba79d794ff211f3cf))
* **items:** add sortOrder column for manual list-level ordering ([209e5bb](https://github.com/shawnphoffman/wish-lists/commit/209e5bb85c5280cdef017071aa967eb288bae9e9))
* **items:** bulk move/archive/delete/priority/reorder server actions ([7e347df](https://github.com/shawnphoffman/wish-lists/commit/7e347df371f2ba4d9105d4a53bda4d97f3045298))
* **list-addons:** off-list gifts CRUD with archive ([#4](https://github.com/shawnphoffman/wish-lists/issues/4)) ([7e38ed9](https://github.com/shawnphoffman/wish-lists/commit/7e38ed9512bbb7a2271a8c1d002484b822a261fd))
* **list-editors:** grant/revoke + V1 list_type migration ([#5](https://github.com/shawnphoffman/wish-lists/issues/5)) ([8fa6528](https://github.com/shawnphoffman/wish-lists/commit/8fa6528f7abe30853975fbe5b3f39f1485419ef3))
* **lists/edit:** redesign groups layout with inline sub-items ([de5c7fd](https://github.com/shawnphoffman/wish-lists/commit/de5c7fde7fa88228f4dfb10a25a44c1928beabfc))
* **lists:** add Organize page with bulk actions and comment-purge on move ([b5a9763](https://github.com/shawnphoffman/wish-lists/commit/b5a9763acda64e74349dddef76907288a65fc59e))
* **lists:** allow private lists as primary, clarify copy on My Lists ([2179a06](https://github.com/shawnphoffman/wish-lists/commit/2179a0665be6ff400033c88856e9475c08753856))
* **lists:** auto-open create dialog on /me#new hash ([bda6888](https://github.com/shawnphoffman/wish-lists/commit/bda688863098d03cd2e9e650358c497957fb9a83))
* **lists:** drag-and-drop reorder into priority buckets ([c4b608e](https://github.com/shawnphoffman/wish-lists/commit/c4b608e273f123031ab30d001ab85965ff704a88))
* **lists:** inline editor picker in settings sheet ([4fb2eda](https://github.com/shawnphoffman/wish-lists/commit/4fb2eda266976e4852dec2bc417c69a397944d53))
* **lists:** live unclaimed/total badge on home page ([65c0923](https://github.com/shawnphoffman/wish-lists/commit/65c0923ff5e8f7b78b91564bb233cd9436ebb88e))
* **lists:** move list settings + editors into right-side sheet ([c56fd23](https://github.com/shawnphoffman/wish-lists/commit/c56fd2303f8225356b3d21c0c42f2e90c8b5b226))
* **lists:** show partner name on per-user list card ([a1e7a8c](https://github.com/shawnphoffman/wish-lists/commit/a1e7a8c22a0a17076f8d24441afb5280fe355b9c))
* **lists:** type icons in selects, show description, border empty states ([91af086](https://github.com/shawnphoffman/wish-lists/commit/91af086d91b63e58f5bb8223f951411badccef6d))
* **organize:** polish Bulk Actions and Reorder visuals ([97b020b](https://github.com/shawnphoffman/wish-lists/commit/97b020bdc6d68e2645293c46c4e736ad93a045e8))
* **organize:** redesign Reorder panel and add group bulk actions ([409a181](https://github.com/shawnphoffman/wish-lists/commit/409a1811438be78e59b6d372df47a29ae4ef1cd1))
* **organize:** show group type badge after the title ([ecfe3fd](https://github.com/shawnphoffman/wish-lists/commit/ecfe3fd416a317170a4d6627fd84fea5ef656261))
* Phase 1 + 1.5 - tooling, schema, local dev, admin recovery ([#1](https://github.com/shawnphoffman/wish-lists/issues/1)) ([9996c7b](https://github.com/shawnphoffman/wish-lists/commit/9996c7ba2e89b3258402a979176eebb490f8df2d))
* Phase 4 - comments, URL scraping, recent feeds ([#8](https://github.com/shawnphoffman/wish-lists/issues/8)) ([4abe54b](https://github.com/shawnphoffman/wish-lists/commit/4abe54bd55b1cff369cc426853727f701c657646))
* Phase 5 - child accounts, connections page, SSE real-time ([#9](https://github.com/shawnphoffman/wish-lists/issues/9)) ([87a1cfe](https://github.com/shawnphoffman/wish-lists/commit/87a1cfe6582d4c11fec3d844be17183d76aaa5e9))
* Phase 6 - birthday cron, received gifts, item import, polish ([#10](https://github.com/shawnphoffman/wish-lists/issues/10)) ([95456ae](https://github.com/shawnphoffman/wish-lists/commit/95456ae22a10d297d22e15c77b19498312e09486))
* **profile:** transactional partner sync and unlink confirmation ([6bc8463](https://github.com/shawnphoffman/wish-lists/commit/6bc8463ebdcf4fc05856d8f5e4fd141ce175cdbe))
* **purchases:** convert summary breakdown to data table with columns ([a4fe470](https://github.com/shawnphoffman/wish-lists/commit/a4fe4702ca624f54456e5bbc1a49d67eadef11ac))
* **purchases:** expand summary with metrics, timeframe, per-person chips ([2490ec0](https://github.com/shawnphoffman/wish-lists/commit/2490ec055a5e736dfe3d21d4bc21d3ac73c931c6))
* **purchases:** include co-gifter claims at $0 in summary ([dc9a231](https://github.com/shawnphoffman/wish-lists/commit/dc9a2316c42722a1bff8de08169e05b34f315ced))
* **purchases:** inline edit links on summary item rows ([3f04a84](https://github.com/shawnphoffman/wish-lists/commit/3f04a8428362c9f38a6c01369685fd2cd1f5c59f))
* **purchases:** timeframe filter, group-by-person, edit dialog ([45eb2d0](https://github.com/shawnphoffman/wish-lists/commit/45eb2d0ee82ebc4f53b2582181d9f9971fad71e6))
* **received:** credit partners and co-gifters on received gifts ([24a9516](https://github.com/shawnphoffman/wish-lists/commit/24a951681b368eac490d791f2278ce80ebdc5511))
* **sidebar:** keep active nav icon colored on downstream pages ([4996803](https://github.com/shawnphoffman/wish-lists/commit/4996803db08ab7aa7dca36ddc45fa9ddac247fc1))
* **sidebar:** smarter active matching for edit and admin pages ([72144a9](https://github.com/shawnphoffman/wish-lists/commit/72144a93911f60dff5d8c8ef182a3845409a97d6))
* **storybook:** add list item stories for recipient and buyer views ([d731be8](https://github.com/shawnphoffman/wish-lists/commit/d731be83a044022ee73b52a3093f5e48b017b0c9))
* **ui:** tri-state Checkbox + match qty side of price badge ([46b2f29](https://github.com/shawnphoffman/wish-lists/commit/46b2f29f37b6b8e2c39f8e1e54e0593e7231a565))


### Bug Fixes

* **auth:** redirect stale cookie-cached sessions to sign-in ([fd632f3](https://github.com/shawnphoffman/wish-lists/commit/fd632f3d05efbc3d4a847f9900ffba7683e7606f))
* **db:** disambiguate users&lt;-&gt;lists relations ([b79f79c](https://github.com/shawnphoffman/wish-lists/commit/b79f79cd6534d7b0e81012929d23ba49fdd39918))
* **deploy:** heal prod Vercel rollout after V2 schema rewrite ([425ec19](https://github.com/shawnphoffman/wish-lists/commit/425ec19e41035e3d2c8b20f1b22b09a511e441e3))
* **lint:** resolve typecheck errors and scope lint to source files ([21c0bfc](https://github.com/shawnphoffman/wish-lists/commit/21c0bfc2b19ebe26285ed12df51485733628a7e1))
* **organize:** clip reorder bucket header to rounded corners ([b460a34](https://github.com/shawnphoffman/wish-lists/commit/b460a347b09c74c3ba27812bb9c8949933edbc78))
* **organize:** match reorder rows to home-card styling in light mode ([e225b4e](https://github.com/shawnphoffman/wish-lists/commit/e225b4e125dac67d50bd93c786f8c92fb81de6d5))
* **purchases:** exclude self as recipient from purchase summary ([17952f6](https://github.com/shawnphoffman/wish-lists/commit/17952f62e0567b6febc87a2a539efc3d89659e16))
* **router:** reload once on dynamic-import failure ([ebdf685](https://github.com/shawnphoffman/wish-lists/commit/ebdf685a301ff57d7af2f6eca7fa03e1e5f448e4))
* **scraper:** disable URL scraping to unblock /item/import ([48d5b9a](https://github.com/shawnphoffman/wish-lists/commit/48d5b9a9e886e4192dc39d36a4f90e2ce2851c90))
* **tooltip:** use theme-aware popover colors ([3142f1a](https://github.com/shawnphoffman/wish-lists/commit/3142f1a53fac0403ab6b524275415df9a63d0ee3))
* **ui:** default Input/Textarea autoComplete to off ([fb029df](https://github.com/shawnphoffman/wish-lists/commit/fb029dfd8e755f2cb9b45e2bcbaae4f50a9eca86))
* **ui:** sidebar theme toggle padding + organize row card styling ([7d34544](https://github.com/shawnphoffman/wish-lists/commit/7d345447cb868a6690ec8ed5d56eb399517818aa))

## [0.4.0](https://github.com/shawnphoffman/wish-lists/compare/group-wish-lists-open-v0.3.0...group-wish-lists-open-v0.4.0) (2026-04-20)


### Features

* **admin:** consolidate general settings, move test email to debug ([516869b](https://github.com/shawnphoffman/wish-lists/commit/516869b871b3e16bf29bd1b9a8e03e4661e2ffe8))
* **admin:** restructure settings into General + Scheduling, add comment toggles ([2008cf3](https://github.com/shawnphoffman/wish-lists/commit/2008cf3d63c524f2e026b4cb1f9642b8badb4f98))
* **auth:** gate (core) routes behind sign-in ([4a5cdee](https://github.com/shawnphoffman/wish-lists/commit/4a5cdeec84c31b3250245a9f7b2da6a4a2ddddae))
* **common:** MarkdownTextarea with connected toolbar ([dd57988](https://github.com/shawnphoffman/wish-lists/commit/dd57988ba5da8ab58182b64ef91ccc5c7aab329e))
* **docker:** polish self-hosted deployment ([#11](https://github.com/shawnphoffman/wish-lists/issues/11)) ([1ecf879](https://github.com/shawnphoffman/wish-lists/commit/1ecf8796153c425e08a26728429cd6e6c7266ec4))
* **emails:** credit partners and co-gifters in post-birthday summary ([e74eb33](https://github.com/shawnphoffman/wish-lists/commit/e74eb33d25548448bf960929aa3c74e13837228a))
* **gifts:** claim flow - create + read ([#2](https://github.com/shawnphoffman/wish-lists/issues/2)) ([00eb082](https://github.com/shawnphoffman/wish-lists/commit/00eb082f87b415b918ecc4ed915f3167c779e7d1))
* **gifts:** unclaim + edit-claim flow; drop unused isArchived ([#3](https://github.com/shawnphoffman/wish-lists/issues/3)) ([818f338](https://github.com/shawnphoffman/wish-lists/commit/818f338faf187512d5f43c06eb9bc91523e4a240))
* **groups:** add contextual help to group badges ([459376c](https://github.com/shawnphoffman/wish-lists/commit/459376ca3c5d1f11be3aea66d853801123f41d31))
* **groups:** add sortOrder + bulk priority/delete + mixed reorder ([f80a3d9](https://github.com/shawnphoffman/wish-lists/commit/f80a3d9c344f2fd114dc4f01fd8c48ecc39aaa6c))
* **groups:** larger hoverable help icon next to group badge ([336907a](https://github.com/shawnphoffman/wish-lists/commit/336907aed6e470c257eb4f2e41e0185d7d5b3c1d))
* **groups:** lock later items in an ordered group ([d3acfd2](https://github.com/shawnphoffman/wish-lists/commit/d3acfd2a3bf98bde0bd7b2ae888a804ca2b39664))
* **groups:** lock sibling items in pick-one group after a claim ([26580eb](https://github.com/shawnphoffman/wish-lists/commit/26580ebe931d05a03b03b0d02e91692852451df4))
* **groups:** optional name and priority on item groups ([18e6e7d](https://github.com/shawnphoffman/wish-lists/commit/18e6e7da68d85ac53713c31bf80ff0c6fbccd4c7))
* **groups:** reorder items inside an ordered group from the editor ([b68c980](https://github.com/shawnphoffman/wish-lists/commit/b68c980b4e0b6453e98ecfd0114d9b85703158f9))
* **groups:** show connector pill between items in pick-one and ordered groups ([83dbdc4](https://github.com/shawnphoffman/wish-lists/commit/83dbdc482841d27fbcb282634cc2ee5a7d3fe89c))
* **item-import:** reorganize form, add grouped list picker ([1b391a0](https://github.com/shawnphoffman/wish-lists/commit/1b391a0906fc247194a7e0beb22d8d7aaf4b0cf0))
* **items:** add sortOrder column for manual list-level ordering ([103e1e6](https://github.com/shawnphoffman/wish-lists/commit/103e1e6fc3eca7f09550044ba79d794ff211f3cf))
* **items:** add sortOrder column for manual list-level ordering ([209e5bb](https://github.com/shawnphoffman/wish-lists/commit/209e5bb85c5280cdef017071aa967eb288bae9e9))
* **items:** bulk move/archive/delete/priority/reorder server actions ([7e347df](https://github.com/shawnphoffman/wish-lists/commit/7e347df371f2ba4d9105d4a53bda4d97f3045298))
* **list-addons:** off-list gifts CRUD with archive ([#4](https://github.com/shawnphoffman/wish-lists/issues/4)) ([7e38ed9](https://github.com/shawnphoffman/wish-lists/commit/7e38ed9512bbb7a2271a8c1d002484b822a261fd))
* **list-editors:** grant/revoke + V1 list_type migration ([#5](https://github.com/shawnphoffman/wish-lists/issues/5)) ([8fa6528](https://github.com/shawnphoffman/wish-lists/commit/8fa6528f7abe30853975fbe5b3f39f1485419ef3))
* **lists/edit:** redesign groups layout with inline sub-items ([de5c7fd](https://github.com/shawnphoffman/wish-lists/commit/de5c7fde7fa88228f4dfb10a25a44c1928beabfc))
* **lists:** add Organize page with bulk actions and comment-purge on move ([b5a9763](https://github.com/shawnphoffman/wish-lists/commit/b5a9763acda64e74349dddef76907288a65fc59e))
* **lists:** allow private lists as primary, clarify copy on My Lists ([2179a06](https://github.com/shawnphoffman/wish-lists/commit/2179a0665be6ff400033c88856e9475c08753856))
* **lists:** auto-open create dialog on /me#new hash ([bda6888](https://github.com/shawnphoffman/wish-lists/commit/bda688863098d03cd2e9e650358c497957fb9a83))
* **lists:** drag-and-drop reorder into priority buckets ([c4b608e](https://github.com/shawnphoffman/wish-lists/commit/c4b608e273f123031ab30d001ab85965ff704a88))
* **lists:** inline editor picker in settings sheet ([4fb2eda](https://github.com/shawnphoffman/wish-lists/commit/4fb2eda266976e4852dec2bc417c69a397944d53))
* **lists:** live unclaimed/total badge on home page ([65c0923](https://github.com/shawnphoffman/wish-lists/commit/65c0923ff5e8f7b78b91564bb233cd9436ebb88e))
* **lists:** move list settings + editors into right-side sheet ([c56fd23](https://github.com/shawnphoffman/wish-lists/commit/c56fd2303f8225356b3d21c0c42f2e90c8b5b226))
* **lists:** show partner name on per-user list card ([a1e7a8c](https://github.com/shawnphoffman/wish-lists/commit/a1e7a8c22a0a17076f8d24441afb5280fe355b9c))
* **lists:** type icons in selects, show description, border empty states ([91af086](https://github.com/shawnphoffman/wish-lists/commit/91af086d91b63e58f5bb8223f951411badccef6d))
* **organize:** polish Bulk Actions and Reorder visuals ([97b020b](https://github.com/shawnphoffman/wish-lists/commit/97b020bdc6d68e2645293c46c4e736ad93a045e8))
* **organize:** redesign Reorder panel and add group bulk actions ([409a181](https://github.com/shawnphoffman/wish-lists/commit/409a1811438be78e59b6d372df47a29ae4ef1cd1))
* **organize:** show group type badge after the title ([ecfe3fd](https://github.com/shawnphoffman/wish-lists/commit/ecfe3fd416a317170a4d6627fd84fea5ef656261))
* Phase 1 + 1.5 - tooling, schema, local dev, admin recovery ([#1](https://github.com/shawnphoffman/wish-lists/issues/1)) ([9996c7b](https://github.com/shawnphoffman/wish-lists/commit/9996c7ba2e89b3258402a979176eebb490f8df2d))
* Phase 4 - comments, URL scraping, recent feeds ([#8](https://github.com/shawnphoffman/wish-lists/issues/8)) ([4abe54b](https://github.com/shawnphoffman/wish-lists/commit/4abe54bd55b1cff369cc426853727f701c657646))
* Phase 5 - child accounts, connections page, SSE real-time ([#9](https://github.com/shawnphoffman/wish-lists/issues/9)) ([87a1cfe](https://github.com/shawnphoffman/wish-lists/commit/87a1cfe6582d4c11fec3d844be17183d76aaa5e9))
* Phase 6 - birthday cron, received gifts, item import, polish ([#10](https://github.com/shawnphoffman/wish-lists/issues/10)) ([95456ae](https://github.com/shawnphoffman/wish-lists/commit/95456ae22a10d297d22e15c77b19498312e09486))
* **profile:** transactional partner sync and unlink confirmation ([6bc8463](https://github.com/shawnphoffman/wish-lists/commit/6bc8463ebdcf4fc05856d8f5e4fd141ce175cdbe))
* **purchases:** convert summary breakdown to data table with columns ([a4fe470](https://github.com/shawnphoffman/wish-lists/commit/a4fe4702ca624f54456e5bbc1a49d67eadef11ac))
* **purchases:** expand summary with metrics, timeframe, per-person chips ([2490ec0](https://github.com/shawnphoffman/wish-lists/commit/2490ec055a5e736dfe3d21d4bc21d3ac73c931c6))
* **purchases:** include co-gifter claims at $0 in summary ([dc9a231](https://github.com/shawnphoffman/wish-lists/commit/dc9a2316c42722a1bff8de08169e05b34f315ced))
* **purchases:** inline edit links on summary item rows ([3f04a84](https://github.com/shawnphoffman/wish-lists/commit/3f04a8428362c9f38a6c01369685fd2cd1f5c59f))
* **purchases:** timeframe filter, group-by-person, edit dialog ([45eb2d0](https://github.com/shawnphoffman/wish-lists/commit/45eb2d0ee82ebc4f53b2582181d9f9971fad71e6))
* **received:** credit partners and co-gifters on received gifts ([24a9516](https://github.com/shawnphoffman/wish-lists/commit/24a951681b368eac490d791f2278ce80ebdc5511))
* **sidebar:** keep active nav icon colored on downstream pages ([4996803](https://github.com/shawnphoffman/wish-lists/commit/4996803db08ab7aa7dca36ddc45fa9ddac247fc1))
* **sidebar:** smarter active matching for edit and admin pages ([72144a9](https://github.com/shawnphoffman/wish-lists/commit/72144a93911f60dff5d8c8ef182a3845409a97d6))
* **storybook:** add list item stories for recipient and buyer views ([d731be8](https://github.com/shawnphoffman/wish-lists/commit/d731be83a044022ee73b52a3093f5e48b017b0c9))
* **ui:** tri-state Checkbox + match qty side of price badge ([46b2f29](https://github.com/shawnphoffman/wish-lists/commit/46b2f29f37b6b8e2c39f8e1e54e0593e7231a565))


### Bug Fixes

* **auth:** redirect stale cookie-cached sessions to sign-in ([fd632f3](https://github.com/shawnphoffman/wish-lists/commit/fd632f3d05efbc3d4a847f9900ffba7683e7606f))
* **db:** disambiguate users&lt;-&gt;lists relations ([b79f79c](https://github.com/shawnphoffman/wish-lists/commit/b79f79cd6534d7b0e81012929d23ba49fdd39918))
* **deploy:** heal prod Vercel rollout after V2 schema rewrite ([425ec19](https://github.com/shawnphoffman/wish-lists/commit/425ec19e41035e3d2c8b20f1b22b09a511e441e3))
* **lint:** resolve typecheck errors and scope lint to source files ([21c0bfc](https://github.com/shawnphoffman/wish-lists/commit/21c0bfc2b19ebe26285ed12df51485733628a7e1))
* **organize:** clip reorder bucket header to rounded corners ([b460a34](https://github.com/shawnphoffman/wish-lists/commit/b460a347b09c74c3ba27812bb9c8949933edbc78))
* **organize:** match reorder rows to home-card styling in light mode ([e225b4e](https://github.com/shawnphoffman/wish-lists/commit/e225b4e125dac67d50bd93c786f8c92fb81de6d5))
* **purchases:** exclude self as recipient from purchase summary ([17952f6](https://github.com/shawnphoffman/wish-lists/commit/17952f62e0567b6febc87a2a539efc3d89659e16))
* **router:** reload once on dynamic-import failure ([ebdf685](https://github.com/shawnphoffman/wish-lists/commit/ebdf685a301ff57d7af2f6eca7fa03e1e5f448e4))
* **scraper:** disable URL scraping to unblock /item/import ([48d5b9a](https://github.com/shawnphoffman/wish-lists/commit/48d5b9a9e886e4192dc39d36a4f90e2ce2851c90))
* **tooltip:** use theme-aware popover colors ([3142f1a](https://github.com/shawnphoffman/wish-lists/commit/3142f1a53fac0403ab6b524275415df9a63d0ee3))
* **ui:** sidebar theme toggle padding + organize row card styling ([7d34544](https://github.com/shawnphoffman/wish-lists/commit/7d345447cb868a6690ec8ed5d56eb399517818aa))

## [0.3.0](https://github.com/shawnphoffman/wish-lists/compare/group-wish-lists-open-v0.2.0...group-wish-lists-open-v0.3.0) (2026-04-18)


### Features

* **admin:** consolidate general settings, move test email to debug ([516869b](https://github.com/shawnphoffman/wish-lists/commit/516869b871b3e16bf29bd1b9a8e03e4661e2ffe8))
* **admin:** restructure settings into General + Scheduling, add comment toggles ([2008cf3](https://github.com/shawnphoffman/wish-lists/commit/2008cf3d63c524f2e026b4cb1f9642b8badb4f98))
* **docker:** polish self-hosted deployment ([#11](https://github.com/shawnphoffman/wish-lists/issues/11)) ([1ecf879](https://github.com/shawnphoffman/wish-lists/commit/1ecf8796153c425e08a26728429cd6e6c7266ec4))
* **gifts:** claim flow - create + read ([#2](https://github.com/shawnphoffman/wish-lists/issues/2)) ([00eb082](https://github.com/shawnphoffman/wish-lists/commit/00eb082f87b415b918ecc4ed915f3167c779e7d1))
* **gifts:** unclaim + edit-claim flow; drop unused isArchived ([#3](https://github.com/shawnphoffman/wish-lists/issues/3)) ([818f338](https://github.com/shawnphoffman/wish-lists/commit/818f338faf187512d5f43c06eb9bc91523e4a240))
* **groups:** add contextual help to group badges ([459376c](https://github.com/shawnphoffman/wish-lists/commit/459376ca3c5d1f11be3aea66d853801123f41d31))
* **groups:** larger hoverable help icon next to group badge ([336907a](https://github.com/shawnphoffman/wish-lists/commit/336907aed6e470c257eb4f2e41e0185d7d5b3c1d))
* **groups:** lock later items in an ordered group ([d3acfd2](https://github.com/shawnphoffman/wish-lists/commit/d3acfd2a3bf98bde0bd7b2ae888a804ca2b39664))
* **groups:** lock sibling items in pick-one group after a claim ([26580eb](https://github.com/shawnphoffman/wish-lists/commit/26580ebe931d05a03b03b0d02e91692852451df4))
* **groups:** optional name and priority on item groups ([18e6e7d](https://github.com/shawnphoffman/wish-lists/commit/18e6e7da68d85ac53713c31bf80ff0c6fbccd4c7))
* **groups:** reorder items inside an ordered group from the editor ([b68c980](https://github.com/shawnphoffman/wish-lists/commit/b68c980b4e0b6453e98ecfd0114d9b85703158f9))
* **groups:** show connector pill between items in pick-one and ordered groups ([83dbdc4](https://github.com/shawnphoffman/wish-lists/commit/83dbdc482841d27fbcb282634cc2ee5a7d3fe89c))
* **list-addons:** off-list gifts CRUD with archive ([#4](https://github.com/shawnphoffman/wish-lists/issues/4)) ([7e38ed9](https://github.com/shawnphoffman/wish-lists/commit/7e38ed9512bbb7a2271a8c1d002484b822a261fd))
* **list-editors:** grant/revoke + V1 list_type migration ([#5](https://github.com/shawnphoffman/wish-lists/issues/5)) ([8fa6528](https://github.com/shawnphoffman/wish-lists/commit/8fa6528f7abe30853975fbe5b3f39f1485419ef3))
* **lists:** auto-open create dialog on /me#new hash ([bda6888](https://github.com/shawnphoffman/wish-lists/commit/bda688863098d03cd2e9e650358c497957fb9a83))
* **lists:** inline editor picker in settings sheet ([4fb2eda](https://github.com/shawnphoffman/wish-lists/commit/4fb2eda266976e4852dec2bc417c69a397944d53))
* **lists:** live unclaimed/total badge on home page ([65c0923](https://github.com/shawnphoffman/wish-lists/commit/65c0923ff5e8f7b78b91564bb233cd9436ebb88e))
* **lists:** move list settings + editors into right-side sheet ([c56fd23](https://github.com/shawnphoffman/wish-lists/commit/c56fd2303f8225356b3d21c0c42f2e90c8b5b226))
* Phase 1 + 1.5 - tooling, schema, local dev, admin recovery ([#1](https://github.com/shawnphoffman/wish-lists/issues/1)) ([9996c7b](https://github.com/shawnphoffman/wish-lists/commit/9996c7ba2e89b3258402a979176eebb490f8df2d))
* Phase 4 - comments, URL scraping, recent feeds ([#8](https://github.com/shawnphoffman/wish-lists/issues/8)) ([4abe54b](https://github.com/shawnphoffman/wish-lists/commit/4abe54bd55b1cff369cc426853727f701c657646))
* Phase 5 - child accounts, connections page, SSE real-time ([#9](https://github.com/shawnphoffman/wish-lists/issues/9)) ([87a1cfe](https://github.com/shawnphoffman/wish-lists/commit/87a1cfe6582d4c11fec3d844be17183d76aaa5e9))
* Phase 6 - birthday cron, received gifts, item import, polish ([#10](https://github.com/shawnphoffman/wish-lists/issues/10)) ([95456ae](https://github.com/shawnphoffman/wish-lists/commit/95456ae22a10d297d22e15c77b19498312e09486))
* **purchases:** timeframe filter, group-by-person, edit dialog ([45eb2d0](https://github.com/shawnphoffman/wish-lists/commit/45eb2d0ee82ebc4f53b2582181d9f9971fad71e6))
* **sidebar:** keep active nav icon colored on downstream pages ([4996803](https://github.com/shawnphoffman/wish-lists/commit/4996803db08ab7aa7dca36ddc45fa9ddac247fc1))
* **storybook:** add list item stories for recipient and buyer views ([d731be8](https://github.com/shawnphoffman/wish-lists/commit/d731be83a044022ee73b52a3093f5e48b017b0c9))


### Bug Fixes

* **db:** disambiguate users&lt;-&gt;lists relations ([b79f79c](https://github.com/shawnphoffman/wish-lists/commit/b79f79cd6534d7b0e81012929d23ba49fdd39918))
* **deploy:** heal prod Vercel rollout after V2 schema rewrite ([425ec19](https://github.com/shawnphoffman/wish-lists/commit/425ec19e41035e3d2c8b20f1b22b09a511e441e3))
* **tooltip:** use theme-aware popover colors ([3142f1a](https://github.com/shawnphoffman/wish-lists/commit/3142f1a53fac0403ab6b524275415df9a63d0ee3))

## [0.2.0](https://github.com/shawnphoffman/wish-lists/compare/group-wish-lists-open-v0.1.0...group-wish-lists-open-v0.2.0) (2026-04-18)


### Features

* **admin:** consolidate general settings, move test email to debug ([516869b](https://github.com/shawnphoffman/wish-lists/commit/516869b871b3e16bf29bd1b9a8e03e4661e2ffe8))
* **admin:** restructure settings into General + Scheduling, add comment toggles ([2008cf3](https://github.com/shawnphoffman/wish-lists/commit/2008cf3d63c524f2e026b4cb1f9642b8badb4f98))
* **docker:** polish self-hosted deployment ([#11](https://github.com/shawnphoffman/wish-lists/issues/11)) ([1ecf879](https://github.com/shawnphoffman/wish-lists/commit/1ecf8796153c425e08a26728429cd6e6c7266ec4))
* **gifts:** claim flow - create + read ([#2](https://github.com/shawnphoffman/wish-lists/issues/2)) ([00eb082](https://github.com/shawnphoffman/wish-lists/commit/00eb082f87b415b918ecc4ed915f3167c779e7d1))
* **gifts:** unclaim + edit-claim flow; drop unused isArchived ([#3](https://github.com/shawnphoffman/wish-lists/issues/3)) ([818f338](https://github.com/shawnphoffman/wish-lists/commit/818f338faf187512d5f43c06eb9bc91523e4a240))
* **groups:** add contextual help to group badges ([459376c](https://github.com/shawnphoffman/wish-lists/commit/459376ca3c5d1f11be3aea66d853801123f41d31))
* **groups:** larger hoverable help icon next to group badge ([336907a](https://github.com/shawnphoffman/wish-lists/commit/336907aed6e470c257eb4f2e41e0185d7d5b3c1d))
* **groups:** lock later items in an ordered group ([d3acfd2](https://github.com/shawnphoffman/wish-lists/commit/d3acfd2a3bf98bde0bd7b2ae888a804ca2b39664))
* **groups:** lock sibling items in pick-one group after a claim ([26580eb](https://github.com/shawnphoffman/wish-lists/commit/26580ebe931d05a03b03b0d02e91692852451df4))
* **groups:** optional name and priority on item groups ([18e6e7d](https://github.com/shawnphoffman/wish-lists/commit/18e6e7da68d85ac53713c31bf80ff0c6fbccd4c7))
* **groups:** reorder items inside an ordered group from the editor ([b68c980](https://github.com/shawnphoffman/wish-lists/commit/b68c980b4e0b6453e98ecfd0114d9b85703158f9))
* **groups:** show connector pill between items in pick-one and ordered groups ([83dbdc4](https://github.com/shawnphoffman/wish-lists/commit/83dbdc482841d27fbcb282634cc2ee5a7d3fe89c))
* **list-addons:** off-list gifts CRUD with archive ([#4](https://github.com/shawnphoffman/wish-lists/issues/4)) ([7e38ed9](https://github.com/shawnphoffman/wish-lists/commit/7e38ed9512bbb7a2271a8c1d002484b822a261fd))
* **list-editors:** grant/revoke + V1 list_type migration ([#5](https://github.com/shawnphoffman/wish-lists/issues/5)) ([8fa6528](https://github.com/shawnphoffman/wish-lists/commit/8fa6528f7abe30853975fbe5b3f39f1485419ef3))
* **lists:** auto-open create dialog on /me#new hash ([bda6888](https://github.com/shawnphoffman/wish-lists/commit/bda688863098d03cd2e9e650358c497957fb9a83))
* **lists:** inline editor picker in settings sheet ([4fb2eda](https://github.com/shawnphoffman/wish-lists/commit/4fb2eda266976e4852dec2bc417c69a397944d53))
* **lists:** live unclaimed/total badge on home page ([65c0923](https://github.com/shawnphoffman/wish-lists/commit/65c0923ff5e8f7b78b91564bb233cd9436ebb88e))
* **lists:** move list settings + editors into right-side sheet ([c56fd23](https://github.com/shawnphoffman/wish-lists/commit/c56fd2303f8225356b3d21c0c42f2e90c8b5b226))
* Phase 1 + 1.5 - tooling, schema, local dev, admin recovery ([#1](https://github.com/shawnphoffman/wish-lists/issues/1)) ([9996c7b](https://github.com/shawnphoffman/wish-lists/commit/9996c7ba2e89b3258402a979176eebb490f8df2d))
* Phase 4 - comments, URL scraping, recent feeds ([#8](https://github.com/shawnphoffman/wish-lists/issues/8)) ([4abe54b](https://github.com/shawnphoffman/wish-lists/commit/4abe54bd55b1cff369cc426853727f701c657646))
* Phase 5 - child accounts, connections page, SSE real-time ([#9](https://github.com/shawnphoffman/wish-lists/issues/9)) ([87a1cfe](https://github.com/shawnphoffman/wish-lists/commit/87a1cfe6582d4c11fec3d844be17183d76aaa5e9))
* Phase 6 - birthday cron, received gifts, item import, polish ([#10](https://github.com/shawnphoffman/wish-lists/issues/10)) ([95456ae](https://github.com/shawnphoffman/wish-lists/commit/95456ae22a10d297d22e15c77b19498312e09486))
* **purchases:** timeframe filter, group-by-person, edit dialog ([45eb2d0](https://github.com/shawnphoffman/wish-lists/commit/45eb2d0ee82ebc4f53b2582181d9f9971fad71e6))
* **sidebar:** keep active nav icon colored on downstream pages ([4996803](https://github.com/shawnphoffman/wish-lists/commit/4996803db08ab7aa7dca36ddc45fa9ddac247fc1))
* **storybook:** add list item stories for recipient and buyer views ([d731be8](https://github.com/shawnphoffman/wish-lists/commit/d731be83a044022ee73b52a3093f5e48b017b0c9))


### Bug Fixes

* **db:** disambiguate users&lt;-&gt;lists relations ([b79f79c](https://github.com/shawnphoffman/wish-lists/commit/b79f79cd6534d7b0e81012929d23ba49fdd39918))
* **deploy:** heal prod Vercel rollout after V2 schema rewrite ([425ec19](https://github.com/shawnphoffman/wish-lists/commit/425ec19e41035e3d2c8b20f1b22b09a511e441e3))
* **tooltip:** use theme-aware popover colors ([3142f1a](https://github.com/shawnphoffman/wish-lists/commit/3142f1a53fac0403ab6b524275415df9a63d0ee3))
