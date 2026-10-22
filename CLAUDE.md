# CLAUDE.md — Employee Masterlist

HR web app: a secure masterlist of hired employees. Applicants fill a form from a personal invite link, HR reviews and approves, and Payroll/Accounting/Audit get a read-only, limited list.

## Stack
- **Backend:** Google Apps Script (standalone project), files `*.gs` in the repo root. Exposed as a web app (Execute as: Me, Access: Anyone) with a JSON API: `doPost` runs only functions in `API_ALLOWED_` (`Code.gs`). `doGet` only redirects old links to the website.
- **Database:** private Google Sheet "Employee Masterlist DB (PRIVATE)" (tabs: Employees, Invites, Users, AuditLog, Lists, System). **Documents:** private Drive folder. IDs live in Script Properties (`SHEET_ID`, `ROOT_FOLDER_ID`, `FRONTEND_URL`, `APP_URL`, `COMPANY_NAME`).
- **Frontend:** static HTML/CSS/JS in `docs/` (no build step), served by GitHub Pages from `main` + `/docs`. Calls the backend with `fetch` POST (text/plain JSON body, avoids CORS preflight).

## Key facts
- Site: https://photolinepayroll.github.io/EmployeeMasterlist/ — repo: https://github.com/photolinepayroll/EmployeeMasterlist
- Apps Script project: https://script.google.com/d/1oMPL3cdmdXCQl7h_hdy6IM-miOTc2RIvoCzMCUq5TThxKmBXVf9eGADx/edit
- Live deployment ID (keep it; redeploy into it so the URL never changes): `AKfycbxPvG_kKGLYBR3HzSJoZ6_jcctfnkPJ_jVMWcKV41JYEbPS28LVP39dKSE2EQZyGpI`. API URL = `https://script.google.com/macros/s/<id>/exec` (set in `docs/js/config.js`).
- `clasp` is logged in as photoline.payroll20@gmail.com (script owner). The Users sheet lists photoline.payroll@gmail.com as HR_ADMIN; that mismatch must be resolved so the right account can log in.
- Roles: `HR_ADMIN` (everything), `PAYROLL`/`ACCOUNTING`/`AUDIT` (limited report: Bio ID, Full Name, Account No., Account Type only, APPROVED rows).
- Staff log in with email + 6-digit emailed code (CacheService sessions, 6h). Applicants use invite tokens (stored as SHA-256 hashes, 14-day expiry).
- Field rules (formats, required fields, admin vs applicant fields) live in `Config.gs` (`APPLICANT_FIELDS`, `ADMIN_FIELDS`); the browser gets them from the server, so change them only there.
- Document preview (zoom/rotate/next/previous, images + PDF) is `openViewer()` in `docs/js/viewer.js`, used by `admin.js`; add its script tag to any page that needs it.
- Attachments: every upload is a `type:'file'` (one Drive id) or `type:'files'` (JSON list, listed in `MULTI_FILE_FIELDS`) field in `APPLICANT_FIELDS` + `FILE_FIELDS`. `req:true` makes it mandatory; `reqIf:'TIN'` makes a photo required only when that number is filled (TIN is the only optional ID; SSS/PhilHealth/Pag-IBIG are required). New `EMP_COLS` go at the END (rows are written by position); then run `addEmployeeColumns()` in the Apps Script editor once.

## Commands
- Push backend: `clasp push --force` (run from repo root; `.claspignore` excludes `docs/`, README, `.git`).
- Redeploy same URL: `clasp deploy -i AKfycbxPvG_kKGLYBR3HzSJoZ6_jcctfnkPJ_jVMWcKV41JYEbPS28LVP39dKSE2EQZyGpI -d "note"`.
- Frontend deploys by `git push` to `main` (Pages rebuilds in 1–2 min).
- Syntax check: copy `.gs` to `.js` and run `node --check`; for pages `node --check docs/js/*.js`.
- Local preview: `py -3 -m http.server 8765` inside `docs/` (use `py -3`; plain `python` is not installed).

## Gotchas learned
- Speed: `readAll_`/`findBy_` are memoized per request and cleared by writes and `lock_`; large sheets use key-column lookups. Cached payroll report (`rpt_limited`) is dropped by `updateObj_` when a `REPORT_KEYS` column changes, so write employee data only through `updateObj_`. Staff lookups are cached 2 min (`usr_`); `upsertUser` clears it.
- On this PC `clasp` is not on PATH: add `$env:APPDATA
pm` first. Git Bash heredocs with apostrophes fail; write helper scripts with the Write tool.
- Apps Script loads files alphabetically: never reference constants from another file at top level (use `Config.gs` for shared constants; `Admin.gs` once broke on `ROLES`).
- Two files with the same base name (`Admin.gs` + `Admin.html`) are not allowed in one Apps Script project.
- `clasp create` overwrites `appsscript.json` with a default; restore the scopes/`webapp` block before pushing.
- `clasp run-function` does not work here (needs own Google Cloud OAuth client). Run functions from the Apps Script editor.
- The `@HEAD` deployment (`/dev` URL) cannot be deleted and only works for the owner. Never email `/dev` links; invite links must use `FRONTEND_URL` (`pageUrl_()` throws if unset).
- GitHub Pages can only publish `/` or `/docs`, so the frontend lives in `docs/`.
- Bash heredocs sometimes reject files containing apostrophes/escapes; use the Write tool for such files. The Edit tool de-escapes `\uXXXX` sequences.
- `.clasp.json` and `PROMPT.txt` are git-ignored. No secrets belong in the repo (it is public).

- Emails: all go through `sendMail_` + `mailShell_(title, body)` in `Util.gs` (table layout, logo from `logoUrl_()` = `FRONTEND_URL/img/logo.png`); use `mailButton_(label,url)` and `mailCode_(code)`. Push `docs/` before testing mail or the logo is broken. Run `previewMail` in the editor to send samples (the Run dropdown hides names ending in `_`, hence the wrapper).
- Branding assets: `docs/img/logo.png` (header/emails), `favicon.png` (blue "Ph"), `apple-touch-icon.png`; source art `PLANS/logo.png` (untracked, 72 dpi: call `SetResolution(96,96)` before cropping with System.Drawing). HR review drawer is a centered modal (full-screen on phones).
- Tooling: Python is not installed in Git Bash; use Node for scripted edits and PowerShell for `py -3 -m http.server 8765`.

## Conventions
- Match existing style: function-level `use strict`-free V8 JS in `.gs` (private helpers end with `_`, only `API_ALLOWED_` functions are callable from the browser), plain CSS tokens in `docs/css/theme.css`, no frameworks.
- Every protected server function starts with `requireRole_(token, roles)`. Report roles must never receive Rate, IDs, addresses or documents.
- Validation is mirrored in `docs/js/ui.js` (`checkField`) for UX only; the server (`validateFields_` in `Util.gs`) is authoritative.
- Design: ui-ux-pro-max "clean corporate" (blue/green, Fira Sans/Fira Code, light mode only, 44px targets, SVG icons, no emoji). Brand: "Photoline HR Portal"; logo `docs/img/logo.png` (header via `topbar()`, login page, and emails via `logoUrl_()` in `Util.gs` from `FRONTEND_URL`, so push `docs/` before testing mail).
