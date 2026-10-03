# New-room and about alias validation

The product `/new-room` mount uses actual Session/Config and the explicit context → fresh risk acknowledgement → creation grant → `/api/v1/rooms` effect sequence. Loading the page does not create a room. Both modes start with persistence OFF; anonymous rooms remain memory-only. Authenticated persistence requires current server context permission and retention no longer than the selected actual TTL. Purpose uses the existing Unicode 1000-character contract. Missing backend fields remain unavailable.

The immutable pending request retains its client request ID, grant and payload on explicit retry. CREATE_PENDING preserves room ID and Retry-After; CREATE_RESULT_NOT_RECOVERABLE stops retry and explains that first-response owner material cannot be recovered. Owner material stays in a closure until disposal and is never rendered or stored. Invite/read URLs are distinct, validated against returned room ID and origin, and do not replace owner authority. The approved risk-check component is shared by claim/new-room and registered in product/QA.

`/about` is an explicit alias of the introduction route, with matching registry metadata and fixture coverage. It uses the same renderer and catalog effect rather than relying on fallback. No root HTML dispatch, API, credentials, production settings or deployment was changed.

## Fresh evidence and limits

- Initial new-room targeted tests: missing-module RED followed by 3 passed. The later unsafe-share-URL/retention-snapshot test passed once with unrelated cases skipped. Registry alias/state negative coverage passed once. Independent read-only supplemental review found no remaining major blocker; it did not rerun browser tests.
- Evidence directory: `.local/artifacts/toktok/20261003-newroom-product-44ae/`. The original `raw.json` preserves one pending/lost pass and four harness failures. The anonymous mock fixture initially disallowed anonymous creation; authenticated cases initially waited for the hidden native select instead of the approved visible custom select. These are recorded separately from product behavior.
- `correction-raw.json` preserves all four corrected 390/1440 creation observations before assertion: one mock creation POST, explicit acknowledgement, default OFF and explicit authenticated persistence, bounded TTL/retention, returned memory/persisted state, safe share links, owner DOM/storage absence, no horizontal overflow, and no CSP/page errors. The four cases still have final FAIL status because the subsequent clipboard permission assertion expected denied while the measured state was prompt.
- Before that assertion, actual clipboard write failure guidance, focus and read URL selection were recorded. The later owner clipboard-denial branch was not reached. These four cases are not full browser passes and do not prove clipboard permissions. No additional execution or permission forcing was performed after the approved attempt limit.
- Both original files remain unchanged. Runs recorded cleanup true and used fictional mock data only. The mock initial/created PNGs were visually inspected; real room capabilities, accounts and credentials were not captured. The source checkbox style extraction has not been declared a new final visual pass.

The historical successful harness supplied the browser context ID to Browser.setPermission as well as both clipboard-write descriptors. The new-room harness used the descriptors but omitted that context ID. This is an offline explanation, not a fresh successful clipboard result.

## Remaining work

Root's actual backend creation/account/claim slice is separate evidence. This checkpoint is not a live HTTP, final UI, billing, deployment or complete DEMO/HOSTED approval. Private observer epoch cursor/history gap/reset and retention snapshot wiring, `/admin/invitations` and `/admin/audit`, read-only recovery usage and remaining gallery/flow coverage still follow. The two new admin routes must stay outside the fixed settings recovery exception inventory. README remains user documentation; this internal evidence is kept here.
