// שרת דיווחי מפגעי בטיחות במפעל
// Express + אחסון קבצים פשוט (JSON) - ללא מסד נתונים חיצוני, ללא חשבון Google/Microsoft

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildReportsWorkbook } = require('./lib/excel');
const { sendNewReportEmail, sendDigestEmail, isMailConfigured } = require('./lib/mailer');
const { appendReportToSheet, isSheetsConfigured } = require('./lib/sheets');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const REPORTS_XLSX = path.join(DATA_DIR, 'reports.xlsx');

const URGENCY_LEVELS = ['נמוך', 'בינוני', 'גבוה', 'קריטי'];
const STATUS_VALUES = ['פתוח', 'בטיפול', 'טופל'];

// הודעות שגיאה דו-לשוניות - הבחירה נקבעת לפי שדה ה-lang שהטופס שולח
const MESSAGES = {
  he: {
    noLocation: 'יש לציין מיקום במפעל',
    noUrgency: 'יש לבחור רמת דחיפות תקינה',
    noDescription: 'יש להוסיף תיאור של המפגע',
    noPhoto: 'יש לצרף תמונה של המפגע',
    fileTooBig: (mb) => `התמונה גדולה מדי (מקסימום ${mb}MB) - נסה לצלם שוב באיכות רגילה או לבחור תמונה קטנה יותר`,
    uploadError: 'שגיאה בהעלאת התמונה',
    unsupportedFile: 'סוג קובץ לא נתמך - יש להעלות תמונה בלבד',
    tooMany: (max) => `נשלחו ${max} דיווחים מהמכשיר הזה היום, וזו המכסה היומית. נסה שוב מחר, או פנה לממונה הבטיחות ישירות אם מדובר במפגע דחוף.`,
    serverBusy: 'המערכת קיבלה מספר חריג של דיווחים היום. פנה לממונה הבטיחות ישירות אם מדובר במפגע דחוף.',
  },
  ru: {
    noLocation: 'Пожалуйста, укажите место на заводе',
    noUrgency: 'Пожалуйста, выберите уровень срочности',
    noDescription: 'Пожалуйста, добавьте описание нарушения',
    noPhoto: 'Пожалуйста, прикрепите фото нарушения',
    fileTooBig: (mb) => `Фото слишком большое (максимум ${mb}MB) - попробуйте переснять в обычном качестве или выбрать файл меньшего размера`,
    uploadError: 'Ошибка загрузки фото',
    unsupportedFile: 'Неподдерживаемый тип файла - можно загружать только изображения',
    tooMany: (max) => `С этого устройства сегодня отправлено ${max} сообщений - это дневной лимит. Попробуйте завтра или обратитесь к инженеру по безопасности напрямую, если нарушение срочное.`,
    serverBusy: 'Система получила необычно много сообщений сегодня. Обратитесь к инженеру по безопасности напрямую, если нарушение срочное.',
  },
};

function getMessages(lang) {
  return MESSAGES[lang] || MESSAGES.he;
}

// ---- אתחול תיקיות/קבצים ----
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, '[]', 'utf8');

if (!ADMIN_PASSWORD) {
  console.warn('\n⚠️  אזהרה: לא הוגדרה ADMIN_PASSWORD בקובץ .env - ממשק הניהול אינו מוגן!\n');
}
if (!isMailConfigured()) {
  console.warn('ℹ️  שליחת מייל אוטומטי אינה מוגדרת (ראה README) - הדיווחים יישמרו אך לא יישלח מייל.');
}
if (!isSheetsConfigured()) {
  console.warn('⚠️  גיליון Google Sheets אינו מוגדר - אין ארכיון קבוע! דיווחים יימחקו בכל הפעלה מחדש.\n');
} else {
  console.log('📊 ארכיון Google Sheets פעיל\n');
}

