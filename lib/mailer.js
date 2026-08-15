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

    // מייל נבנה על טבלאות ובסגנונות inline בלבד. Outlook מרנדר HTML
    // במנוע של Word, ששובר flexbox, border-radius ו-CSS מודרני בכלל.
    const row = (label, value) => `
              <tr>
                <td style="padding:11px 12px; background:#f4f5f7; border-bottom:1px solid #e3e6ea; font-weight:bold; width:33%; vertical-align:top; text-align:right;">${label}</td>
                <td style="padding:11px 14px; border-bottom:1px solid #e3e6ea; vertical-align:top; text-align:right;">${value}</td>
              </tr>`;

    // מבנה נוזלי (width="100%") ולא רוחב קבוע בפיקסלים. Outlook לא משבר
    // שורות כשהתוכן רחב מהחלון - הוא מקטין את כל ההודעה. זה בלט במיוחד
    // בהעברת הודעה, כי ההזחה שנוספת מצמצמת את הרוחב הזמין.
    const html = `<table dir="rtl" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; background:#eef0f3; font-family:Arial,Helvetica,sans-serif;">
 <tr>
  <td align="center" style="padding:18px 8px;">
  <!--[if mso]><table role="presentation" width="520" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table dir="rtl" role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:520px; max-width:100%; background:#ffffff; border:1px solid #d8dce1;">

    <tr>
      <td style="background:#000000; padding:20px 22px; color:#ffffff; font-size:22px; font-weight:bold; text-align:right;">
        התקבל דיווח על מפגע בטיחות
      </td>
    </tr>

    <tr>
      <td style="padding:22px 22px 4px; font-size:17px; color:#1a2733; line-height:1.7; text-align:right;">
        התקבל דיווח על מפגע בטיחות חדש במפעל, ונדרש טיפול.<br />
        להלן פרטי הדיווח:
      </td>
    </tr>

    <tr>
      <td style="padding:14px 22px 0; text-align:right;">
        <table dir="rtl" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-collapse:collapse; font-size:17px; color:#1a2733; border:1px solid #e3e6ea; text-align:right;">
${row('מיקום', escapeHtml(report.location))}
${report.locationDetail ? row('פירוט מדויק', escapeHtml(report.locationDetail)) : ''}
${row('רמת דחיפות', `<span style="background:${color}; color:#ffffff; padding:4px 14px; font-weight:bold; display:inline-block; font-size:16px;">${escapeHtml(report.urgency)}</span>`)}
${row('תיאור המפגע', escapeHtml(report.description))}
${row('מדווח', escapeHtml(report.reporterName || 'אנונימי'))}
${row('תאריך ושעה', dateStr)}
        </table>
      </td>
    </tr>
${embedPhoto ? `
    <tr>
      <td style="padding:20px 22px 0; text-align:right;">
        <div style="font-size:16px; font-weight:bold; color:#4a5560; padding-bottom:8px; text-align:right;">תמונת המפגע</div>
        <img src="cid:hazardphoto" width="260" style="width:260px; max-width:100%; height:auto; display:block; border:1px solid #d8dce1;" alt="תמונת המפגע" />
      </td>
    </tr>` : ''}

    <tr>
      <td style="padding:22px; font-size:17px; color:#1a2733; line-height:1.7; text-align:right;">
        נא לטפל בהתאם לרמת הדחיפות ולעדכן את סטטוס הטיפול.
      </td>
    </tr>

    <tr>
      <td style="background:#f4f5f7; border-top:1px solid #d8dce1; padding:18px 22px; font-size:15px; color:#4a5560; line-height:1.7; text-align:right;">
        תודה על הטיפול,<br />
        <span style="color:#1a2733; font-weight:bold;">מערכת ניהול בטיחות</span><br />
        הודעה זו נשלחה אוטומטית עם קליטת הדיווח.
      </td>
    </tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
  </td>
 </tr>
</table>`;

    await transporter.sendMail({
      from,
      to: recipients.join(','),
      subject,
      text:
        `התקבל דיווח על מפגע בטיחות חדש במפעל, ונדרש טיפול.\n\n` +
        `מיקום:       ${place}\n` +
        `רמת דחיפות:  ${report.urgency}\n` +
        `תיאור:       ${report.description}\n` +
        `מדווח:       ${report.reporterName || 'אנונימי'}\n` +
        `תאריך ושעה:  ${dateStr}\n\n` +
        `נא לטפל בהתאם לרמת הדחיפות ולעדכן את סטטוס הטיפול.\n\n` +
        `תודה על הטיפול,\n` +
        `מערכת ניהול בטיחות\n` +
        `הודעה זו נשלחה אוטומטית עם קליטת הדיווח.`,
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
