# toktok UI/UX contract

This is a required project rule, established by the owner on2026-10-02.

Every UI/UX change must update the component catalog, dialogue catalog and screen flowboard together. UI/UX outside those catalogs is prohibited. New elements must remain consistent with the existing Common room visual and interaction system.

## Shared sources, not screenshots of a second implementation
- Product and QA must consume the same component renderers, dialog functions and route registry.
- `dist/design-contract.js` is this prototype's canonical registration data. In the repository handoff these files live directly in `design/prototype/`, so the contract is `design/prototype/design-contract.js`.
- Register a new or changed component, dialogue, route, role/mode guard, error branch and return path before considering the change complete.
- The flowboard displays multiple real screen renderers simultaneously on a pan/zoom canvas, connected by labeled transitions. A linear wizard is not a substitute.
- Agent-readable graph data must remain available with the visual board. Missing nodes, unregistered transitions, unexpected dead ends and inconsistent Back/return routes are review failures.

## Review surfaces
- Components: normal, hover/focus, opened selection, selected, invalid, empty, disabled, loading and long-content cases where applicable
- Dialogues: actual shared content/functions, keyboard focus, Escape, outside click, confirm/cancel, failure/conflict and dirty state
- Flowboard: anonymous/invited/admin and DEMO/HOSTED variants; invitation code gating, OTP, owner acknowledgement, public grant, persistence notices, permission guards and history behavior
- Recheck1440px and390px actual renders plus keyboard behavior after every affected change. Source checks are not a substitute for browser inspection.

## Authority and fixture safety
Production QA pages are administrator-only, including direct URLs. Enforce authorization on the server. Client fixture flags and role selectors must never grant operational rights.

QA data is fictional. Opening, testing or confirming a gallery dialogue cannot send email, create a real room, issue/revoke an invitation, change settings or grant agent access. Use isolated fixture state and side-effect-free adapters around the real renderers.

## Required checks
Run `node prototype-tests.cjs` for source-level route/registry and behavioral checks. Then run actual browser captures and interaction tests of changed components/dialogues/transitions. Keep passing and unverified checks distinct in the handoff.

The current preview is static and all authentication/administration is simulated. The production implementation must enforce the same contract in its actual component imports, route definitions, API authorization and CI checks.
