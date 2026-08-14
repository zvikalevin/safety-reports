(function () {
  const TRANSLATIONS = {
    he: {
      dir: 'rtl',
      title: 'דיווח מפגע בטיחות',
      intro: 'ראית מפגע בטיחות? צלם ודווח בשתי דקות. אפשר לדווח גם בעילום שם.',
      photoLabel: 'תמונת המפגע',
      photoPlaceholder: 'לחץ כדי לצלם או לבחור תמונה',
      retake: 'צלם מחדש',
      locationLabel: 'מיקום במפעל',
      locationPlaceholder: 'למשל: מחסן 3, קו ייצור B, מסדרון ראשי',
      urgencyLabel: 'רמת דחיפות / סיכון',
      urgencyLow: 'נמוך',
      urgencyMedium: 'בינוני',
      urgencyHigh: 'גבוה',
      urgencyCritical: 'קריטי',
      descLabel: 'תיאור המפגע',
      descPlaceholder: 'מה קרה? מה הסיכון? מאז מתי זה קיים?',
      reporterLabel: 'שם מדווח (אופציונלי)',
      reporterPlaceholder: 'ניתן להשאיר ריק לדיווח אנוני',
      submit: 'שלח דיווח',
      successTitle: 'תודה, הדיווח נשלח!',
      successBody: 'הדיווח התקבל ויטופל בהקדם. תודה שאתה עוזר לשמור על מקום עבודה בטוח.',
      newReport: 'דווח על מפגע נוסף',
      errNoPhoto: 'נא לצרף תמונה של המפגע',
      errNoUrgency: 'נא לבחור רמת דחיפות',
      errGeneric: 'אירעה שגיאה, נסה שוב',
      errNetwork: 'בעיית תקשורת - בדוק חיבור לאינטרנט ונסה שוב',
      locationChoose: 'בחר מיקום...',
      locationDetailLabel: 'פירוט מדויק (רשות)',
      locationDetailPlaceholder: 'למשל: ליד מכונה 3, בפינה הצפונית',
      errNoLocation: 'נא לבחור מיקום במפעל',
      locations: ['חצר', 'אולם ייצור', 'מחסן', 'מחלקת צבע', 'מחלקת הכנות', 'מוסך', 'מיכליות', 'מחלקת הנדסה', 'משרדים', 'משרדי גלריה', 'אחר'],
    },
    ru: {
      dir: 'ltr',
      title: 'Сообщение о нарушении безопасности',
      intro: 'Заметили нарушение техники безопасности? Сфотографируйте и сообщите за две минуты. Можно сообщить анонимно.',
      photoLabel: 'Фото нарушения',
      photoPlaceholder: 'Нажмите, чтобы сфотографировать или выбрать фото',
      retake: 'Переснять',
      locationLabel: 'Место на заводе',
      locationPlaceholder: 'Например: склад 3, линия B, главный коридор',
      urgencyLabel: 'Уровень срочности / риска',
      urgencyLow: 'Низкий',
      urgencyMedium: 'Средний',
      urgencyHigh: 'Высокий',
      urgencyCritical: 'Критический',
      descLabel: 'Описание нарушения',
      descPlaceholder: 'Что произошло? В чём риск? С каких пор это существует?',
      reporterLabel: 'Имя (необязательно)',
      reporterPlaceholder: 'Можно оставить пустым для анонимного сообщения',
      submit: 'Отправить сообщение',
      successTitle: 'Спасибо, сообщение отправлено!',
      successBody: 'Сообщение получено и будет обработано в ближайшее время. Спасибо, что помогаете обеспечивать безопасность на рабочем месте.',
      newReport: 'Сообщить ещё раз',
      errNoPhoto: 'Пожалуйста, прикрепите фото нарушения',
      errNoUrgency: 'Пожалуйста, выберите уровень срочности',
      errGeneric: 'Произошла ошибка, попробуйте снова',
      errNetwork: 'Проблема с подключением - проверьте интернет и попробуйте снова',
      locationChoose: 'Выберите место...',
      locationDetailLabel: 'Точное место (необязательно)',
      locationDetailPlaceholder: 'Например: возле станка 3, в северном углу',
      errNoLocation: 'Пожалуйста, выберите место на заводе',
      locations: ['Двор', 'Производственный цех', 'Склад', 'Покрасочный цех', 'Отдел подготовки', 'Гараж', 'Автоцистерны', 'Инженерный отдел', 'Офисы', 'Офисы на галерее', 'Другое'],
    },
  };

  const LANG_KEY = 'safetyReportLang';

  const form = document.getElementById('reportForm');
  const photoBox = document.getElementById('photoBox');
  const photoInput = document.getElementById('photoInput');
  const photoPreview = document.getElementById('photoPreview');
  const photoPlaceholder = document.getElementById('photoPlaceholder');
  const retakeBtn = document.getElementById('retakeBtn');
  const urgencyButtons = document.querySelectorAll('.urgency-btn');
  const urgencyInput = document.getElementById('urgencyInput');
  const formError = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const submitSpinner = document.getElementById('submitSpinner');
  const successScreen = document.getElementById('successScreen');
  const newReportBtn = document.getElementById('newReportBtn');
  const langField = document.getElementById('langField');
  const langButtons = document.querySelectorAll('.lang-btn');
  const locationInput = document.getElementById('locationInput');

  let currentLang = 'he';

  function applyLanguage(lang) {
    if (!TRANSLATIONS[lang]) lang = 'he';
    currentLang = lang;
    const t = TRANSLATIONS[lang];

    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.title = t.title;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (t[key] !== undefined) el.textContent = t[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (t[key] !== undefined) el.placeholder = t[key];
    });

    // בונים מחדש את רשימת המיקומים בשפה הנוכחית.
    // הערך שנשמר הוא תמיד בעברית, גם כשהעובד בחר מהרשימה הרוסית - כך
    // הטבלה, האקסל וממשק הניהול נשארים אחידים ולא צריך לתרגם אותם.
    const previousLocation = locationInput.value;
    locationInput.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = t.locationChoose;
    locationInput.appendChild(placeholder);

    TRANSLATIONS.he.locations.forEach((canonical, i) => {
      const opt = document.createElement('option');
      opt.value = canonical;
      opt.textContent = t.locations[i] || canonical;
      locationInput.appendChild(opt);
    });

    locationInput.value = previousLocation;
    if (!locationInput.value) placeholder.selected = true;

    langButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    langField.value = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (e) {
      /* ignore */
    }
  }

  langButtons.forEach((btn) => {
    btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
  });

  let savedLang = 'he';
  try {
    savedLang = localStorage.getItem(LANG_KEY) || 'he';
  } catch (e) {
    /* ignore */
  }
  applyLanguage(savedLang);

  // בחירת/צילום תמונה
  photoBox.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    photoPreview.src = url;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
    retakeBtn.hidden = false;
  });

  retakeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    photoInput.value = '';
    photoPreview.hidden = true;
    photoPlaceholder.hidden = false;
    retakeBtn.hidden = true;
  });

  // בחירת רמת דחיפות (הערך הפנימי תמיד בעברית, בלי קשר לשפת התצוגה)
  urgencyButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      urgencyButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      urgencyInput.value = btn.dataset.value;
    });
  });

  function showError(msg) {
    formError.textContent = msg;
    formError.hidden = false;
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function clearError() {
    formError.hidden = true;
    formError.textContent = '';
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitLabel.hidden = loading;
    submitSpinner.hidden = !loading;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const t = TRANSLATIONS[currentLang];

    if (!photoInput.files[0]) {
      showError(t.errNoPhoto);
      return;
    }
    if (!locationInput.value) {
      showError(t.errNoLocation);
      return;
    }
    if (!urgencyInput.value) {
      showError(t.errNoUrgency);
      return;
    }

    const formData = new FormData(form);

    setLoading(true);
    try {
      const res = await fetch(`/api/reports?lang=${encodeURIComponent(currentLang)}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || t.errGeneric);
        setLoading(false);
        return;
      }

      form.hidden = true;
      successScreen.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showError(t.errNetwork);
    } finally {
      setLoading(false);
    }
  });

  newReportBtn.addEventListener('click', () => {
    form.reset();
    photoPreview.hidden = true;
    photoPlaceholder.hidden = false;
    retakeBtn.hidden = true;
    urgencyButtons.forEach((b) => b.classList.remove('selected'));
    urgencyInput.value = '';
    clearError();
    form.hidden = false;
    successScreen.hidden = true;
    langField.value = currentLang;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
