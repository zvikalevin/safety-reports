// שרת דיווחי מפגעי בטיחות במפעל
// Express + אחסון קבצים פשוט (JSON) - ללא מסד נתונים חיצוני, ללא חשבון Google/Microsoft

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildReportsWorkbook } = require('./lib/excel');
const { sendNewReportEmail, isMailConfigured } = require('./lib/mailer');

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
    tooMany: 'נשלחו יותר מדי דיווחים מהמכשיר הזה. נסה שוב בעוד כשעה, או פנה לממונה הבטיחות אם מדובר במפגע דחוף.',
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
    tooMany: 'С этого устройства отправлено слишком много сообщений. Попробуйте через час или обратитесь к инженеру по безопасности, если нарушение срочное.',
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
  console.warn('ℹ️  שליחת מייל אוטומטי אינה מוגדרת (ראה README) - הדיווחים יישמרו אך לא יישלח מייל.\n');
}

// ---- עדכון קובץ ה-Excel המרכזי, ושליחת מייל עבור דיווח חדש (לא חוסם את התשובה לעובד) ----
async function syncExcelAndNotify(reports, newReport) {
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

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024 },
});

// ---- הגבלת קצב דיווחים (הגנה מפני הצפה) ----
// כל הערכים ניתנים לשינוי דרך משתני סביבה ב-Render, בלי לגעת בקוד.
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 10;          // דיווחים מותרים לכל מכשיר
const RATE_WINDOW_MIN = Number(process.env.RATE_LIMIT_WINDOW_MIN) || 60; // בתוך כמה דקות
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
    return res.status(429).json({ error: msg.tooMany });
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

app.listen(PORT, () => {
  console.log(`🚧 שרת דיווחי בטיחות פועל על פורט ${PORT}`);
  console.log(`   טופס עובדים: http://localhost:${PORT}/`);
  console.log(`   ממשק ניהול:  http://localhost:${PORT}/admin.html`);
});