// ---- עדכון קובץ ה-Excel המרכזי, ושליחת מייל עבור דיווח חדש (לא חוסם את התשובה לעובד) ----
async function syncExcelAndNotify(reports, newReport) {
  // הגיליון הוא הארכיון הקבוע - כותבים אליו קודם, לפני כל השאר
  if (newReport) {
    try {
      const result = await appendReportToSheet(newReport, PUBLIC_URL);
      if (result.appended) console.log('📊 הדיווח נוסף לגיליון Google Sheets');
    } catch (e) {
      console.error('שגיאה בכתיבה לגיליון:', e.message);
    }
  }

  // בניית האקסל היא פעולה כבדה. אין טעם לבצע אותה בכל דיווח אם אף אחד לא צריך
  // את הקובץ ברגע זה - הוא נבנה ממילא מחדש בכל הורדה מממשק הניהול.
  // בונים רק אם באמת עומדים לשלוח מייל שאליו הוא מצורף.
  const willEmail = Boolean(newReport) && isMailConfigured() && !MAIL_MINIMAL;

  if (willEmail) {
    try {
      await buildReportsWorkbook(reports, UPLOADS_DIR, REPORTS_XLSX);
    } catch (e) {
      console.error('שגיאה בבניית קובץ Excel:', e);
    }
  }

  if (newReport) {
    try {
      const photoPath = newReport.photoFilename
        ? path.join(UPLOADS_DIR, newReport.photoFilename)
        : null;
      const result = await sendNewReportEmail({
        report: newReport,
        // במצב מייל מינימלי לא מצרפים כלום ולא מייצרים אקסל כלל
        excelPath: MAIL_MINIMAL ? null : REPORTS_XLSX,
        photoPath: MAIL_MINIMAL ? null : photoPath,
        minimal: MAIL_MINIMAL,
      });
      if (result.sent) {
        console.log(`📧 מייל נשלח אל: ${result.to.join(', ')}`);
      }
    } catch (e) {
      console.error('שגיאה בשליחת מייל:', e.message);
    }
  }
}

// ---- עזרי קריאה/כתיבה לקובץ הנתונים ----
function readReports() {
  try {
    const raw = fs.readFileSync(REPORTS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('שגיאה בקריאת קובץ הדיווחים:', err);
    return [];
  }
}

function writeReports(reports) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

// ---- העלאת תמונות (multer) ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  },
});

function imageFileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(getMessages(req.query.lang).unsupportedFile));
  }
}

// גודל תמונה מרבי - ניתן לשנות דרך משתנה סביבה MAX_PHOTO_MB בלי לגעת בקוד
const MAX_PHOTO_MB = Number(process.env.MAX_PHOTO_MB) || 8;

// מייל מינימלי: רק שורת נושא, בלי קישורים, בלי תמונה ובלי קובץ מצורף.
// שימושי כשמסנני דואר ארגוניים חוסמים צרופות או קישורים.
const MAIL_MINIMAL = String(process.env.MAIL_MINIMAL || '').toLowerCase() === 'true';

// הכתובת הציבורית של המערכת - משמשת לבניית קישור לתמונה בגיליון.
// Render מספק אותה אוטומטית במשתנה RENDER_EXTERNAL_URL.
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024 },
});

// ---- הגבלת קצב דיווחים (הגנה מפני הצפה) ----
// כל הערכים ניתנים לשינוי דרך משתני סביבה ב-Render, בלי לגעת בקוד.
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 5;              // דיווחים מותרים לכל מכשיר
const RATE_WINDOW_MIN = Number(process.env.RATE_LIMIT_WINDOW_MIN) || 1440; // בתוך כמה דקות (1440 = יממה)
const DAILY_MAX = Number(process.env.DAILY_LIMIT_MAX) || 300;       // תקרה יומית לכל המערכת

// Render מריץ את השרת מאחורי פרוקסי - בלי השורה הזו כל הדיווחים ייראו כאילו
// הגיעו מאותה כתובת, וההגבלה הייתה חוסמת את כולם ביחד.
app.set('trust proxy', 1);

const rateHits = new Map();   // כתובת -> מערך חותמות זמן
let dailyCount = 0;
let dailyStamp = new Date().toDateString();

