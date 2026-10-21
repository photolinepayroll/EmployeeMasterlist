# RESUME — where we stopped (2026-10-21)

Read `CLAUDE.md` first for architecture, IDs and gotchas. This file is the session handoff.

## Done
- Apps Script backend deployed (current deployment version @7, URL unchanged). JSON API with allowlist, invites, applicant form logic, HR review/approve/return, limited payroll report, audit log, user management.
- Database Sheet and private Drive folder created by `setupSystem()` (already run). `appsscript.json` has Sheets/Drive/Mail scopes.
- Frontend rebuilt (ui-ux-pro-max, clean corporate) in `docs/`: `index.html` (staff login), `apply.html?t=…` (7-step applicant form), `admin.html` (HR dashboard, review drawer, invite, resend invite, export, users), `reports.html` (payroll read-only, CSV/Excel/print).
- GitHub repo pushed (`main`), Pages enabled from `/docs`; site serves the login page.
- Old server-rendered HTML pages removed from the Apps Script project; `doGet` forwards old links to the site.
- Added helpers in `Setup.gs`: `setAppUrlNow`, `setFrontendUrlNow`, `addSystemTab`, `saveAppUrl`, `setCompanyName`.

## Pending / next steps (user must run in the Apps Script editor)
1. Run `setFrontendUrlNow()` so emails link to the GitHub Pages site (until then invites fail with "Frontend URL is not set").
2. Run `addSystemTab()` to add the "System" links tab to the Sheet (re-run after step 1).
3. In HR Admin, open APP-261021-F9207 and click **Resend invite** (the first invite carried a non-working script.google.com link). Open the new link on a phone in a private window and confirm the form loads.
4. Fix the HR login identity: Users sheet shows `photoline.payroll@gmail.com`; script owner is `photoline.payroll20@gmail.com`. Use whichever receives mail, and keep the other row consistent in `Users`.
5. Fill the `Lists` tab (real Branches; Regions/Banks/Medical results are pre-filled).
6. Full flow test on the live site: invite → applicant submit (with PDF/JPG uploads) → return with remarks → resubmit → approve (unique Bio ID) → add a PAYROLL user → check report shows only 4 columns and CSV/Excel keep leading zeros.
7. Verify with the browser console that a PAYROLL token gets "Not authorized" on admin functions.

## Open items / ideas
- Root `README.md` still describes the old server-rendered setup; rewrite it for the GitHub Pages + API architecture.
- `Bank` is required for both account types (spec said only for Payroll Savings); decide if Other Bank may leave it blank.
- Optional: Sheet-bound script (Extensions → Apps Script) was declined; it would change the web app URL.
- Optional hardening: rate-limit failed invite-token lookups; add Data Privacy retention notice text reviewed by HR/legal.

## Not committed
`CLAUDE.md` and `RESUME.md` were just created and are not committed. They contain no secrets (the deployment ID is already public in `docs/js/config.js`).
