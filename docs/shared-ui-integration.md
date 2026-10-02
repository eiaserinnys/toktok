# Shared UI integration checkpoint

This is an unfinished integration checkpoint in `feat/public-demo-ui`, based on `df79fff5`. It preserves the existing observer while extracting a single renderer for product and isolated QA. It does not declare the new product UI, server authorization, storage backends, or deployment complete.

## Ownership and dependencies

C owns `public/shared/`, `public/effects/`, `public/admin-design/`, the existing public UI files, the standalone admin design guard and targeted tests. Root owns final HTTP/index/contracts/wrangler/package wiring. A owns typed control/auth/settings; B owns private runtime contracts/core. Their source files are read only here.

The product imports shared components/screens/dialogs/routes and never QA fixtures/controllers. QA imports the same implementations and a separate memory adapter with no HTTP fallback. The existing `view.js` is now a compatibility export rather than a second renderer. Room messages and sender names still use `textContent`.

Common room tokens match design `63c4eec3bc10b84c0a66d00ee9817f12643ba864` exactly. The board structure/layout and custom select come from that pin. The observer markup is preserved from the previous product checkpoint; the new authenticated navigation and complete auth/admin screens are still being integrated. This is not a claim that the old observer implements the final design IA.

## Server boundary to wire

`handleAdminDesign` claims `/admin/design/**` and `/api/admin/design/**` before Assets fallback. Missing/failed trusted authorization is 503; absent session/non-admin denial is 401/403. Its callback must wrap A's real session/DB-role `requireAdmin`. No query role or fixture role is accepted as authorization.

Root must preserve the final QA CSP after the common security wrapper. Required policy includes `connect-src 'none'`, `form-action 'none'`, `object-src 'none'`, `base-uri 'none'`, no-store and noindex. The current standalone guard returns those headers, but final HTTP dispatch remains root work.

Protected asset mapping is `/admin/design/_assets/admin-design/controller.js` to the same `public/admin-design/controller.js`; its relative shared imports map under `/admin/design/_assets/shared/` to the same actual `public/shared` files. Public `/shared/*` and `/effects/*` contain nonsecret product code. Do not expose `/admin-design/*` or fixture sources through public Assets fallback.

The validated first board slice uses `about:blank` iframes, then mounts the actual shared renderer in each document. It uses external CSS and CSSOM, with no srcdoc, inline script, unsafe-inline, live effect port or special frame-ancestor exception. Reparented iframe documents are remounted with their independent memory contexts. Top-level QA keeps `frame-ancestors 'none'`.

## Live DTO mapping

A's milestone input is its claim-foundation WT: `control-contracts.ts`, `settings-schema.ts`, `admin-http.ts`, `identity-http.ts`. Config mode/catalog/TTL/cadence and session role/entitlements are explicitly projected. CSRF stays in adapter memory and is excluded from the Session ViewModel. Admin schema `applyTo` metadata supplies field effects. Missing/malformed/denied HTTP responses become unavailable rather than fixture success. Retry-After is preserved without automatic resend.

Auth maps validation `invite_validation_id` to start `invitation_validation_id`, start `flow` to email-send `flow_id`, and complete uses `flow`. Actual replay is `AUTH_FLOW_USED`; mail limits use `EMAIL_RATE_LIMITED`. No readiness field, fixture role, room count, mock email, 30-day retention or seed value is supplied to production.

Root private contract `8989eb0e00eaaa50a618120e4fc23d510385ff0c` replaces the old creation payload. The adapter separates create-context, explicit risk confirmation/create-grants, and `/api/v1/rooms`. Stable client request IDs are supplied by the controller; it must not invent a new ID after an uncertain result. Creation responses contain one-time owner material which must never enter normal DOM, logs, fixtures or persistent browser storage.

B's exact `private-contracts.ts` at `1e5e156f89d7f2598d24ea791e08fe841cd4b1aa` was read without modification/cherry-pick. PrivateCreatorAck, RoomInit, Policy and BudgetPort are B's canonical types. Actual HTTP metadata/page and creation result DTOs are pending. The numeric legacy private cursor is still preserved; the new epoch cursor, history gap/reset, persist/retention/notice snapshot renderer is subsequent work.

## Evidence and limits

The local mock evidence directory is `.local/artifacts/toktok/20261003-shared-ui-44ae/`. No real credentials/accounts were used.

| Gate | Result | Scope |
| --- | --- | --- |
| Standalone admin guard | 6 passed | Callback denial, closed unwired routes, protected HTML/API/assets, headers, GET/HEAD only |
| Shared observer registry/coverage | 4 passed | Renderer identity, actual route resolution, memory isolation, missing/dangling negative controls |
| A live adapter | 5 passed | Mock HTTP DTO mapping, denied responses, CSRF memory; not real backend integration |
| New private adapter mapping | 1 passed, 5 skipped | Context/grant/new room payload only |
| Shared action board | 1 passed | Corrected test uses canonical contextual IDs from pinned layout; source contract only |
| Strict TypeScript | exit 0 | Current TS guard/tests; browser JS still needs its own runtime gates |
| First strict-CSP board browser slice | 1440 and 390 passed after one correction | Actual previews, CSP violations 0, mutation requests 0, camera/focus restore, custom select End/Enter, cleanup true |

The first board run observed scroll top 60 becoming 0 after closing enlargement. Raw `browser-raw.json` remains intact. Correction preserves focus without scrolling and restores camera after close; `browser-correction-raw.json` and two viewport PNGs record the corrected run. No initial full design gates were repeated.

Original design QA has 141 mock PNGs and separate raw files under `.local/artifacts/toktok/20261003-0718-design-63c4eec3/`. QA-01 undefined gallery copy, QA-02 identical conflict snapshots, QA-03 auth cancel origin, QA-04 mobile gallery font shrink, and QA-05 reference/error wording remain unresolved pending the corrected design pin. No affected-dialog final visual pass is claimed.

The current board catalog is only the first four observer previews/three navigation edges. Full auth/admin/new-private states, real role/mode coverage, dialogue gallery navigation, node detail/keyboard edge navigation, admin server/API/assets integration, CI/package wiring, final corrected-pin visuals, SQLite/Postgres runtime and operational deployment are not complete. Components/dialogue controller surfaces are scaffolding and are not approved final layouts. Root must not treat this checkpoint as finished UI integration.
