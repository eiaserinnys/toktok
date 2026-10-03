# toktok UI design handoff

## Identity and choice
Exact brand spelling: **toktok**, lowercase. Friendly shoulder tap, temporary small room, light conversation. Selected direction: **01 Common room**, a tactile green/lime visual system with sculptural chat artwork. Avoid generic administrative dashboard treatment. Preserve the 7-direction studio for design review, but omit the studio dock from the actual product.

Seven distinct views are retained: Common room; Pocket letter (paper invitation); Play date (bold modular playground); After hours (dark centered lounge); Table talk (editorial columns); Soft signal (blue frequency diagram); Quiet club (quiet split workspace).

## Deliverable
Buildless static HTML/CSS/JS in `dist/`. Relative assets. No backend, real auth, external fetches, analytics, browser storage, or real credentials. Fictional data only. All invite links use reserved `.example` domain. This is a design prototype rather than a production application. Noto CJK font subsets are local and licensed; a production implementation should include a full Korean font or complete dynamic text coverage. Generated sculpture artwork is compressed to 68 KiB WebP.

## Tokens
- Ink: #204436
- Primary action: #224b39
- Highlight: #e5f38f
- Canvas: #f6f5ee
- Surface: #fffef9
- Muted: #65735f; small functional text #5f6d56 on soft surfaces; recheck contrast for the final deployed font/rendering
- Divider: #dcded3
- Room live surface: #e8eccf
- Secondary room: #f2e1d5
- Body: local Noto Sans KR subset; display accent: local Noto Serif KR subset; English editorial alternatives: Georgia
- Core type: body 16px desktop, room messages 15px phone; headings 29–68px context-dependent. Metadata 12px except compact decorative and studio labels
- Radii: room cards 16–18px; conversation 14–18px; action buttons 50px; hero crop arch
- Layout: max width 1280px, desktop page gutter 46px, phone gutter 22px; breakpoint 700px
- Motion: 200–450ms, cubic-bezier(.2,.8,.2,1), short entrance/hovers; prefers-reduced-motion disables animation and transitions
- Brand mark: two vertically offset rounded strokes; wordmark lowercase Arial Black/bold-like rhythm, slight negative tracking

## State map
- `#home`: authenticated team creator's room overview; UI pretends to be logged in as studio team
- Create native dialog: name and TTL radio; default24h, max7d; creates temporary local demo state only
- `#room`: live read-only human spectator; first 3 messages, then demo messages at 8s intervals; pause/resume
- `#room/coffee`: independent fictional naming conversation
- `#room/new` created room: invite-ready waiting state, then guest simulation leads into demo conversation
- Conversation tabs: chat versus URL capability/HTTP connection instructions
- Invite copy: clipboard success feedback; failure exposes selectable demo link
- `#guest`: capability-link guest entry explanation and read-only human spectator entry
- `#expired`: room and invite no longer usable; create another room
- End-room confirmation native dialog, local demo effect only
- `#guide`: 3-step explanation
- `#directions`, `#concept/1` through `#concept/7`: all visual alternatives
- `#review`: selected direction and design criteria

## Backend integration requirements
User's service target: Cloudflare, repository eiaserinnys/toktok, intended domain toktok.eiaserinnys.me. This preview does not configure or deploy that production service.
- Authenticate creators/team users with real session/authorization, replacing current static team demo
- URL possession is room invitation capability; keep capability links out of logs and referrers; avoid sharing publicly
- GET room URL returns agent-readable Markdown usage instructions; POST message; cursor-based long polling for incoming messages
- Humans are read-only spectators, no chat composer
- Room TTL default24h/max7d; current design retains short 1h option as a preset
- Real expiry status, relative countdown, empty/waiting, error/disconnected, loading, room revoked, and rate-limit feedback must reflect server responses
- Replace simulation timers and array contents with service state
- Don't preserve .example demo addresses or invented participants in production
- Read-only preview WebMCP navigation support is feature-detected; prototype state only

