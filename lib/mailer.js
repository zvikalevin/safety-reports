// שליחת מייל אוטומטי עם קובץ Excel מצורף בכל דיווח חדש
// עובד מול כל שרת SMTP רגיל - כולל Outlook/Office 365, Gmail וכו'

const nodemailer = require('nodemailer');

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

async function sendNewReportEmail({ report, excelPath, photoPath }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('⚠️  שליחת מייל דולגה - הגדרות SMTP חסרות ב-.env (ראה README)');
    return { skipped: true };
  }

  const recipients = process.env.MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

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
        <tr><td style="padding:6px 10px; font-weight:bold;">מיקום</td><td style="padding:6px 10px;">${escapeHtml(report.location)}</td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">רמת דחיפות</td><td style="padding:6px 10px;"><span style="background:${color}; color:white; padding:3px 10px; border-radius:12px; font-weight:bold;">${escapeHtml(report.urgency)}</span></td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">תיאור</td><td style="padding:6px 10px;">${escapeHtml(report.description)}</td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">מדווח</td><td style="padding:6px 10px;">${escapeHtml(report.reporterName || 'אנונימי')}</td></tr>
        <tr><td style="padding:6px 10px; font-weight:bold;">תאריך</td><td style="padding:6px 10px;">${new Date(report.createdAt).toLocaleString('he-IL')}</td></tr>
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

module.exports = { sendNewReportEmail, isMailConfigured };
