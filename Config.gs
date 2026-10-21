/**
 * Config.gs — constants, field definitions and validation rules.
 * Field specs are the single source of truth: the server validates with them
 * and they are sent to the browser to render forms and mirror validation.
 */

const APP_NAME = 'Employee Masterlist';

const SHEETS = {
  EMP: 'Employees',
  INV: 'Invites',
  USERS: 'Users',
  AUDIT: 'AuditLog',
  LISTS: 'Lists'
};

const ROLES = {
  HR: 'HR_ADMIN',
  PAYROLL: 'PAYROLL',
  ACCT: 'ACCOUNTING',
  AUDIT: 'AUDIT'
};
const ALL_ROLES = [ROLES.HR, ROLES.PAYROLL, ROLES.ACCT, ROLES.AUDIT];
const REPORT_ROLES = ALL_ROLES;
const HR_ONLY = [ROLES.HR];

const STATUS = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  RETURNED: 'RETURNED',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED'
};
const EDITABLE_BY_APPLICANT = [STATUS.INVITED, STATUS.RETURNED];

const EMP_COLS = [
  'AppID', 'Status', 'BioID',
  'LastName', 'FirstName', 'MiddleName', 'Suffix', 'Sex', 'Birthdate',
  'Mobile', 'Email', 'Address', 'Branch',
  'DateHired', 'Region', 'Rate',
  'TIN', 'SSS', 'PhilHealth', 'PagIBIG',
  'MedicalDate', 'MedicalResult', 'MedicalFileId',
  'NBINo', 'NBIValidity', 'NBIFileId',
  'OtherDocs',
  'EmergencyName', 'EmergencyNo',
  'AccountType', 'Bank', 'AccountNumber', 'AccountName',
  'FolderId', 'PrivacyConsent', 'SubmittedAt', 'ReviewedBy', 'ReviewedAt', 'Remarks', 'UpdatedAt'
];
const INV_COLS = ['TokenHash', 'AppID', 'Email', 'Name', 'Branch', 'CreatedBy', 'CreatedAt', 'ExpiresAt', 'Status'];
const USER_COLS = ['Email', 'Role', 'Active', 'AddedBy', 'AddedAt'];
const AUDIT_COLS = ['Timestamp', 'Actor', 'Role', 'Action', 'Ref', 'Details'];
const LIST_COLS = ['Branches', 'Regions', 'Banks', 'MedicalResults'];

const INVITE_DAYS = 14;
const OTP_TTL_SEC = 600;          // login code valid for 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const SESSION_TTL_SEC = 21600;    // 6 hours (CacheService maximum)
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_OTHER_DOCS = 10;
const ALLOWED_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png'
};
const FILE_FIELDS = { MedicalFileId: 'MED', NBIFileId: 'NBI', OtherDocs: 'DOC' };

const SEX = ['Male', 'Female'];
const SUFFIXES = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
const ACCOUNT_TYPES = ['Payroll Savings', 'Other Bank'];

const PATTERNS = {
  email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  mobile: '^09\\d{9}$',
  phone: '^[0-9+()\\- ]{7,20}$',
  tin: '^\\d{3}-\\d{3}-\\d{3}(-\\d{3,5})?$',
  sss: '^\\d{2}-\\d{7}-\\d$',
  philhealth: '^\\d{2}-\\d{9}-\\d$',
  pagibig: '^\\d{4}-\\d{4}-\\d{4}$',
  bioId: '^[A-Za-z0-9-]{1,20}$',
  rate: '^\\d{1,7}(\\.\\d{1,2})?$',
  account: '^[0-9-]{4,30}$'
};

const APPLY_STEPS = [
  'Personal Info',
  'Contact & Branch',
  'Government IDs',
  'Medical & NBI',
  'Other Documents',
  'Emergency Contact',
  'Review & Submit'
];