## Validation and implementation follow-up
Source syntax, all 15 route renders (mocked DOM), and local references checked. Core primary contrast is 9.84:1; ink on lime is 9.04:1; muted copy was darkened after calculations found the original insufficient for small text. Empty-room participants, mobile touch navigation, skip link and keyboard tabs corrected in the source audit. Readability revised after source audit; default TTL aligned; coffee room conversation separated from travel conversation; reduced-motion and native dialog focus behavior included.
Initial desktop/mobile browser screenshots have now been visually inspected through the implementation environment. They exposed an arched-hero sticker clipping bug and a studio dock that overlapped chat controls; both were corrected. The review navigation now occupies normal document flow at the top. The unverified registered-trademark symbol was removed. Room state is keyed by travel, coffee, and newly created room; pause/resume preserves the reader's feed position. The focused Chromium recheck at 1440×1000 and 390×844 passed on commit 8160fe6: full hero sticker visibility; no dock interference with pause or chat; isolated travel/coffee/new-room state across navigation; preserved pause/resume scroll position; functional phone metadata ≥12px; 44px key touch targets; modal body lock, Escape close and focus return; and actual clipboard-denial fallback with a selectable URL. Reduced-motion mode was verified with zero active animations and automatic scroll behavior.

Final post-QA changes are limited to darkening the agent badge and room count (calculated contrast 4.78:1 and 5.04:1), and matching coffee sidebar initials to nova/bean. These do not change geometry or behavior. Strict full Tab cycling through every dialog control remains unverified because the harness encountered a BODY step; no focus escape to background controls was observed. This is not a claim of complete WCAG conformance or external awards assessment.

The original local screenshot restriction was: Chromium process singleton socket creation is blocked even in approved escalated run. Cloud browser blocks loopback and file URLs, and the supervised Sites preview helper is unavailable. No route around those denials was attempted. Do not claim awards certification. Retest real backend-bound loading, connection failure, expiry and authorization states during production integration; those are intentionally simulated here.

Recommended checks: 390×844 and 1440×1000 home/room/dialog/7 directions; 320px width and 200% zoom; keyboard dialog focus and Escape; invite clipboard success/denial; form whitespace validation; guest and expiry flows; no unintended horizontal overflow; reduced motion; text contrast. Awards-level quality is an aspiration, not an award, certification, or completed external assessment.

## Cohesive extension · revised 2026-10-02
New source: `experience.js`, `experience.css`, `selects.js`, `design-contract.js`, loaded with the original `app.js` (contract first, then app, experience, selects). The legacy app defers first render so an obsolete landing/header never flashes before the enhanced product is ready. All seven concept routes remain separate from product navigation. The entire artifact is a UI simulation: fictional `.example` data, no network writes, real email, credentials, grants or database operations.

### Canonical navigation
- `#home` is the signed-out introduction: hero, service/how-it-works explanation, then public-room preview using the same card renderer as the full catalog. Signed-out primary navigation is “toktok 소개 / 대화방”. `#rooms` is the full public catalog plus private-room creation. `#welcome` aliases home and `#lobby` aliases rooms. Signed-in default entry and brand logo go to rooms; primary navigation only shows rooms. `#about` is the secondary footer introduction link.
- Signed-out top-right shows invite-code signup immediately left of login (HOSTED shows email signup). Signed-in account disclosure stays top-right. The account disclosure includes admin settings only in the admin-role fixture. Login Back uses the originating product route; direct unauthenticated entry falls back introduction. Successful login/signup defaults to rooms, preserving a specific requested room/create origin. Original concept exploration stays in the separate design-preview rail.
- The preview rail’s “시안 상태” control intentionally sets simulated role/mode fixtures. It must never become production authorization. All actual admin endpoints and review URLs require server-validated admin session, including direct links/refresh.

