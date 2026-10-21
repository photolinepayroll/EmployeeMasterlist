# Employee Masterlist — frontend

Static site (HTML + CSS + JS, no build step) served by GitHub Pages from `/docs`.
It talks to the Google Apps Script web app through a JSON API (`js/config.js` sets `API_URL`).

| Page | Who |
|---|---|
| `index.html` | Staff login (HR, Payroll, Accounting, Audit) |
| `apply.html?t=...` | New hire, personal invite link |
| `admin.html` | HR Admin |
| `reports.html` | Payroll / Accounting / Audit (read-only, 4 columns) |

No employee data or secrets live in this repo. Data stays in a private Google Sheet and Drive folder, and every API call is role-checked on the server.
To change the backend URL, edit `docs/js/config.js`.
