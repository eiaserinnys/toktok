# Shared dialogue gallery and fixture mode review

## Result and scope

The protected dialogue gallery contains the actual registered native product dialog renderer. Review chrome adds previous/next, name/state/index, Alt+Left/Right, bounded navigation, invalid-index rejection, Tab/Shift+Tab trapping, Escape exit, scroll lock and trigger focus restoration. Submissions are intercepted in the review shell; no live effect adapter is imported.

The flowboard mode control now projects the selected mode into fixture Config and admin settings data before rebuilding the same registry graph. Journey aliases guest/member are normalized to anonymous/invited. This is fixture data selection, never a server role or entitlement grant. Production TTL, retention and defaultPersist contracts are unchanged.

## New evidence

- New narrow unit run: Tests 3 passed (3), exit 0. Strict index bounds, mode/journey data consistency and representative missing component/dialog/route/expiry-edge negative coverage passed. Existing complete inventory is checked with validateCoverage; old passed browser slices were not repeated.
- Mock browser HOSTED/admin 1440 and DEMO/invited 390: 2 PASS, API requests 0, CSP violations 0, storage 0, canonical iframe stylesheet count 1 and ready=true. These render the same shared product screens with fixture data.
- Initial gallery 1440/390 attempts failed before entering the gallery because the static test server omitted /admin/design/dialogues from its HTML mapping and served product home. Blocked home config/session requests were captured; this is a harness dispatch failure, not an actual server authorization result.
- Mapping correction entered the real gallery. Both viewports observed first name/index 1/22, disabled previous, unchecked state, title focus, scroll lock, Shift+Tab/Tab wrap, checked next state and Alt+Right pending state. Both then failed because Escape did not close the nested native-dialog review shell. Raw results were preserved before changing source.
- Narrow product correction adds explicit Escape handling only to QA shell capture. Product pending cancel behavior is untouched. Tail continuation uses necessary pending setup without rejudging passed first/Tab/next gates. 1440/390 tail: 2 PASS, exit 0, cleanup=true; Escape close, focus return, invalid raw index rejection, last disabled next, bounded Alt+Right and Alt+Left previous all passed. API/CSP/pageerror/storage 0 and no horizontal overflow.
- Independent readonly stage-3 review found no blocker, including the final Escape branch. It did not claim browser or server authorization verification.

## Visual evidence

All PNGs contain fictional fixture data only. Actual issued invitation code, owner/capability secret and account values are absent. The native product dialog frame, fields, buttons and typography are reused. Review chrome follows design d6f0e975; its 10/11px metadata is raised to the established minimum 12px. No new product dimensions or public layout were introduced.

At 1440, shell x=270..1170 and product x=470..970. At 390, shell x=8..382 and product x=26..364. Both were within viewport with balanced surrounding chrome. Checked desktop and invitation-revoke error mobile PNGs were inspected directly: frame applied, labels readable, controls separated and no clipping. Long names wrap within review heading.

Evidence workspace-relative prefixes:

- .local/artifacts/toktok/20261003-gallery-modes-44ae/raw.json: initial dispatch failures and two mode/journey PASS.
- .local/artifacts/toktok/20261003-gallery-correction-44ae/raw.json: observed gallery interactions and real Escape failures; checked PNGs.
- .local/artifacts/toktok/20261003-gallery-tail-44ae/raw.json: two tail PASS and previous/error PNGs.

## Root integration handoff

No index/http/Assets/auth/quota/CI/production deployment was changed here. Root must keep actual DB-admin authorization before HTML and mirrored Assets and final connect-src none/form-action none CSP. This local static server is not evidence of that boundary. Existing root actual QA/authorization successes remain separate.

New external protected asset: /admin/design/_assets/admin-design/dialogue-gallery.css. It is linked from the protected index alongside the existing canonical product stylesheet and flow-board chrome. JS imports stay inside admin-design/shared mirror; live effects mirror is unnecessary.

Entry /admin/design/dialogues exposes buttons with data-review-index. Open shell .dialog-review-shell has data-review-index (zero-based), data-dialog-id and data-dialog-state; heading #reviewDialogTitle shows name and state; .review-dialog-count shows one-based index/total. Child dialog[data-review-product] is the registered product node. Controls are [data-review=prev|next|close]. Alt+ArrowLeft/Right move within bounds; Escape closes the QA shell even for a pending fixture and returns focus. No initial/API fetch is needed.

The new actual server gallery/mode slice and final bundle/deployment are root follow-ups. Recovery read-only display was committed separately at 24479d64 and root reports its actual 390 PASS; no recovery toggle or limit exception was added.

## Actual-server title-focus boundary correction

Root actual gallery QA after aa2d0ee found a new boundary: next/Alt navigation intentionally focuses #reviewDialogTitle (tabindex=-1), but immediately pressing Shift+Tab escaped the modal shell. Earlier C wrap observations began from the tabbable close button and did not cover this position. Root preserves both viewport failures separately. Flow cases stopped at actual edge asset 429 before graph judgment; they are not graph failures and no quota was changed.

The common trap now treats an active element absent from the visible enabled tabbable control list as a boundary in either direction. Shift+Tab selects last and Tab selects first, including the non-tabbable title. Ordinary middle-control native movement, endpoint wrapping and product pending-close policy are unchanged. This is a two-line shared focus-owner correction.

New narrow test: RED Tests 1 failed | 3 skipped (4), exit 1; GREEN Tests 1 passed | 3 skipped (4), exit 0. It covers title both directions, ordinary middle movement and first/last endpoints. Existing successful unit/browser cases were skipped, not repeated. Syntax/diff check passed; independent readonly review found no blocker. C ran no new browser. Root actual title-boundary continuation and flow loading under normal existing rate windows remain integration evidence to collect.