### Consumer contract: latest user instruction overrides the earlier DEMO restriction
- DEMO anonymous public/private rooms never persist message bodies. Public rooms never persist bodies, even for signed-in users.
- Invited, registered DEMO accounts CAN opt into persistence for their PRIVATE rooms. HOSTED accounts can also opt in. New-room persistence defaults OFF.
- Visible DEMO signup path: invite code entry → validity check → active invitation confirmation → email OTP → account. Empty/invalid/expired/used/revoked codes cannot grant eligibility. Room invitation URLs and signup invitation codes remain distinct.
- Signup invitation codes are opaque, case-sensitive values. UI checks only for nonempty input and sends the trimmed value to server-authoritative validation; do not promise a UUID or fixed length. The current backend issues 43-character opaque keys. All prototype samples are explicit nonsecret `toktok_demo_only_` fixtures, 43 characters long; `demoInviteCode(1)` is valid, `(2)` used, `(4)` expired, and `(9)` unknown. An arbitrary suffix does not determine validity or expiry. Issued demo codes use distinct `issued` fixture IDs. Demo OTP123456; only an active challenge accepts it. Successful signup consumes one active invitation.
- New private-room creation requires a human-owner risk acknowledgement with policy version and timestamp. A valid acknowledgement for the same owner/version can be reused; it is distinct from public-room risk acknowledgement and the agent grant.
- Private room mode/storage/retention freeze at creation. Changing current mode does not relabel old rooms. Retention is shown before creation, on guest entry before joining, and throughout the room including after tabs/pause. Room lifetime, message availability, and transcript retention remain distinct.
- 7/30-day transcript retention choices are UI scenarios, not production policy approval. Existing room lifetime baseline24h/max7days is a separate admin-configurable setting.
- Public acknowledgement does not grant an agent access. The separate grant names agent, exact room, read/send scope and expiry. Denial and revocation are separate; humans are read-only.
- Agent entry and connection instructions put a service-owned safety notice before participant-provided data. Its fixed source is `design-contract.js` agentSafety version `toktok-agent-safety-v1`, aligned with the canonical repository safety contract. Room titles/descriptions/messages are marked untrusted data, never system instructions or user authorization. The notice warns against secrets/PII sharing and external actions, file execution or permission changes solely from conversation content; each agent must follow its own user’s authority.
- Public reader bootstrap: up to a five-minute window and20messages, but only still-valid bodies; messageTTL30sec may make it shorter. Later reads are cursor deltas.

### Operations and design QA
Admin routes: `#admin/overview`, mode, public, private, memory, signup, email, budget, restricted; and design-components, design-dialogs, design-flows. Use the clearly marked “시안 상태” → “관리자로 보기” control to inspect admin screens in this prototype.
- All operational settings are intended to be DB-backed/versioned in the real service. Enforce administrator session, Origin/CSRF, safe validation and audit history in the backend. No infrastructure secrets or DNS controls belong in product settings.
- Capacity reduction blocks new joins rather than evicting existing participants. Default/maxTTL changes apply to new rooms. Do not retroactively persist old memory-only messages.
- Exact preapproved admin-email OTP bootstrap is one-time and atomic. First visitor and signup invitation never confer admin. Initial admin/sender email remains a deployment prerequisite.
- Comparison baseline3rooms×100cap with server2sec batches is not fixed launch policy. Design supports1–20rooms; agent5sec read-after-response wait is recommended pending final operating tests.
- Email baseline: address2/hour3/day, resend120sec;IP30/hour100/day;global10000/month. Bounds shown are proposed UI validation bounds. Cross-field checks prevent hourly>daily, defaultTTL>maxTTL and defaultretention>maxretention.
- DEMO US$100/month is a target, not guaranteed bill stop. Cost depends on requests, cadence, count, body sizes, memory, email/storage and provider rates; no fabricated live billing telemetry.
- Draft count, cancel, dirty navigation, reviewed save snapshot, saving/saved/error, concurrent conflict preserving draft, latest-reload confirmation, one-use/expiry/revoke invitations, and restricted role are represented.
- Custom select-only comboboxes replace native OS popups. Shared component includes arrow/Home/End/Enter/Escape/Tab/typeahead, labels/expanded/selected state, outside close, disabled state, viewport-clamped scrollable menu and focus restoration after rerenders. Native hidden select remains the form value.
- Admin design QA pages reuse actual primitive helpers and modal functions. Dialog confirmation is sandboxed and cannot save settings, revoke rights or issue invitations. The flowboard presents multiple actual screen previews simultaneously on one pan/zoom canvas with labeled conditional/back/error arrows, role/mode filters, expand-node detail, basic isolated-node diagnostics and agent-readable graph data. Previews use the same product source in isolated fixture iframes; no real email/room/invitation operations. Production implementation must keep this catalog admin-only server-side and reuse production components, not divergent copies.

