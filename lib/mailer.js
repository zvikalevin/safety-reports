// שליחת מייל אוטומטי עם קובץ Excel מצורף בכל דיווח חדש
// עובד מול כל שרת SMTP רגיל - כולל Outlook/Office 365, Gmail וכו'

// נטענת רק כשבאמת שולחים מייל, כדי לא להאט את עליית השרת
let nodemailer = null;

function isMailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.MAIL_TO
  );
}

let cachedTransporter = null;

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (cachedTransporter) return cachedTransporter;

  if (!nodemailer) nodemailer = require('nodemailer');

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true', // true ל-465, false (עם STARTTLS) ל-587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
}

async function sendNewReportEmail({ report, excelPath, photoPath, minimal = false }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('⚠️  שליחת מייל דולגה - הגדרות SMTP חסרות ב-.env (ראה README)');
    return { skipped: true };
  }

  const recipients = process.env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  // ---- מצב מינימלי: פרטי הדיווח והתמונה, בלי קישורים ובלי קובץ Excel ----
  // התמונה מוטמעת בגוף ההודעה (cid) ולא כצרופה נפרדת - כך היא נראית מיד
  // בפתיחה, נשארת בהודעה גם כשמעבירים אותה הלאה, ולא נחסמת ע"י מסנני קישורים.
  if (minimal) {
    const embedPhoto = photoPath && process.env.MAIL_PHOTO !== 'false';
    const dateStr = new Date(report.createdAt).toLocaleString('he-IL', {
      timeZone: process.env.TIMEZONE || 'Asia/Jerusalem',
    });
    const place = report.locationDetail
      ? `${report.location} - ${report.locationDetail}`
      : report.location;
    const colors = {
      'נמוך': '#2e9e4f', 'בינוני': '#e8a800', 'גבוה': '#e0570e', 'קריטי': '#d1293d',
    };
    const color = colors[report.urgency] || '#6b7480';
    // MAIL_SUBJECT קובע נוסח קבוע לשורת הנושא. אם לא הוגדר, הנושא כולל
    // דחיפות ומיקום כדי לאפשר תעדוף מיידי בלי לפתוח את ההודעה.
    const subject = process.env.MAIL_SUBJECT
      ? process.env.MAIL_SUBJECT
      : `נפתח מפגע [${report.urgency}] - ${report.location}`;

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 15px; color: #1a2733;">
        <p style="margin:0 0 4px; font-size:13px; color:#6b7480;">דיווח מפגע בטיחות חדש</p>
        <h2 style="margin:0 0 14px; font-size:20px;">
          ${escapeHtml(place)}
          <span style="background:${color}; color:#fff; padding:3px 12px; border-radius:12px; font-size:14px; margin-right:6px;">${escapeHtml(report.urgency)}</span>
        </h2>
        <p style="margin:0 0 14px; font-size:16px;">${escapeHtml(report.description)}</p>
        ${embedPhoto ? `<img src="cid:hazardphoto" style="max-width:520px; width:100%; border-radius:8px; border:1px solid #d8dce1;" />` : ''}
        <table style="border-collapse:collapse; margin-top:16px; font-size:14px; color:#4a5560;">
          <tr><td style="padding:3px 10px 3px 0;">מדווח</td><td style="padding:3px 10px;">${escapeHtml(report.reporterName || 'אנונימי')}</td></tr>
          <tr><td style="padding:3px 10px 3px 0;">תאריך</td><td style="padding:3px 10px;">${dateStr}</td></tr>
        </table>
      </div>`;

    await transporter.sendMail({
      from,
      to: recipients.join(','),
      subject,
      text:
        `דיווח: ${report.description}\n` +
        `מיקום: ${place}\n` +
        `דחיפות: ${report.urgency}\n` +
        `מדווח: ${report.reporterName || 'אנונימי'}\n` +
        `תאריך: ${dateStr}`,
      html,
      attachments: embedPhoto
        ? [{ filename: 'מפגע.jpg', path: photoPath, cid: 'hazardphoto' }]
        : [],
    });
    return { sent: true, to: recipients, minimal: true, photo: Boolean(embedPhoto) };
  }

  const urgencyColors = {
    'נמוך': '#2e9e4f',
    'בינוני': '#e8a800',
    'גבוה': '#e0570e',
    'קריטי': '#d1293d',
  };
  const color = urgencyColors[report.urgency] || '#6b7480';

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 14px; color: #1a2733;">
      <h2 style="margin-bottom: 4px;">דיווח מפגע בטיחות חדש</h2>
      <p style="color:#6b7480; margin-top:0;">התקבל דיווח חדש במערכת - הפרטים המלאים מצורפים כקובץ Excel.</p>
      <table style="border-collapse: collapse; margin-top: 12px;">
        <tr><td style="padding:6px 10px; font-weight:bold;">מיקום</td><td style="padding:6px 10px;">${escapeHtml(report.location)}${report.locationDetail ? ' - ' + escapeHtml(report.locationDetail) : ''}</td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">רמת דחיפות</td><td style="padding:6px 10px;"><span style="background:${color}; color:white; padding:3px 10px; border-radius:12px; font-weight:bold;">${escapeHtml(report.urgency)}</span></td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">תיאור</td><td style="padding:6px 10px;">${escapeHtml(report.description)}</td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">מדווח</td><td style="padding:6px 10px;">${escapeHtml(report.reporterName || 'אנונימי')}</td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">תאריך</td><td style="padding:6px 10px;">${new Date(report.createdAt).toLocaleString('he-IL', { timeZone: process.env.TIMEZONE || 'Asia/Jerusalem' })}</td></tr>
      </table>
      <p style="margin-top:16px; color:#6b7480; font-size:12px;">קובץ ה-Excel המצורף מכיל את כל הדיווחים העדכניים במערכת, כולל תמונות.</p>
    </div>
  `;

  const attachments = [
    {
      filename: 'דיווחי-בטיחות.xlsx',
      path: excelPath,
    },
  ];
  if (photoPath) {
    attachments.push({ filename: 'תמונת-המפגע' + require('path').extname(photoPath), path: photoPath });
  }

  await transporter.sendMail({
    from,
    to: recipients.join(','),
    subject: `דיווח בטיחות חדש [${report.urgency}] - ${report.location}`,
    html,
    attachments,
  });

  return { sent: true, to: recipients };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- סיכום תקופתי עם קובץ Excel מצורף ----
// היתרון מבחינת אבטחה: המידע נדחף החוצה בדואר, ערוץ שכבר מאושר בארגון.
// אין צורך שמישהו ברשת המפעלית יפתח חיבור החוצה, ואין מפתח שיכול לדלוף.
async function sendDigestEmail({ reports, excelPath }) {
  const transporter = getTransporter();
  if (!transporter) return { skipped: true };

  const recipients = process.env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  const open = reports.filter((r) => r.status === 'פתוח');
  const critical = open.filter((r) => r.urgency === 'קריטי');
  const inProgress = reports.filter((r) => r.status === 'בטיפול');
  const today = new Date().toLocaleDateString('he-IL', {
    timeZone: process.env.TIMEZONE || 'Asia/Jerusalem',
  });

  const lines = [
    `סיכום מפגעי בטיחות - ${today}`,
    '',
    `סה"כ דיווחים במערכת: ${reports.length}`,
    `פתוחים: ${open.length}`,
    `בטיפול: ${inProgress.length}`,
    `קריטיים שטרם טופלו: ${critical.length}`,
    '',
  ];

  if (critical.length) {
    lines.push('מפגעים קריטיים פתוחים:');
    critical.forEach((r) => {
      const place = r.locationDetail ? `${r.location} - ${r.locationDetail}` : r.location;
      lines.push(`  • ${place}: ${r.description}`);
    });
    lines.push('');
  }

  lines.push('הקובץ המצורף מכיל את כל הדיווחים, כולל תמונות.');

  await transporter.sendMail({
    from,
    to: recipients.join(','),
    subject: `סיכום מפגעי בטיחות ${today} - ${open.length} פתוחים, ${critical.length} קריטיים`,
    text: lines.join('\n'),
    attachments: excelPath ? [{ filename: 'דיווחי-בטיחות.xlsx', path: excelPath }] : [],
  });

  return { sent: true, to: recipients, openCount: open.length };
}

module.exports = { sendNewReportEmail, sendDigestEmail, isMailConfigured };
