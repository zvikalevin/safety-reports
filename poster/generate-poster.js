// יצירת פוסטר QR דו-לשוני (עברית + רוסית) להדפסה ותלייה על לוח המודעות
// שימוש: node poster/generate-poster.js https://your-app-url.com

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const url = process.argv[2];
const logoFile = path.join(__dirname, 'logo.png');
const hasLogo = fs.existsSync(logoFile);
// גודל הדף: A4 (ברירת מחדל) או A3 לתלייה במקומות פתוחים
const size = (process.argv[3] || 'A4').toUpperCase() === 'A3' ? 'A3' : 'A4';

if (!url) {
  console.error('❌ יש להעביר את כתובת האפליקציה כפרמטר, לדוגמה:');
  console.error('   node poster/generate-poster.js https://my-safety-app.onrender.com');
  console.error('   node poster/generate-poster.js https://my-safety-app.onrender.com A3');
  process.exit(1);
}

// A3 הוא בדיוק פי 1.414 מ-A4 בכל ממד, אז מגדילים הכל באותו יחס
const K = size === 'A3' ? 1.414 : 1;
const px = (n) => Math.round(n * K);
const pageW = size === 'A3' ? 297 : 210;
const pageH = size === 'A3' ? 420 : 297;

const outDir = __dirname;
const qrPath = path.join(outDir, 'qrcode.png');
const posterPath = path.join(outDir, `poster-${size}.html`);