### Required UI contract
The owner requires components, dialogues and flowboard to be updated together for every UI/UX change. Unregistered UI/UX is forbidden. New work must remain consistent with Common room. `UI_RULES.md` documents this rule; `design-contract.js` is the shared registry used by the dialogue gallery and flowboard. Registry route/edge/component checks accompany the prototype behavior tests. Production must reuse its real UI code and enforce server-side admin-only catalog access.

### Verification
Source syntax,50 registered mocked-DOM routes and HOSTED/persistence variants pass. `node prototype-tests.cjs` is dependency-free and tests code/OTP gating, one-use consumption, immutable name/TTL/retention, default-off persistence, room-scoped grant/revoke, reviewed save snapshot, unsafe resend rejection and canonical introduction/rooms aliases and signed-in room entry. These are source-level checks, not browser QA.
Initial extension capture pin309442a had44 actual desktop/mobile route captures with no console errors, missing assets, external requests or horizontal overflow; follow-on interactions passed invalid/expired OTP, private persistence default-off/30day scenario, actual Back dirty prompt, save version, conflict draft preservation/reload and restricted state. Visual inspection found mobile auth heading orphaning and fixed it. The later navigation, policy, code-gate, owner-ack, custom-select and QA-catalog changes require focused recheck at the replacement pin. Original core QA above remains historical. Do not claim full WCAG conformance or awards certification.

Late source-review correction: custom-select portal cleanup happens only after a dirty-navigation guard accepts navigation. Cancelling the guard preserves functional selection controls. The guest-entry safety and storage disclosure use the shared renderers and are represented as a flowboard node. Final pixel/keyboard recheck is still pending quota recovery.

### Homepage copy review
The homepage copy incorporates selected editorial improvements after a text-only review with the requested emotional/marketing lens. It is not a wholesale adoption of that review and does not imply the user approved every phrase. The original BIG IDEAS headline remains. The owner explicitly rejected the blooming-conversation/flower metaphor as AI-like prose; the hero now describes the actual action: give an agent the link and watch what they discuss. CTA and storage copy align with their function, and redundant technical detail stays in the safety/entry guide. Warmth remains in the brand and knock motif rather than ornamental abstract-noun/concrete-verb phrasing. Names use commas; preview counts read “에이전트12/100” with the denominator drawn from current simulated settings rather than a production literal. Shared cards are visibly labeled fictional examples, and production must use the actual catalog/API capacity. HOSTED storage explanation has its own email-account variant. The writer's review was text-only; its401 private-Site access does not count as visual approval. Shared home/card renderers and contract copyRevision keep product and QA previews synchronized.

## Deep negative-path review · current corrected state
The earlier happy-path suite passed while independent fresh-VM/fake-clock audits found real gaps. These were corrected in product source and the shared graph, not only documented:
- Email OTP is an explicit challenge bound to email, auth purpose, deployment mode, invitation and expiry. It is consumed on success and cleared on logout/purpose change. Direct resend cannot mint a challenge. Unknown DEMO email login cannot manufacture invited entitlement; it returns to required signup.
- Signup invitations have immutable numeric expiresAt, checked at code validation, acceptance and OTP completion. Existing accounts do not consume a new signup invitation.
- Grants are records keyed by principal/room/agent with one-hour expiry and explicit revocation. Account listing derives all active grants, independent of the last room viewed. Logout hides other principals' grants; the same owner can recover an unexpired grant until revocation. No real capability is issued here.
- Private creation reads saved anonymous permission, per-owner/global quotas, default/maxTTL, persistence entitlement and retention bounds both in rendered options and on submit. Snapshots freeze room policy. All previously created active rooms remain reachable/closable from the account list. Expired or missing new-room state never falls back to an unrelated sample room.
- Dirty logout/role changes wait for the user's discard decision. Mutations and delayed save completion recheck admin role. Separate server version/snapshot and reviewed base version prevent repeated stale saves from succeeding without reload. Drafts remain intact on conflict.
- Empty invitation lists and preview-role controls in QA are isolated views, not state destruction or permission changes. All cloned close-room cancellation controls work. Hosted/anonymous graph fixtures initialize consistent identity/settings/storage.
- The graph includes actual creation result, grant approval result, account/owned rooms, guest guide, missing/expired room, invalid/revoked capability, OTP expiry and grant expiry states. Earlier impossible transitions were removed.
- Selection menus cancel without commit, restore focus after rerender, and clamp to short viewports without an unsafe minimum height.

