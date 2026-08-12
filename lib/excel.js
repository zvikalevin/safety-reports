// בניית קובץ Excel מרכזי מכל הדיווחים, כולל תמונה מוטמעת בכל שורה

const fs = require('fs');
const path = require('path');

// exceljs היא ספרייה כבדה (כ-15 שניות טעינה על שרת חינמי איטי).
// טוענים אותה רק ברגע שבאמת מייצרים קובץ, כדי שהשרת יעלה מהר.
let ExcelJS = null;
function loadExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

const URGENCY_COLORS = {
  'נמוך': 'FF2E9E4F',
  'בינוני': 'FFE8A800',
  'גבוה': 'FFE0570E',
  'קריטי': 'FFD1293D',
};

async function buildReportsWorkbook(reports, uploadsDir, outPath) {
  const Excel = loadExcelJS();
  const workbook = new Excel.Workbook();
  workbook.creator = 'מערכת דיווח מפגעי בטיחות';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('דיווחים', {
    views: [{ rightToLeft: true }],
  });

  sheet.columns = [
    { header: '#', key: 'idx', width: 5 },
    { header: 'תאריך ושעה', key: 'date', width: 18 },
    { header: 'מיקום', key: 'location', width: 20 },
    { header: 'פירוט מדויק', key: 'locationDetail', width: 24 },
    { header: 'דחיפות', key: 'urgency', width: 12 },
    { header: 'תיאור המפגע', key: 'description', width: 45 },
    { header: 'מדווח', key: 'reporter', width: 16 },
    { header: 'סטטוס', key: 'status', width: 12 },
    { header: 'תמונה', key: 'photo', width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A2733' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 22;

  const sorted = [...reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  let rowIndex = 2;
  for (const [i, r] of sorted.entries()) {
    const row = sheet.getRow(rowIndex);
    row.height = 70;
    row.getCell(1).value = i + 1;
    row.getCell(2).value = new Date(r.createdAt).toLocaleString('he-IL');
    row.getCell(3).value = r.location;
    row.getCell(4).value = r.locationDetail || '';
    row.getCell(5).value = r.urgency;
    row.getCell(6).value = r.description;
    row.getCell(7).value = r.reporterName || 'אנונימי';
    row.getCell(8).value = r.status;

    row.getCell(5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: URGENCY_COLORS[r.urgency] || 'FFEFEFEF' },
    };
    row.getCell(5).font = { color: { argb: 'FFFFFFFF' }, bold: true };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };

    for (let c = 1; c <= 9; c++) {
      row.getCell(c).alignment = {
        ...(row.getCell(c).alignment || {}),
        vertical: 'middle',
        wrapText: c === 6,
      };
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD8DCE1' } },
        bottom: { style: 'thin', color: { argb: 'FFD8DCE1' } },
        left: { style: 'thin', color: { argb: 'FFD8DCE1' } },
        right: { style: 'thin', color: { argb: 'FFD8DCE1' } },
      };
    }

    // הטמעת תמונה בעמודה האחרונה
    if (r.photoFilename) {
      const photoPath = path.join(uploadsDir, r.photoFilename);
      if (fs.existsSync(photoPath)) {
        try {
          const ext = path.extname(photoPath).toLowerCase();
          const extension = ext === '.png' ? 'png' : 'jpeg';
          const imageId = workbook.addImage({
            filename: photoPath,
            extension,
          });
          sheet.addImage(imageId, {
            tl: { col: 8, row: rowIndex - 1 },
            ext: { width: 90, height: 90 },
            editAs: 'oneCell',
          });
        } catch (e) {
          row.getCell(9).value = '(שגיאה בטעינת תמונה)';
        }
      } else {
        row.getCell(9).value = '(תמונה לא נמצאה)';
      }
    }

    rowIndex += 1;
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 8 },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1, rightToLeft: true }];

  await workbook.xlsx.writeFile(outPath);
  return outPath;
}

module.exports = { buildReportsWorkbook };