function checkRateLimit(req) {
  const now = Date.now();

  // איפוס המונה היומי בכל יום חדש
  const today = new Date().toDateString();
  if (today !== dailyStamp) {
    dailyStamp = today;
    dailyCount = 0;
  }
  if (dailyCount >= DAILY_MAX) return 'daily';

  const ip = req.ip || 'unknown';
  const windowMs = RATE_WINDOW_MIN * 60 * 1000;
  const recent = (rateHits.get(ip) || []).filter((t) => now - t < windowMs);

  if (recent.length >= RATE_MAX) {
    rateHits.set(ip, recent);
    return 'ip';
  }

  recent.push(now);
  rateHits.set(ip, recent);
  dailyCount += 1;

  // ניקוי תקופתי כדי שהזיכרון לא יתנפח עם הזמן
  if (rateHits.size > 5000) {
    for (const [key, stamps] of rateHits) {
      if (!stamps.some((t) => now - t < windowMs)) rateHits.delete(key);
    }
  }
  return null;
}

// ---- מידלוור ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---- גישת מנהלים: קוד אישי לכל אדם ----
// MANAGER_CODES מוגדר כ: "שם:קוד,שם:קוד". קוד אישי מאפשר לבטל גישה
// לאדם אחד בלי לשנות סיסמה לכולם, ומאפשר לדעת מי שינה כל סטטוס.
function parseManagerCodes() {
  const raw = process.env.MANAGER_CODES || '';
  const map = new Map();
  raw.split(',').forEach((pair) => {
    const idx = pair.lastIndexOf(':');
    if (idx === -1) return;
    const name = pair.slice(0, idx).trim();
    const code = pair.slice(idx + 1).trim();
    if (name && code) map.set(code, name);
  });
  return map;
}

const MANAGER_CODES = parseManagerCodes();

function managerFromReq(req) {
  const code = req.header('x-manager-code') || req.query.code || '';
  if (!code) return null;
  return MANAGER_CODES.get(code) || null;
}

function requireManager(req, res, next) {
  const name = managerFromReq(req);
  if (!name) return res.status(401).json({ error: 'קוד גישה שגוי' });
  req.managerName = name;
  next();
}

// מנהלים לא רואים את שם המדווח - האנונימיות היא מה שמשמר את הנכונות לדווח
function stripReporter(report) {
  const { reporterName, ...rest } = report;
  return rest;
}

function requireAdmin(req, res, next) {
  const supplied = req.header('x-admin-password') || req.query.password || '';
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'לא הוגדרה סיסמת מנהל בשרת (ADMIN_PASSWORD)' });
  }
  if (supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }
  next();
}

// ---- בדיקת תקינות ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- שליחת דיווח חדש (עובד - ללא הרשאה) ----
app.post('/api/reports', (req, res) => {
  const msg = getMessages(req.query.lang);

  // בדיקת הצפה לפני שמתחילים לקבל את התמונה - חוסך תעבורה מיותרת
  const limited = checkRateLimit(req);
  if (limited === 'daily') {
    return res.status(429).json({ error: msg.serverBusy });
  }
  if (limited === 'ip') {
    return res.status(429).json({ error: msg.tooMany(RATE_MAX) });
  }

  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: msg.fileTooBig(MAX_PHOTO_MB) });
      }
      return res.status(400).json({ error: err.message || msg.uploadError });
    }

    const { location, urgency, description, reporterName, locationDetail } = req.body;

    if (!location || !location.trim()) {
      return res.status(400).json({ error: msg.noLocation });
    }
    if (!urgency || !URGENCY_LEVELS.includes(urgency)) {
      return res.status(400).json({ error: msg.noUrgency });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: msg.noDescription });
    }
    if (!req.file) {
      return res.status(400).json({ error: msg.noPhoto });
    }

    const reports = readReports();
    const newReport = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      location: location.trim(),
      locationDetail: (locationDetail || '').trim() || null,
      urgency,
      description: description.trim(),
      reporterName: (reporterName || '').trim() || null,
      photoFilename: req.file.filename,
      status: 'פתוח',
    };
    reports.push(newReport);
    writeReports(reports);

    res.status(201).json({ success: true, id: newReport.id });

    // עדכון Excel + שליחת מייל קורים ברקע ולא מעכבים את התשובה לעובד
    syncExcelAndNotify(reports, newReport).catch((e) => console.error('syncExcelAndNotify:', e));
  });
});