QRCode.toFile(qrPath, url, { width: 900, margin: 2 }, (err) => {
  if (err) {
    console.error('שגיאה ביצירת קוד ה-QR:', err);
    process.exit(1);
  }

  const html = `<!DOCTYPE html>
<html lang="he">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>פוסטר דיווח מפגעי בטיחות / Плакат сообщения о нарушении</title>
<style>
  @page { size: ${size}; margin: 0; }
  * { box-sizing: border-box; forced-color-adjust: none; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background: #ffffff;
    color-scheme: light only;
  }
  /* הפוסטר תופס את הדף כולו. בלי זה התוכן נדחס לחלק העליון
     ונשאר שטח לבן בתחתית בהדפסה. */
  /* מנוע ההדפסה לא תומך ב-margin-top:auto בתוך flex בגובה קבוע,
     ולכן התחתית מוצמדת עם position:absolute במקום. */
  .poster {
    width: ${pageW}mm;
    height: ${pageH}mm;
    background: #ffffff;
    position: relative;
    box-sizing: border-box;
    color: #1a2733;
    text-align: center;
    overflow: hidden;
  }
  .head {
    width: 100%;
    background: #1a2733;
    color: white;
    position: relative;
    padding: ${px(30)}px ${px(20)}px ${px(26)}px;
  }
  .icon { font-size: ${px(46)}px; }
  /* לוגו החברה בפינה השמאלית העליונה */
  /* הלוגו על רקע לבן - הטקסט שלו כהה ועל הרקע הכהה של הפוסטר הוא לא היה נקרא */
  .logo-box {
    position: absolute;
    top: ${px(16)}px;
    left: ${px(18)}px;
    background: #ffffff;
    border-radius: ${px(8)}px;
    padding: ${px(9)}px ${px(13)}px;
    line-height: 0;
  }
  .logo-box img {
    width: ${px(132)}px;
    height: auto;
    display: block;
  }
  .head h1 {
    font-size: ${px(40)}px;
    margin: ${px(6)}px 0 ${px(2)}px;
    color: #ff6b1a;
  }
  .head h1.ru { font-size: ${px(31)}px; color: #ffffff; margin-bottom: ${px(10)}px; }
  .head h2 {
    font-size: ${px(20)}px;
    margin: 0;
    font-weight: 400;
    color: rgba(255,255,255,0.85);
  }
  .head h2.ru { margin-top: 4px; }
  .divider {
    width: ${px(60)}px;
    height: ${px(3)}px;
    background: #ff6b1a;
    margin: ${px(14)}px auto 0;
    border-radius: 2px;
  }
  /* inline-block כדי שהמסגרת תתכווץ לגודל התמונה ותתמרכז,
     במקום להימתח לכל רוחב העמוד */
  .qr-card {
    background: white;
    border: 2px solid #d8dce1;
    border-radius: ${px(20)}px;
    padding: ${px(20)}px;
    margin: ${px(28)}px auto ${px(8)}px;
    display: inline-block;
  }
  .qr-card img { width: ${px(300)}px; height: ${px(300)}px; display: block; }
  .no-account {
    font-size: ${px(17)}px;
    color: #4a5560;
    max-width: ${px(560)}px;
    margin: 0 auto ${px(20)}px;
    line-height: 1.5;
  }
  .steps-wrap {
    display: flex;
    width: 100%;
    max-width: ${px(760)}px;
    gap: ${px(24)}px;
    padding: 0 ${px(26)}px;
    margin: ${px(10)}px auto 0;
  }
  .steps-col {
    flex: 1;
    text-align: right;
    direction: rtl;
  }
  .steps-col.ru {
    text-align: left;
    direction: ltr;
  }
  .steps-col-title {
    font-size: ${px(18)}px;
    font-weight: bold;
    color: #ff6b1a;
    margin-bottom: ${px(10)}px;
    text-transform: uppercase;
  }
  .steps-col div.step {
    font-size: ${px(19)}px;
    margin-bottom: ${px(15)}px;
    display: flex;
    align-items: flex-start;
    gap: ${px(8)}px;
    line-height: 1.4;
  }
  .steps-col.ru div.step { flex-direction: row; }
  .step-num {
    background: #1a2733;
    color: white;
    width: ${px(28)}px;
    height: ${px(28)}px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: ${px(15)}px;
    flex-shrink: 0;
  }
  .footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: ${px(18)}px ${px(20)}px ${px(26)}px;
    color: #4a5560;
    font-size: ${px(15)}px;
    line-height: 1.6;
  }
</style>
</head>
<body>
  <div class="poster">
    <div class="head">
      ${hasLogo ? '<div class="logo-box"><img src="logo.png" alt="Shladot" /></div>' : ''}
      <div class="icon">⚠️</div>
      <h1>ראית מפגע בטיחות?</h1>
      <h1 class="ru">Заметили нарушение безопасности?</h1>
      <h2>סרוק, צלם ודווח - זה לוקח שתי דקות</h2>
      <h2 class="ru">Сканируйте, фотографируйте, сообщайте - две минуты</h2>
    </div>

    <div class="qr-card">
      <img src="qrcode.png" alt="QR" />
    </div>
    <div class="no-account">
      אין צורך בהתקנת אפליקציה, הרשמה או חשבון · Не требуется приложение, регистрация или учётная запись
    </div>

    <div class="steps-wrap">
      <div class="steps-col">
        <div class="steps-col-title">עברית</div>
        <div class="step"><span class="step-num">1</span> סרוק את קוד ה-QR עם מצלמת הטלפון</div>
        <div class="step"><span class="step-num">2</span> צלם את המפגע ותאר אותו בקצרה</div>
        <div class="step"><span class="step-num">3</span> בחר עברית או רוסית ולחץ שלח</div>
      </div>
      <div class="steps-col ru">
        <div class="steps-col-title">Русский</div>
        <div class="step"><span class="step-num">1</span> Отсканируйте QR-код камерой телефона</div>
        <div class="step"><span class="step-num">2</span> Сфотографируйте нарушение и опишите его</div>
        <div class="step"><span class="step-num">3</span> Выберите иврит или русский и отправьте</div>
      </div>
    </div>

    <div class="footer">
      הדיווח יכול להיות גם אנונימי · תודה שאתה שומר עלינו בטוחים<br/>
      Сообщение может быть анонимным · Спасибо, что заботитесь о нашей безопасности
    </div>
  </div>
</body>
</html>
`;

  fs.writeFileSync(posterPath, html, 'utf8');
  console.log('✅ נוצר בהצלחה:');
  console.log('   ' + qrPath);
  console.log('   ' + posterPath + '  (' + size + ')');
  console.log('\nפתח את poster.html בדפדפן והדפס (Ctrl+P) לקובץ PDF או ישירות למדפסת.');
});
