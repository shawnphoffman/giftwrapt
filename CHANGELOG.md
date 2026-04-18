# Changelog

## [0.2.0](https://github.com/shawnphoffman/wish-lists/compare/group-wish-lists-open-v0.1.0...group-wish-lists-open-v0.2.0) (2026-04-18)


### Features

* **admin:** consolidate general settings, move test email to debug ([516869b](https://github.com/shawnphoffman/wish-lists/commit/516869b871b3e16bf29bd1b9a8e03e4661e2ffe8))
* **admin:** restructure settings into General + Scheduling, add comment toggles ([2008cf3](https://github.com/shawnphoffman/wish-lists/commit/2008cf3d63c524f2e026b4cb1f9642b8badb4f98))
* **docker:** polish self-hosted deployment ([#11](https://github.com/shawnphoffman/wish-lists/issues/11)) ([1ecf879](https://github.com/shawnphoffman/wish-lists/commit/1ecf8796153c425e08a26728429cd6e6c7266ec4))
* **gifts:** claim flow — create + read ([#2](https://github.com/shawnphoffman/wish-lists/issues/2)) ([00eb082](https://github.com/shawnphoffman/wish-lists/commit/00eb082f87b415b918ecc4ed915f3167c779e7d1))
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
* Phase 1 + 1.5 — tooling, schema, local dev, admin recovery ([#1](https://github.com/shawnphoffman/wish-lists/issues/1)) ([9996c7b](https://github.com/shawnphoffman/wish-lists/commit/9996c7ba2e89b3258402a979176eebb490f8df2d))
* Phase 4 — comments, URL scraping, recent feeds ([#8](https://github.com/shawnphoffman/wish-lists/issues/8)) ([4abe54b](https://github.com/shawnphoffman/wish-lists/commit/4abe54bd55b1cff369cc426853727f701c657646))
* Phase 5 — child accounts, connections page, SSE real-time ([#9](https://github.com/shawnphoffman/wish-lists/issues/9)) ([87a1cfe](https://github.com/shawnphoffman/wish-lists/commit/87a1cfe6582d4c11fec3d844be17183d76aaa5e9))
* Phase 6 — birthday cron, received gifts, item import, polish ([#10](https://github.com/shawnphoffman/wish-lists/issues/10)) ([95456ae](https://github.com/shawnphoffman/wish-lists/commit/95456ae22a10d297d22e15c77b19498312e09486))
* **purchases:** timeframe filter, group-by-person, edit dialog ([45eb2d0](https://github.com/shawnphoffman/wish-lists/commit/45eb2d0ee82ebc4f53b2582181d9f9971fad71e6))
* **sidebar:** keep active nav icon colored on downstream pages ([4996803](https://github.com/shawnphoffman/wish-lists/commit/4996803db08ab7aa7dca36ddc45fa9ddac247fc1))
* **storybook:** add list item stories for recipient and buyer views ([d731be8](https://github.com/shawnphoffman/wish-lists/commit/d731be83a044022ee73b52a3093f5e48b017b0c9))


### Bug Fixes

* **db:** disambiguate users&lt;-&gt;lists relations ([b79f79c](https://github.com/shawnphoffman/wish-lists/commit/b79f79cd6534d7b0e81012929d23ba49fdd39918))
* **deploy:** heal prod Vercel rollout after V2 schema rewrite ([425ec19](https://github.com/shawnphoffman/wish-lists/commit/425ec19e41035e3d2c8b20f1b22b09a511e441e3))
* **tooltip:** use theme-aware popover colors ([3142f1a](https://github.com/shawnphoffman/wish-lists/commit/3142f1a53fac0403ab6b524275415df9a63d0ee3))
