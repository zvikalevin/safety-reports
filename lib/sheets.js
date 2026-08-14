// כתיבת כל דיווח חדש כשורה בגיליון Google Sheets.
//
// למה זה כאן: במסלול החינמי של Render כל הקבצים בשרת נמחקים בכל הפעלה מחדש.
// הגיליון הוא הארכיון הקבוע - הוא חי אצל Google, לא אצל Render, ולכן שורד הכל.
//
// מימוש ללא שום ספרייה חיצונית: חתימת JWT עם crypto המובנה של Node,
// והחלפתו לאסימון גישה מול Google. ספריית googleapis הרשמית שוקלת עשרות
// מגה-בייט והייתה מאטה את עליית השרת - בדיוק הבעיה שתיקנו.

const crypto = require('crypto');

// שרתי Render עובדים בשעון UTC. בלי קביעה מפורשת של אזור הזמן,
// כל הדיווחים היו מוצגים בשעון מוקדם ב-2-3 שעות משעון ישראל.
const TZ = process.env.TIMEZONE || 'Asia/Jerusalem';

function formatDate(iso) {
  return new Date(iso).toLocaleString('he-IL', { timeZone: TZ });
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const HEADERS = [
  'תאריך ושעה',
  'מיקום',
  'פירוט מדויק',
  'דחיפות',
  'תיאור המפגע',
  'מדווח',
  'סטטוס',
  'קישור לתמונה',
];

function isSheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// המפתח מגיע ממשתנה סביבה, ושם שורות חדשות נשמרות כתווי \n מילוליים
function normalizePrivateKey(raw) {
  return String(raw).replace(/\\n/g, '\n').trim();
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  // שומרים את האסימון בזיכרון כל עוד הוא בתוקף, כדי לא לבקש חדש בכל דיווח
  if (cachedToken && now < cachedTokenExpiry - 60) {
    return cachedToken;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: email,
      scope: SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer
    .sign(key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      `קבלת אסימון גישה מגוגל נכשלה: ${data.error_description || data.error || res.status}`
    );
  }

  cachedToken = data.access_token;
  cachedTokenExpiry = now + Number(data.expires_in || 3600);
  return cachedToken;
}

async function sheetsRequest(path, options = {}) {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data.error?.message || res.status;
    throw new Error(`בקשה ל-Google Sheets נכשלה: ${reason}`);
  }
  return data;
}

async function appendRow(values) {
  return sheetsRequest(
    `/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [values] }) }
  );
}

// בפעם הראשונה בלבד - אם הגיליון ריק, כותבים שורת כותרות
let headersChecked = false;
async function ensureHeaders() {
  if (headersChecked) return;
  headersChecked = true;
  try {
    const data = await sheetsRequest('/values/A1:H1');
    const empty = !data.values || data.values.length === 0;
    if (empty) await appendRow(HEADERS);
  } catch (e) {
    // אם הבדיקה נכשלה לא מפילים את הדיווח - רק מדווחים ללוג
    console.error('בדיקת שורת הכותרות בגיליון נכשלה:', e.message);
  }
}

async function appendReportToSheet(report, baseUrl) {
  if (!isSheetsConfigured()) return { skipped: true };

  await ensureHeaders();

  const photoUrl = report.photoFilename && baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/uploads/${report.photoFilename}`
    : '';

  await appendRow([
    formatDate(report.createdAt),
    report.location || '',
    report.locationDetail || '',
    report.urgency || '',
    report.description || '',
    report.reporterName || 'אנונימי',
    report.status || 'פתוח',
    photoUrl,
  ]);

  return { appended: true };
}

module.exports = { appendReportToSheet, isSheetsConfigured };
