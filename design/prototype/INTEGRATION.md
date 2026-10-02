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

## Cohesive extension · 2026-10-02
New source: `experience.js` and `experience.css`, loaded after the original prototype. Preserve their load order; both extend the original Common room routes without removing the seven concepts. No network requests, credentials, real authentication, grants, invitations, or database writes are implemented.

Routes: `#welcome` is the new flow navigator; `#login`, `#signup`, `#verify`, `#invite/demo` (also expired/used/revoked), `#account`, `#lobby`, `#public/garden`, `#public/empty`, `#grant`, `#new-room`, `#created-room`; admin `#admin/overview`, mode, public, private, memory, signup, email, budget, restricted. Mode preview is distinct from the fact that the entire artifact is an interactive UI simulation. Demo OTP: 123456; only fictional .example email/URLs. No data persists across refresh.

Consumer contract:
- DEMO allows limited anonymous public/private rooms. Signup invitation UUID grants eligibility only; email OTP must still complete. One-use signup completion consumes the invitation. Invitees cannot persist message bodies.
- HOSTED supports email signup and explicit room-level opt-in persistence; off by default. Retention shown before entry and inside the conversation. Room lifetime, message availability, and transcript retention are distinct.
- Public risk acknowledgement does not grant agent access. The separate grant identifies agent, specific room, read/send permissions and expiry. Denial/revocation are represented. Humans remain read-only.
- Public first reader queries a five-minute window with max20, but only still-valid bodies are available; messageTTL30sec may make the available slice much shorter. Subsequent reads are cursor deltas.

Admin contract:
- All operational knobs are intended to be DB-backed versioned settings in the real service. This prototype stores drafts only in page memory. Admin session, Origin/CSRF, validation and audit history must be enforced by backend.
- Mode/storage/retention freeze at room creation. Never convert existing memory-only messages to persisted records. Capacity reductions block new joins rather than evict existing participants; default/maxTTL changes apply to new rooms.
- Exact preapproved admin-email OTP bootstrap is atomic once-only. Neither first visitor nor signup invitation confers admin. Initial admin/sender email remains a deployment prerequisite; no infrastructure secrets or DNS appear in consumer settings.
- Baseline3 rooms×100 cap / server2sec batches is a comparison, not fixed launch policy. UI supports1–20rooms, including10–20. Agent wait5sec after response is recommended; source of truth is backend settings.
- Email baseline2/hr,3/day,address;120sec resend;IP30/hr100/day;global10000/month. All displayed safety bounds are proposed design validation bounds, not independently approved backend policy. Cross-field checks prevent hourly >daily, defaultTTL>maxTTL, and defaultretention>maxretention.
- BudgetUS$100/month is a target, not guaranteed bill hard stop. Cost depends on request/read cadence, room count, sizes, memory, mail and storage; no invented live billing telemetry.
- Draft count, cancel, dirty-navigation guard, reviewed save summary, saving/saved/error, version conflict with draft preservation, confirm-before-discard latest reload, invitation one-use/expiry/revoke and restricted-admin states are represented.

Extension validation: source syntax and39 mocked-DOM routes plus HOSTED/persistence variants pass. Actual1440/390 screenshots and interaction review are pending for this extension; prior QA above applies only to the earlier core prototype until rechecked.