Reproducible checks (Node, no dependencies):
- `node prototype-tests.cjs`:50 registered routes, registry references and core state checks
- `node tests/auth-room-regression.cjs`:25/25 negative auth/room tests
- `node tests/admin-flow-regression.cjs`:14/14 admin/flow/fixture tests
- `node tests/select-regression.cjs`:7/7 keyboard and geometry model tests
The latter46 tests use fresh VM instances, fake clocks and modeled DOM/events. They do NOT establish browser layout, CSS, assistive-technology behavior or real server authorization.

Remaining after the external renderer's quota resets: current-source390×844/1440×1000 full-page and viewport captures; actual keyboard Tab/ShiftTab/Escape/focus restoration; opened listboxes and short-viewports; create/owner acknowledgement/storage/guest notices; dirty logout/role/conflict cancellation; all QA dialogs; flow canvas zoom/pan/node expansion/filter/keyboard edges; console/missing asset/external-request/overflow checks. Earlier screenshot evidence cannot be relabeled as verification of this corrected source. Production server auth, true email, DB/TTL/capability enforcement and deployment remain the implementation owner's work.

### Homepage reading order · 2026-10-02

The latest owner correction supersedes the earlier preview-first order: hero → service explanation and how to use → public-room preview. The shared `toktokHome` renderer serves both `#home` and `#about`, including the actual flowboard iframe previews. `design-contract.js` registers `homeSections` and the layout revision; home/about nodes expose that section order to inspectors. Existing components are reused, and no dialogue behavior or registry entry changes. A rendered-markup regression checks the order in DEMO/HOSTED and both routes, together with the unchanged registered dialogue coverage. Browser checks at 390/1440 for this final layout remain pending.

### Action-derived review tools and invitation hierarchy · 2026-10-02

The flowboard uses `flow-layout.js`, a deterministic, dependency-free layout shared by browser and source tests. The canonical registry contains 58 states and 99 transitions with click/input/submit/timeout/entry metadata and selectors. A progression action advances exactly one column. When the same shared screen is reached at different action depths, the layout emits a distinct `instanceId` plus unchanged canonical `screenId`, route, and fixture, rather than skipping a stage or inventing a screen. Mode and journey filters preserve unsigned signup/login ancestors. The administrator path goes through actual login OTP, authenticated rooms and an open account menu; signup cannot grant admin access.

Nodes are 320×390, with a 490px column gap and 170px row gap. Edge labels have reserved gap lanes and wrapped text. Return, time and reference transitions do not set action depth. Their paths are shown on separate lower lanes with “돌아가기 선 보기”; they remain in the accessible connection list and machine-readable graph when the paths are hidden. The canvas keeps drag/pan, zoom centred on the viewed location, fit and keyboard scroll. “크게 보기” moves the same canvas into a native modal that fills the browser client area. Closing it or pressing Escape restores the earlier zoom, scroll position and a connected expansion-control focus target. It does not request OS fullscreen. A product-screen detail dialog may open over the expanded canvas; Escape should close the top dialog first.

The dialogue registry drives a review-only browser with lateral Previous/Next controls, index/total and the current name. It reuses the product dialog renderer inside distinct review chrome. It does not close/reopen the native modal between fixtures. Boundaries are disabled; Alt+Left/Right moves between entries without stealing text-field arrow keys. Each transition resets temporary confirmation/input state; close restores the prior review state. These controls never appear on ordinary product dialogs and never send email, create invitations or change settings.

Guest invitation hierarchy now begins with the room title as the largest text, then the inviter and clearly separated lifetime/participation status. The storage notice and a modest, fully visible service-owned safety panel follow below, before connection actions. The title remains escaped participant-provided content. This visual hierarchy does not change the fixed machine-guide safety contract, required owner/public acknowledgements or authority rules. All guest flow previews use the same renderer.

