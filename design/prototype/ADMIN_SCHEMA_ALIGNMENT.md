# Common room: schema-shaped admin patterns

Contract inspected: `feat/claim-foundation@52e3a5dc81edb1b882798532f6d340397e7ce0fd`, `src/settings-schema.ts` and `src/private-contracts.ts`.

This is a bounded visual and interaction handoff for the production UI implementer. It does not change server policy, authentication, infrastructure configuration, or live settings. `schema-patterns.js` exports the renderers and a fixture-only controller. The controller performs no network requests. C should reuse the renderers with its existing authenticated settings API, version checks, and server schema rather than shipping the fixture controller as operational settings.

## Entry points and scope

- `?fixture=admin#admin/design-settings-public`: catalog cards, enabled/total count, add/remove and empty state
- `?fixture=admin#admin/design-settings-budget`: monetary thresholds and six fixed workload rows
- `?fixture=admin#admin/design-settings-policies`: nested public/private policy groups
- `#admin/design-dialogs`: the same three schema review/conflict/dirty dialogue renderers appear after the original ten dialogues
- `#admin/design-flows`: registered action-depth nodes show actual shared screens, including added, edited, invalid, review, conflict and saved fixtures

These views sit under administrator-only Design review → Settings structure. Links also appear on the older Public/Budget/Memory prototype sections. The old flat settings model is retained as a historical interaction demo. Its broader illustrative bounds and room-count scalar must not be used as production configuration. This handoff intentionally does not rewrite that model or change its authentication/room simulation. Production mounts the exported schema-aware renderers directly in the real Public/Budget/Policy sections, with no extra consumer-facing settings workbench.

## Visual contract

Reuse `styles.css`, `experience.css`, and `schema-patterns.css` in that order. Keep the established ivory surfaces, bottle-green type, lime selected state, 12–18px radii and existing buttons/dialogue shell. Main inputs use 14px on desktop and 16px on phones; help and bounds remain at least 12px. Touch controls remain at least 44px high.

Catalog cards have an ordinal and enabled switch, then title/path fields, then a path preview and “목록에서 빼기”. Desktop fields share a row; mobile fields stack. Derive both enabled and configured counts from the array. At ten rows disable Add and retain a visible maximum. Zero rows is valid. Removing a row edits the draft; do not claim it immediately deletes a live room or its messages. Stable local row IDs preserve focus while slugs and positions change.

Workload limits use six fixed rows. Desktop columns are workload label/unit, daily cap, monthly cap. Mobile rows become cards with fully labeled controls. Kind/unit are read-only text; no add/remove action. Display native units, not unannounced byte/time conversions. The six kinds are admission_requests, response_bytes, private_creates, active_room_seconds, persistent_write_bytes, and email_attempts. Per-kind ceilings are the server defaults, not the generic schema maximum for every row. Day must not exceed month.

Monetary thresholds are USD50 warning, USD70 cutoff and USD100 target in the inspected baseline. They are amounts, not percentages. The relation is warning ≤ cutoff ≤ target. Workload reservation limits and monetary planning are distinct; neither promises a provider billing hard stop. UTC counters are not the provider billing calendar.

Nested policy sections are disclosure groups with shared numeric rows. Each row shows label, exact field path, unit, min/max and applyTo. Public policies apply at runtime; private policies freeze into new-room snapshots. Fixed responseBytes=65536 renders disabled with a visible safety-limit explanation. In production, populate the descriptors from the returned schema metadata and use server validation as authoritative. Unknown or malformed loaded values must remain an explicit error, not be silently replaced with defaults.

## Reusable code contract

Exports: `renderCatalog(model)`, `renderBudget(model)`, `renderCaps(model)`, `renderPolicies(model)`, `renderReview(model)`, `renderConflict(model)`, `renderDirty(model)`, `renderChanges(changes)`, and `createModel(data, revision)` for isolated fixtures. `policyMetadata(scope)` records the inspected reference metadata; C should supply its actual current schema descriptors when mounting the pattern.

The fixture model deep-clones saved/draft/server/reviewed values. It preserves raw number input while editing, rejects blanks, fractions, unsafe integers, cross-field contradictions, duplicate slugs, missing/duplicate kinds and wrong units. Restoring original values clears dirty state. Review captures an immutable payload plus base revision. Conflict preserves the draft and displays actual differences; loading latest requires a separate discard confirmation. Save failure and role loss preserve the draft. User-controlled catalog strings are escaped in fields, review and conflict summaries.

The real host must own admin authorization at render and mutation time, Origin/CSRF checks, API load/save, asynchronous saving lock, revision conflict, audit, runtime application and permission-loss redirects. A fixture role or direct review URL never grants administrator authority. For a save, pass only the reviewed snapshot and its base revision, then replace the local saved snapshot with the server response. Do not silently lower or raise limits in the client.

Apply-to notices belong beside every field and inside the review, not only a section-level summary. Preserve current participants when reducing capacity; block new admission according to server policy. Preserve counters when reducing workload caps. No live-message deletion, database reset, or bootstrap/credential operation belongs in this form.

## Verification and targeted browser handoff

`node tests/schema-patterns-regression.cjs` covers 22 pure source/model checks. Existing route/registry, auth, admin, dialogue, selector and canvas suites remain separate. Those checks do not establish actual browser geometry, native dialogue behavior or production API enforcement.

Capture at 390×844 and 1440×1000: the three views, empty/max catalog, 64-character title/slug, duplicate slug errors, large byte caps, blank/unsafe numeric error, locked units/response cap, reviewed save, failure, dirty cancel/Back, and version conflict. Verify field focus after add/remove/error, keyboard access to disclosure groups, no horizontal overflow, and unchanged product/dialogue typography. New glyphs are included in the bundled font subsets. Actual screenshots for this patch remain pending at handoff.

Suggested isolated fixtures: `schema-catalog-added`, `schema-catalog-edited`, `schema-catalog-empty`, `schema-catalog-invalid`, `schema-catalog-review`, `schema-catalog-conflict`, `schema-catalog-saved`; each uses the same Public catalog screen with an isolated administrator fixture. No email, actual invitation or real room is created.
