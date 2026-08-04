(function () {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  const exportBtn = document.getElementById('exportBtn');

  const summaryBar = document.getElementById('summaryBar');
  const reportsList = document.getElementById('reportsList');
  const emptyState = document.getElementById('emptyState');

  const filterStatus = document.getElementById('filterStatus');
  const filterUrgency = document.getElementById('filterUrgency');
  const filterLocation = document.getElementById('filterLocation');
  const refreshBtn = document.getElementById('refreshBtn');

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');

  const SESSION_KEY = 'safetyAdminPassword';

  function getPassword() {
    return sessionStorage.getItem(SESSION_KEY);
  }

  function setPassword(pw) {
    sessionStorage.setItem(SESSION_KEY, pw);
  }

  function clearPassword() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function tryLogin(password) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  }

  function showDashboard() {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    loadReports();
  }

  function showLogin() {
    dashboard.hidden = true;
    loginScreen.hidden = false;
  }

  loginBtn.addEventListener('click', async () => {
    const pw = passwordInput.value;
    if (!pw) return;
    loginError.hidden = true;
    const ok = await tryLogin(pw);
    if (ok) {
      setPassword(pw);
      showDashboard();
    } else {
      loginError.textContent = 'סיסמה שגויה';
      loginError.hidden = false;
    }
  });

  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn.addEventListener('click', () => {
    clearPassword();
    showLogin();
  });

  exportBtn.addEventListener('click', async () => {
    const pw = getPassword();
    exportBtn.disabled = true;
    const originalLabel = exportBtn.textContent;
    exportBtn.textContent = 'מוריד...';
    try {
      const res = await fetch('/api/admin/export.xlsx', {
        headers: { 'x-admin-password': pw },
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'דיווחי-בטיחות.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('שגיאה בהורדת קובץ ה-Excel');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalLabel;
    }
  });

  async function loadReports() {
    const pw = getPassword();
    const params = new URLSearchParams();
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (filterUrgency.value) params.set('urgency', filterUrgency.value);
    if (filterLocation.value) params.set('location', filterLocation.value);

    const res = await fetch(`/api/reports?${params.toString()}`, {
      headers: { 'x-admin-password': pw },
    });

    if (res.status === 401) {
      clearPassword();
      showLogin();
      return;
    }

    const data = await res.json();
    renderSummary(data.reports);
    renderReports(data.reports);
  }

  function renderSummary(reports) {
    const total = reports.length;
    const open = reports.filter((r) => r.status === 'פתוח').length;
    const inProgress = reports.filter((r) => r.status === 'בטיפול').length;
    const critical = reports.filter((r) => r.urgency === 'קריטי' && r.status !== 'טופל').length;

    summaryBar.innerHTML = `
      <div class="summary-chip"><b>${total}</b>סה"כ דיווחים</div>
      <div class="summary-chip"><b>${open}</b>פתוחים</div>
      <div class="summary-chip"><b>${inProgress}</b>בטיפול</div>
      <div class="summary-chip"><b>${critical}</b>קריטיים פתוחים</div>
    `;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderReports(reports) {
    reportsList.innerHTML = '';
    emptyState.hidden = reports.length > 0;

    reports.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'report-card';
      card.innerHTML = `
        <img src="/uploads/${r.photoFilename}" alt="תמונת מפגע" data-fullsrc="/uploads/${r.photoFilename}" />
        <div class="report-body">
          <div class="report-top-row">
            <div class="report-location">${escapeHtml(r.location)}</div>
            <span class="badge badge-${r.urgency}">${r.urgency}</span>
          </div>
          <div class="report-desc">${escapeHtml(r.description)}</div>
          <div class="report-meta">
            <div>📅 ${formatDate(r.createdAt)}</div>
            <div>👤 ${r.reporterName ? escapeHtml(r.reporterName) : 'דיווח אנונימי'}</div>
          </div>
          <select class="status-select" data-id="${r.id}">
            <option value="פתוח" ${r.status === 'פתוח' ? 'selected' : ''}>פתוח</option>
            <option value="בטיפול" ${r.status === 'בטיפול' ? 'selected' : ''}>בטיפול</option>
            <option value="טופל" ${r.status === 'טופל' ? 'selected' : ''}>טופל</option>
          </select>
        </div>
      `;
      reportsList.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // האצלה: לחיצה על תמונה -> lightbox, שינוי סטטוס
  reportsList.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      lightboxImg.src = e.target.dataset.fullsrc;
      lightbox.hidden = false;
    }
  });

  reportsList.addEventListener('change', async (e) => {
    if (e.target.classList.contains('status-select')) {
      const id = e.target.dataset.id;
      const status = e.target.value;
      const pw = getPassword();
      await fetch(`/api/reports/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': pw,
        },
        body: JSON.stringify({ status }),
      });
      loadReports();
    }
  });

  lightbox.addEventListener('click', () => {
    lightbox.hidden = true;
  });

  filterStatus.addEventListener('change', loadReports);
  filterUrgency.addEventListener('change', loadReports);
  refreshBtn.addEventListener('click', loadReports);
  filterLocation.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadReports();
  });

  // אתחול: אם יש סיסמה שמורה בסשן, נסה להיכנס ישירות
  (async function init() {
    const pw = getPassword();
    if (pw) {
      const ok = await tryLogin(pw);
      if (ok) {
        showDashboard();
        return;
      }
      clearPassword();
    }
    showLogin();
  })();
})();
