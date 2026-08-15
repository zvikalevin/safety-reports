(function () {
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const codeInput = document.getElementById('codeInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  const viewerName = document.getElementById('viewerName');

  const summaryBar = document.getElementById('summaryBar');
  const reportsList = document.getElementById('reportsList');
  const emptyState = document.getElementById('emptyState');

  const filterStatus = document.getElementById('filterStatus');
  const filterUrgency = document.getElementById('filterUrgency');
  const refreshBtn = document.getElementById('refreshBtn');

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');

  // sessionStorage ולא localStorage - הקוד נמחק בסגירת הדפדפן.
  // חשוב במיוחד אם נכנסים ממחשב משותף במפעל.
  const KEY = 'safetyManagerCode';
  const getCode = () => sessionStorage.getItem(KEY);
  const setCode = (c) => sessionStorage.setItem(KEY, c);
  const clearCode = () => sessionStorage.removeItem(KEY);

  async function tryLogin(code) {
    const res = await fetch('/api/manager/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.name;
  }

  function showDashboard(name) {
    loginScreen.hidden = true;
    dashboard.hidden = false;
    viewerName.textContent = name ? `מחובר: ${name}` : '';
    loadReports();
  }

  function showLogin() {
    dashboard.hidden = true;
    loginScreen.hidden = false;
  }

  loginBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) return;
    loginError.hidden = true;
    const name = await tryLogin(code);
    if (name) {
      setCode(code);
      showDashboard(name);
    } else {
      loginError.textContent = 'קוד גישה שגוי';
      loginError.hidden = false;
    }
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn.addEventListener('click', () => {
    clearCode();
    codeInput.value = '';
    showLogin();
  });

  async function loadReports() {
    const params = new URLSearchParams();
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (filterUrgency.value) params.set('urgency', filterUrgency.value);

    const res = await fetch(`/api/manager/reports?${params.toString()}`, {
      headers: { 'x-manager-code': getCode() || '' },
    });

    if (res.status === 401) {
      clearCode();
      showLogin();
      return;
    }

    const data = await res.json();
    renderSummary(data.reports);
    renderReports(data.reports);
  }

  function renderSummary(reports) {
    const open = reports.filter((r) => r.status === 'פתוח').length;
    const inProgress = reports.filter((r) => r.status === 'בטיפול').length;
    const critical = reports.filter((r) => r.urgency === 'קריטי' && r.status !== 'טופל').length;

    summaryBar.innerHTML = `
      <div class="summary-chip"><b>${reports.length}</b>מוצגים</div>
      <div class="summary-chip"><b>${open}</b>פתוחים</div>
      <div class="summary-chip"><b>${inProgress}</b>בטיפול</div>
      <div class="summary-chip"><b>${critical}</b>קריטיים פתוחים</div>
    `;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function renderReports(reports) {
    reportsList.innerHTML = '';
    emptyState.hidden = reports.length > 0;

    reports.forEach((r) => {
      const place = r.locationDetail
        ? `${r.location} · ${r.locationDetail}`
        : r.location;

      const last = r.statusHistory && r.statusHistory.length
        ? r.statusHistory[r.statusHistory.length - 1]
        : null;

      const card = document.createElement('div');
      card.className = 'report-card';
      card.innerHTML = `
        <img src="/uploads/${r.photoFilename}" alt="תמונת מפגע" data-fullsrc="/uploads/${r.photoFilename}" />
        <div class="report-body">
          <div class="report-top-row">
            <div class="report-location">${escapeHtml(place)}</div>
            <span class="badge badge-${r.urgency}">${r.urgency}</span>
          </div>
          <div class="report-desc">${escapeHtml(r.description)}</div>
          <div class="report-meta">
            <div>📅 ${formatDate(r.createdAt)}</div>
            ${last ? `<div>✔ ${escapeHtml(last.status)} · ${escapeHtml(last.by)}</div>` : ''}
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
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  reportsList.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      lightboxImg.src = e.target.dataset.fullsrc;
      lightbox.hidden = false;
    }
  });

  reportsList.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('status-select')) return;
    await fetch(`/api/manager/reports/${e.target.dataset.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-manager-code': getCode() || '',
      },
      body: JSON.stringify({ status: e.target.value }),
    });
    loadReports();
  });

  lightbox.addEventListener('click', () => { lightbox.hidden = true; });

  filterStatus.addEventListener('change', loadReports);
  filterUrgency.addEventListener('change', loadReports);
  refreshBtn.addEventListener('click', loadReports);

  (async function init() {
    const code = getCode();
    if (code) {
      const name = await tryLogin(code);
      if (name) return showDashboard(name);
      clearCode();
    }
    showLogin();
  })();
})();