// ---- קבלת רשימת דיווחים (מנהל בלבד) ----
app.get('/api/reports', requireAdmin, (req, res) => {
  let reports = readReports();

  const { status, urgency, location } = req.query;
  if (status) reports = reports.filter((r) => r.status === status);
  if (urgency) reports = reports.filter((r) => r.urgency === urgency);
  if (location) {
    const q = location.toLowerCase();
    reports = reports.filter((r) => r.location.toLowerCase().includes(q));
  }

  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports });
});

// ---- כניסת מנהל עם קוד אישי ----
app.post('/api/manager/login', (req, res) => {
  const { code } = req.body;
  const name = MANAGER_CODES.get((code || '').trim());
  if (!name) return res.status(401).json({ error: 'קוד גישה שגוי' });
  res.json({ success: true, name });
});

// ---- רשימת דיווחים למנהלים (ללא שם המדווח) ----
app.get('/api/manager/reports', requireManager, (req, res) => {
  let reports = readReports();

  const { status, urgency, location } = req.query;
  if (status) reports = reports.filter((r) => r.status === status);
  if (urgency) reports = reports.filter((r) => r.urgency === urgency);
  if (location) {
    const q = location.toLowerCase();
    reports = reports.filter((r) => r.location.toLowerCase().includes(q));
  }

  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports: reports.map(stripReporter), viewer: req.managerName });
});

// ---- עדכון סטטוס בידי מנהל, עם תיעוד מי שינה ----
app.patch('/api/manager/reports/:id', requireManager, (req, res) => {
  const { status } = req.body;
  if (!status || !STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: 'סטטוס לא תקין' });
  }

  const reports = readReports();
  const idx = reports.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'דיווח לא נמצא' });

  reports[idx].status = status;
  reports[idx].statusHistory = reports[idx].statusHistory || [];
  reports[idx].statusHistory.push({
    status,
    by: req.managerName,
    at: new Date().toISOString(),
  });

  writeReports(reports);
  res.json({ success: true, report: stripReporter(reports[idx]) });

  syncExcelAndNotify(reports, null).catch((e) => console.error('syncExcelAndNotify:', e));
});

// ---- עדכון סטטוס דיווח (מנהל בלבד) ----
app.patch('/api/reports/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!status || !STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: 'סטטוס לא תקין' });
  }

  const reports = readReports();
  const idx = reports.findIndex((r) => r.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'דיווח לא נמצא' });
  }

  reports[idx].status = status;
  writeReports(reports);
  res.json({ success: true, report: reports[idx] });

  // מעדכנים את קובץ ה-Excel כדי שישקף את הסטטוס העדכני (בלי לשלוח מייל נוסף)
  syncExcelAndNotify(reports, null).catch((e) => console.error('syncExcelAndNotify:', e));
});

// ---- הורדת קובץ ה-Excel המרכזי בכל רגע נתון (מנהל בלבד) ----
app.get('/api/admin/export.xlsx', requireAdmin, async (req, res) => {
  try {
    const reports = readReports();
    await buildReportsWorkbook(reports, UPLOADS_DIR, REPORTS_XLSX);
    res.download(REPORTS_XLSX, 'דיווחי-בטיחות.xlsx');
  } catch (e) {
    console.error('שגיאה בייצוא Excel:', e);
    res.status(500).json({ error: 'שגיאה בהפקת קובץ Excel' });
  }
});

