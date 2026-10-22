# Plan: more document attachments in the Applicant form

## Context
Applicants currently upload only Medical, NBI and a free "Other Documents" box. HR needs proof and paperwork per applicant: a photo for every government ID, PSA, optional referral letter, IQ + psychological exam results, and grouped application attachments (Resume, Kasunduan, Pagsang-ayon, Breach of Contract / Karagdagang Kasunduan). Decisions made with user:
- Gov-ID photo is required only when that ID's number is entered (and a photo needs a number).
- Application attachments = one step, 4 labelled slots, each accepts several files.
- Required to submit: PSA, IQ result, Psychological result, Resume, Kasunduan, Pagsang-ayon, Breach/Karagdagang Kasunduan. Referral Letter optional.

## Design
Generalise the existing file mechanism (`FILE_FIELDS`, `type:'file'|'files'`) instead of adding special cases.

### Config.gs (single source of truth)
- `EMP_COLS`: add single-file cols `TINFileId, SSSFileId, PhilHealthFileId, PagIBIGFileId, PSAFileId, ReferralFileId, IQFileId, PsychFileId`; multi-file JSON cols `ResumeDocs, KasunduanDocs, PagsangAyonDocs, BreachDocs` (same JSON `[{id,name}]` format as `OtherDocs`).
- `FILE_FIELDS`: add each with a short prefix (TIN, SSS, PHI, PAG, PSA, REF, IQ, PSY, RES, KAS, PAG2, BRE). Add `MULTI_FILE_FIELDS = ['OtherDocs','ResumeDocs','KasunduanDocs','PagsangAyonDocs','BreachDocs']`.
- `APPLY_STEPS` becomes: Personal Info, Contact & Branch, Government IDs, Medical & NBI, PSA, Referral & Exams, Application Attachments, Other Documents, Emergency Contact, Review & Submit. Renumber `step` for Emergency fields (6 → 9) and Other Docs (5 → 8).
- `APPLICANT_FIELDS`: add a `type:'file'` entry after each ID (step 3, `reqIf:'TIN'` etc.), PSA/Referral/IQ/Psych at step 5 (`req:true`, Referral not), and four `type:'files'` entries at step 7 with `req:true` and a `max` count (e.g. 5 per slot). Existing `MAX_OTHER_DOCS` stays for Other Documents.

### Backend
- `Applicant.gs` `uploadFile`: replace the `field === 'OtherDocs'` branch with `MULTI_FILE_FIELDS.indexOf(field) >= 0`; write the JSON to that field's own column. Rename `removeOtherDoc` → `removeDoc(token, field, fileId)` (update `API_ALLOWED_` in `Code.gs`). Single-file replace/trash logic unchanged.
- `Util.gs` `filesInfo_`: build the result from `FILE_FIELDS`/`MULTI_FILE_FIELDS` loops, so every consumer (applicant + admin) gets all new files.
- `Applicant.gs` `submitApplication`: extend the file-required loop to (a) `req` files/`files` (non-empty array) and (b) `reqIf` rules (ID number present ⇒ photo required; photo present without number ⇒ error on the number field). `getApplicationByToken` already returns `files` and `limits`; add per-slot max.
- `Admin.gs` `getFile`: allowed-id list must cover all single + multi file fields (currently hard-codes Medical/NBI/Other). Admin record/export loops that skip `file`/`files` types already work. Report roles still get only the 4 limited columns — no change.
- Existing sheet: add `addEmployeeColumns()` helper in `Setup.gs` that appends missing `EMP_COLS` headers to the live Employees tab (user runs it once in the Apps Script editor, per CLAUDE.md gotcha — `clasp run-function` does not work). Verify `updateObj_`/`appendObj_` in `Util.gs` map by header name before relying on it.

### Frontend (docs/)
- `apply.js`: generalise `fileFieldHtml`/`otherDocsHtml`/`docsList`/`uploadSelected`/`removeOtherDoc` handler to work per field key (ids `cur_<k>` / `docs_<k>`), drop the hard-coded `'OtherDocs'` checks; `files[k]` holds object or array. Next-step validation: required files + `reqIf` rule. `reviewHtml` lists every file field generically (Missing in red).
- `ui.js` (`checkField`/`validateSpec`) already ignores file types; add nothing except the reqIf message on the number field if wanted for UX.
- `admin.js` `filesHtml`: show grouped sections (Government ID proofs, Civil & Exams, Application attachments, Other) with labels from the spec instead of the hard-coded Medical/NBI lines.
- Update the hint text on Other Documents (remove "valid IDs", now covered).

### Docs
- Update CLAUDE.md/RESUME.md (new fields, `addEmployeeColumns()` step, `removeDoc` rename).

## Rollout order
1. Edit Config/Util/Applicant/Admin/Code/Setup `.gs`; `clasp push --force`; `clasp deploy -i <live id> -d "more attachments"`.
2. User runs `addEmployeeColumns()` in the Apps Script editor.
3. Edit `docs/js/*`; `git push` to `main` (Pages rebuild 1–2 min). Push backend first so the form never calls a missing API.

## Verification
- `node --check` on all `.gs` (copied to `.js`) and `docs/js/*.js`.
- Local preview (`py -3 -m http.server 8765` in `docs/`) against the live API using a test invite: step flow, per-field upload/replace/remove, multi-file slots, ID number without photo and photo without number blocked, required docs block submit.
- Submit → HR Admin review drawer shows all grouped docs and each opens via `getFile`.
- Approve, then PAYROLL login: report still shows only Bio ID, Full Name, Account No., Account Type; calling `getFile`/`getApplication` as PAYROLL returns "Not authorized".
- Existing in-progress applicant (APP-261021-F9207) can load and is asked for the new documents (it is still INVITED/RETURNED so editable).

## Open risk
Making seven documents required raises applicant friction on phones (5 MB each, base64 upload through Apps Script, 6-minute execution limit): keep one upload per request as today; draft auto-save already preserves progress.
