# RESUME — where we stopped (2026-10-22)

Read `CLAUDE.md` first for architecture, IDs and gotchas. This file is the session handoff.

## Done
- Apps Script backend deployed (current deployment version @7, URL unchanged). JSON API with allowlist, invites, applicant form logic, HR review/approve/return, limited payroll report, audit log, user management.
- Database Sheet and private Drive folder created by `setupSystem()` (already run). `appsscript.json` has Sheets/Drive/Mail scopes.
- Frontend rebuilt (ui-ux-pro-max, clean corporate) in `docs/`: `index.html` (staff login), `apply.html?t=…` (7-step applicant form), `admin.html` (HR dashboard, review drawer, invite, resend invite, export, users), `reports.html` (payroll read-only, CSV/Excel/print).
- GitHub repo pushed (`main`), Pages enabled from `/docs`; site serves the login page.
- Old server-rendered HTML pages removed from the Apps Script project; `doGet` forwards old links to the site.
- Added helpers in `Setup.gs`: `setAppUrlNow`, `setFrontendUrlNow`, `addSystemTab`, `saveAppUrl`, `setCompanyName`, `addEmployeeColumns`.
- Attachments (live, deployment @11, `addEmployeeColumns()` already run): photo for each gov ID, PSA, optional referral letter, IQ + psychological results, 4 multi-file application slots (Resume, Kasunduan, Pagsang-ayon, Breach/Karagdagang Kasunduan, up to 5 files each). Required: SSS, PhilHealth, Pag-IBIG (number + photo), PSA, IQ, Psych, all 4 slots. TIN optional (photo only if number entered). Spec: `docs/superpowers/specs/2026-10-22-applicant-attachments-design.md`.
- Speed work (live): per-request read memo and targeted row lookups (`Util.gs`), 2-min staff cache (`activeUser_`), uploads create the Drive file outside the script lock, payroll report cached 30 min (`cacheGetBig_`, cleared when `REPORT_KEYS` columns change), client keeps last report/list in sessionStorage and shows it while refreshing, photos compressed to 1600 px before upload, SheetJS preloaded, opened documents cached per session. Not done: keep-warm trigger (needs extra scope, unproven), audit-write batching (text-format risk), array-compact report rows. Not yet measured: compare Network timings before/after.

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

## Not tested yet
Full live flow with the new 9-step form (uploads, required-doc blocking, HR drawer grouping, PAYROLL denied on `getFile`). On clasp: Git Bash/PowerShell need `$env:Path += ";$env:APPDATA
pm"` first.