// ---- משיכת הנתונים לקובץ Excel ברשת המפעלית ----
// קובץ Excel שיושב על שרת הקבצים הפנימי מתחבר לכתובת הזו ומרענן את עצמו.
// ההרשאה היא מפתח בכתובת ולא סיסמה, כי Excel לא יודע להזין סיסמאות.
// המפתח ניתן להחלפה בכל רגע דרך משתנה הסביבה, וזה מבטל גישה מיידית.
function requireExportToken(req, res, next) {
  const token = process.env.EXPORT_TOKEN || '';
  if (!token) return res.status(404).json({ error: 'משיכת נתונים אינה מופעלת' });
  if ((req.query.token || '') !== token) {
    return res.status(401).json({ error: 'מפתח גישה שגוי' });
  }
  next();
}

function toCsv(reports) {
  const headers = ['תאריך ושעה', 'מיקום', 'פירוט מדויק', 'דחיפות', 'תיאור המפגע', 'מדווח', 'סטטוס', 'קישור לתמונה'];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const base = PUBLIC_URL.replace(/\/$/, '');

  const rows = [...reports]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((r) => [
      new Date(r.createdAt).toLocaleString('he-IL', { timeZone: process.env.TIMEZONE || 'Asia/Jerusalem' }),
      r.location,
      r.locationDetail || '',
      r.urgency,
      r.description,
      r.reporterName || 'אנונימי',
      r.status,
      r.photoFilename && base ? `${base}/uploads/${r.photoFilename}` : '',
    ].map(esc).join(','));

  // BOM כדי ש-Excel יזהה עברית ורוסית כראוי ולא יציג ג'יבריש
  return '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n');
}

app.get('/api/export.csv', requireExportToken, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(toCsv(readReports()));
});

app.get('/api/export-file.xlsx', requireExportToken, async (req, res) => {
  try {
    const reports = readReports();
    await buildReportsWorkbook(reports, UPLOADS_DIR, REPORTS_XLSX);
    res.download(REPORTS_XLSX, 'דיווחי-בטיחות.xlsx');
  } catch (e) {
    console.error('שגיאה בייצוא Excel:', e);
    res.status(500).json({ error: 'שגיאה בהפקת קובץ Excel' });
  }
});

// ---- בדיקת סיסמת מנהל (עבור מסך הכניסה בממשק הניהול) ----
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'לא הוגדרה סיסמת מנהל בשרת' });
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }
  res.json({ success: true });
});

// ---- סיכום יומי אוטומטי בדואר ----
// DIGEST_HOUR קובע את השעה (0-23). ריק = כבוי.
// נבדק כל דקה, ונשלח פעם אחת ביום בלבד.
const DIGEST_HOUR = process.env.DIGEST_HOUR === '' || process.env.DIGEST_HOUR === undefined
  ? null
  : Number(process.env.DIGEST_HOUR);

let lastDigestDay = null;

async function maybeSendDigest() {
  if (DIGEST_HOUR === null || Number.isNaN(DIGEST_HOUR)) return;
  if (!isMailConfigured()) return;

  const tz = process.env.TIMEZONE || 'Asia/Jerusalem';
  const now = new Date();
  const hour = Number(now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false }));
  const day = now.toLocaleDateString('en-CA', { timeZone: tz });

  if (hour !== DIGEST_HOUR || day === lastDigestDay) return;
  lastDigestDay = day;

  try {
    const reports = readReports();
    await buildReportsWorkbook(reports, UPLOADS_DIR, REPORTS_XLSX);
    const result = await sendDigestEmail({ reports, excelPath: REPORTS_XLSX });
    if (result.sent) {
      console.log(`📧 סיכום יומי נשלח (${result.openCount} מפגעים פתוחים)`);
    }
  } catch (e) {
    console.error('שגיאה בשליחת סיכום יומי:', e.message);
  }
}

if (DIGEST_HOUR !== null && !Number.isNaN(DIGEST_HOUR)) {
  setInterval(maybeSendDigest, 60 * 1000);
  console.log(`🕐 סיכום יומי מתוזמן לשעה ${DIGEST_HOUR}:00`);
}

app.listen(PORT, () => {
  console.log(`🚧 שרת דיווחי בטיחות פועל על פורט ${PORT}`);
  console.log(`   טופס עובדים: http://localhost:${PORT}/`);
  console.log(`   ממשק ניהול:  http://localhost:${PORT}/admin.html`);
});