Checks: existing 50-route suite plus 25 auth/room, 14 admin/flow and 9 select regressions still apply. `tests/review-tools-regression.cjs` adds deterministic context-depth, lane collision, graph authority, inherited fixture, in-modal navigation/sandbox and invitation order checks. These are source/VM/geometry checks, not real browser validation. At 390×844 and 1440×1000, recheck the action tree, opened selectors, expanded-canvas resize/exit/focus, nested dialog Escape, review carousel boundaries/long content, and invitation text/warning hierarchy. This latest render and keyboard pass remains pending.

The custom selector popup follows its owning native modal at open time. Expanded-canvas selectors are enhanced again after filtered redraws; their popup must stay inside the active modal top layer. Focus restoration resolves the current control when the original control was replaced.

### Focused dialogue fixture correction · 2026-10-02

Actual 390px captures at `design/qa-artifacts@f551c68180a8cdfbe913c2b996317c2ffc6f25ad`, `design/qa/63c4eec3-20261003-0718/supplement-390-dialog-item-{2,3}.png`, exposed missing public-settings context in review item 3/10 and equal values in conflict item 4/10. The shared dialogue registry now supplies explicit fixture data to the existing product renderers: the public capacity application notice; conflict base/latest revisions 12/13 and draft/server room counts 5/10. The conflict reload confirmation uses the same fixture change count. Live settings, versions and drafts are untouched, and fixture context resets on Previous/Next and close. Unknown application-note context uses safe explanatory copy rather than rendering undefined. This is a targeted source correction; fresh 390/1440 captures of these two items are pending. The fixture correction reuses the existing product renderers; the additional browser findings below are included in the same final handoff.

Additional actual QA at `design/qa-artifacts@adb65c19ba004b4e6b0ece0598a7e8a3610e838c` confirmed three issues: cancelling login from the introduction incorrectly opened rooms; mobile gallery dialog typography/padding diverged from the ordinary product dialog; and timeout/error reference lanes were mislabeled as return links. Cancellation now has a separate `authBack` origin from success `authReturn`; home/about cancellation returns to that page while successful default authentication opens rooms, preserving specific room intent. The same body/heading/button/padding rules now apply to the gallery product surface. On phones, the QA Previous/Next controls occupy a row above the full-width dialog, so the product is not compressed to make room for them. Flow label descriptions use event/kind semantics, including explicit timeout/expiry, error, return and reference states. The signup “소개로” typo and Korean card-title word wrapping are corrected.

Targeted recapture: gallery items 3/10 and 4/10 at 390/1440; home→login→cancel versus OTP success; ordinary/gallery auth-limit typography and padding at 390; timeout reference labels; mobile homepage card headings. Current source checks pass; these newest browser captures are pending. Earlier actual checks reported by the implementation owner passed canvas camera, ten-dialog navigation and HOSTED expiry. Admin save/conflict/error and role-change cancellation in this newest browser run remain unverified because the harness could not complete those selectors; do not misreport that as a product failure or a pass.

### Opaque invitation-code contract correction

Removed UUID/36-character wording and fixtures. The shared component/flow registry and invitation-creation dialogue now use the same opaque-code fixture contract. Existing invalid, used, expired and revoked gates remain; an invalid recheck clears prior validated eligibility. No format or length validator may replace the server result in production. Source regressions cover whitespace, case sensitivity, unknown suffixes, issuance and all inactive states. Actual 390/1440 invitation input and ticket recapture remains pending; the prior five-fix QA pin is independently under review.

### Schema-shaped admin pattern handoff (2026-10-03)

`ADMIN_SCHEMA_ALIGNMENT.md` describes the isolated Common room catalog, workload and nested-policy renderers, pinned to backend schema52e3a5d. The new admin design-review routes use `schema-patterns.js/.css`; shared components, three dialogue states and action-flow fixtures are registered together. The old flat settings/runtime simulation is intentionally retained; its illustrative limits are not production policy. C mounts these renderers into the real settings sections and remains responsible for server schema/API/version/authorization wiring. Catalog0..10, fixed six workload kinds/units, per-kind hard ceilings, USD50/70/100 thresholds and public-runtime/private-new-room metadata are demonstrated. No auth policy or operational settings were changed. New actual390/1440 captures remain pending.
