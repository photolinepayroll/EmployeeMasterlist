# Employee Masterlist (Google Apps Script web app)

Secure masterlist of hired employees.
- **Applicant** gets a personal invite link and fills the Application Entry form (no Google login needed).
- **HR Admin** reviews, completes the admin fields (Bio ID, Date Hired, Region, Rate, bank/disbursement) and approves or returns the entry.
- **Payroll / Accounting / Audit** can only view and download a limited list: Bio ID, Full Name, Account No., Account Type.

Database = a private Google Sheet. Documents = a private Google Drive folder. Both are created by `setupSystem()` and owned by the account that deploys the script. Nobody else is given direct access; every read and write goes through role-checked server functions.

## Setup (about 10 minutes)
1. Sign in with the **HR owner account** (this account owns the Sheet and Drive files). Go to script.google.com → **New project**.
2. Turn on **Project Settings → Show "appsscript.json" manifest file**, then paste the contents of `appsscript.json` from this folder.
3. Create one script file per `.gs` file (Code, Config, Util, Setup, Auth, Invites, Applicant, Admin, Reports) and one HTML file per `.html` file (Styles, Client, Login, Apply, Admin, Reports). Names must match exactly (without the extension). *Alternative:* use `clasp push` from this folder.
4. Run `setupSystem` once and approve the permissions. Check **Executions / Logs** for the Sheet and Folder links.
5. Optional: run `setCompanyName('Your Company')` from the editor (edit the call or run it in the console).
6. **Deploy → New deployment → Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Copy the `/exec` URL.
7. Run `saveAppUrl` once so invite emails carry the right link. After every **new deployment**, run it again if the URL changed.
8. Open the `/exec` URL → **Staff login** with the owner email. Add Payroll / Accounting / Audit users under **Users & Access**.
9. Edit dropdowns (Branches, Regions, Banks, Medical Results) in the **Lists** sheet tab of the database.

## Daily use
1. HR: **New Invite** → enter the hire's name, email and branch. They receive the link.
2. Applicant completes the 7 steps and submits. Status becomes `PENDING` and HR is emailed.
3. HR: **Applications** → open an entry → check documents → fill the admin entry → **Approve**, or **Return to applicant** with remarks (the applicant gets a fresh link by email).
4. Payroll staff log in and open **Payroll Masterlist** → search, **Download CSV / Excel**.

## Security notes
- Staff log in with an emailed one-time code; only emails marked active in the `Users` sheet can log in. Disabling a user takes effect immediately.
- Invite tokens are stored only as SHA-256 hashes, expire after 14 days and are reissued when an entry is returned.
- Uploads are limited to PDF/JPG/PNG up to 5 MB (file contents are checked) and stay private in Drive. HR opens them through the app.
- Report roles never receive Rate, government IDs, address or documents. The server sends only the four report columns.
- All logins, record views, file opens, approvals, returns, exports and downloads are written to the `AuditLog` tab.
- Keep the database Sheet and Drive folder **unshared**. Do not give staff direct access.
- Gmail sends are limited by Google quotas (about 100 emails/day for a free account, 1,500 for Workspace).

## Known limits
- Uploads go through Apps Script as base64, so the practical limit is about 5 MB per file.
- A session lasts up to 6 hours, then staff log in again.