/** Fields the applicant fills in. `step` maps to APPLY_STEPS (1-based). */
const APPLICANT_FIELDS = [
  { k: 'LastName', label: 'Last Name', step: 1, req: true, max: 60 },
  { k: 'FirstName', label: 'First Name', step: 1, req: true, max: 60 },
  { k: 'MiddleName', label: 'Middle Name', step: 1, max: 60 },
  { k: 'Suffix', label: 'Suffix', step: 1, type: 'select', options: SUFFIXES },
  { k: 'Sex', label: 'Sex', step: 1, req: true, type: 'select', options: SEX },
  { k: 'Birthdate', label: 'Birthdate', step: 1, req: true, type: 'date', adult: true },

  { k: 'Mobile', label: 'Mobile Number', step: 2, req: true, type: 'tel', pattern: PATTERNS.mobile, hint: '11 digits, e.g. 09171234567' },
  { k: 'Email', label: 'Email Address', step: 2, req: true, type: 'email', pattern: PATTERNS.email, max: 100 },
  { k: 'Address', label: 'Complete Address', step: 2, req: true, type: 'textarea', max: 300 },
  { k: 'Branch', label: 'Branch', step: 2, req: true, type: 'select', list: 'Branches' },

  { k: 'TIN', label: 'TIN', step: 3, pattern: PATTERNS.tin, hint: '000-000-000 or 000-000-000-000' },
  { k: 'SSS', label: 'SSS Number', step: 3, pattern: PATTERNS.sss, hint: '00-0000000-0' },
  { k: 'PhilHealth', label: 'PhilHealth Number', step: 3, pattern: PATTERNS.philhealth, hint: '00-000000000-0' },
  { k: 'PagIBIG', label: 'Pag-IBIG MID Number', step: 3, pattern: PATTERNS.pagibig, hint: '0000-0000-0000' },

  { k: 'MedicalDate', label: 'Medical Exam Date', step: 4, req: true, type: 'date', notFuture: true },
  { k: 'MedicalResult', label: 'Medical Result', step: 4, req: true, type: 'select', list: 'MedicalResults' },
  { k: 'MedicalFileId', label: 'Pre-Employment Medical (scan)', step: 4, req: true, type: 'file' },
  { k: 'NBINo', label: 'NBI Clearance Number', step: 4, req: true, max: 40 },
  { k: 'NBIValidity', label: 'NBI Valid Until', step: 4, req: true, type: 'date' },
  { k: 'NBIFileId', label: 'NBI Clearance (scan)', step: 4, req: true, type: 'file' },

  { k: 'OtherDocs', label: 'Other Credential Documents', step: 5, type: 'files', hint: 'Diploma, TOR, certificates, valid IDs, etc. Up to 10 files.' },

  { k: 'EmergencyName', label: 'Emergency Contact Name', step: 6, req: true, max: 100 },
  { k: 'EmergencyNo', label: 'Emergency Contact Number', step: 6, req: true, type: 'tel', pattern: PATTERNS.phone }
];

/** Fields only HR Admin can fill in (never shown to applicants or report roles). */
const ADMIN_FIELDS = [
  { k: 'BioID', label: 'Bio ID / Company ID', req: true, pattern: PATTERNS.bioId, hint: 'Letters, numbers and dashes' },
  { k: 'DateHired', label: 'Date Hired', req: true, type: 'date' },
  { k: 'Region', label: 'Region', req: true, type: 'select', list: 'Regions' },
  { k: 'Rate', label: 'Rate (PHP)', req: true, pattern: PATTERNS.rate, hint: 'e.g. 645.00' },
  { k: 'AccountType', label: 'Disbursement Account Type', req: true, type: 'select', options: ACCOUNT_TYPES },
  { k: 'Bank', label: 'Payroll Savings Bank', req: true, list: 'Banks', datalist: true, max: 80 },
  { k: 'AccountNumber', label: 'Payroll Savings Account Number', req: true, pattern: PATTERNS.account, hint: 'Digits and dashes only' },
  { k: 'AccountName', label: 'Account Name', req: true, max: 100 }
];

/** Columns in the limited report for Payroll / Accounting / Audit. Nothing else is ever sent to them. */
const LIMITED_REPORT_COLS = [
  { k: 'BioID', label: 'Bio ID' },
  { k: 'FullName', label: 'Full Name' },
  { k: 'AccountNumber', label: 'Account No.' },
  { k: 'AccountType', label: 'Account Type' }
];

const DEFAULT_LISTS = {
  Branches: ['Head Office'],
  Regions: ['NCR', 'CAR', 'Region I', 'Region II', 'Region III', 'Region IV-A', 'MIMAROPA', 'Region V',
    'Region VI', 'NIR', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XII',
    'Region XIII', 'BARMM'],
  Banks: ['BDO', 'BPI', 'Metrobank', 'Landbank', 'PNB', 'Security Bank', 'UnionBank', 'RCBC', 'Chinabank',
    'EastWest', 'PSBank', 'AUB'],
  MedicalResults: ['Fit to Work', 'Fit with Findings', 'Unfit', 'Pending']
};

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
