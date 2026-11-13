import { createSubmission, fetchCatalog } from './data.js';
import { bindHomeLink, bindPeriodNav, showPeriodTitle } from './nav.js';
import { requirePeriodOrRedirect } from './paths.js';
import { fillSelect, seriesLabel } from './series.js';

const period = requirePeriodOrRedirect();
if (period) {
  const form = document.getElementById('submit-form');
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('form-msg');
  const periodInput = document.getElementById('period');
  const seriesSelect = document.getElementById('series');

  periodInput.value = period;
  fillSelect(seriesSelect, '');
  bindHomeLink();
  bindPeriodNav(period);
  showPeriodTitle(period, '新增活動');

  function showMsg(type, text) {
    msg.className = `msg show ${type}`;
    msg.textContent = text;
  }

  const IMPORT_FIELDS = [
    'name',
    'series',
    'summary',
    'content',
    'date',
    'time',
    'location',
    'assemblyTime',
    'assemblyPlace',
    'audience',
    'quota',
    'fee',
    'contact',
    'notes',
  ];

  const importBtn = document.getElementById('import-btn');
  const importModal = document.getElementById('import-modal');
  const importList = document.getElementById('import-list');
  const importSearch = document.getElementById('import-search');
  const importCancel = document.getElementById('import-cancel');
  const importMsg = document.getElementById('import-msg');
  let catalogPeriods = null;
  let catalogLoading = null;

  function showImportMsg(type, text) {
    if (!importMsg) return;
    importMsg.className = `msg show ${type}`;
    importMsg.textContent = text;
  }

  function shortName(name) {
    const text = String(name || '').trim() || '未命名活動';
    return text.length > 20 ? `${text.slice(0, 19)}…` : text;
  }

  function formHasContent() {
    return IMPORT_FIELDS.some((key) => {
      const el = form.elements[key];
      if (!el) return false;
      return String(el.value || '').trim() !== '';
    });
  }

  function fillImported(item) {
    IMPORT_FIELDS.forEach((key) => {
      if (key === 'series') return;
      if (form.elements[key]) form.elements[key].value = item[key] || '';
    });
    fillSelect(seriesSelect, item.series || '');
    periodInput.value = period;
  }

  function closeImport() {
    importModal.classList.remove('show');
    importModal.setAttribute('aria-hidden', 'true');
  }

  function openImport() {
    importModal.classList.add('show');
    importModal.setAttribute('aria-hidden', 'false');
    importSearch.value = '';
    renderImportList('');
    setTimeout(() => importSearch.focus(), 30);
  }

  function renderImportList(query) {
    const q = String(query || '').trim().toLowerCase();
    importList.innerHTML = '';
    if (!catalogPeriods) {
      importList.innerHTML = '<div class="import-empty">載入緊活動…</div>';
      return;
    }
    if (!catalogPeriods.length) {
      importList.innerHTML = '<div class="import-empty">仲未有可匯入嘅活動。</div>';
      return;
    }
    let shown = 0;
    catalogPeriods.forEach((group) => {
      const items = (group.submissions || []).filter((item) => {
        if (!q) return true;
        const name = String(item.name || '').toLowerCase();
        const series = String(item.series || '').toLowerCase();
        const label = seriesLabel(item.series).toLowerCase();
        return name.includes(q) || series.includes(q) || label.includes(q);
      });
      if (!items.length) return;
      const head = document.createElement('div');
      head.className = 'import-group-head';
      head.textContent = group.label || group.issueLabel || group.id;
      importList.appendChild(head);
      items.forEach((item) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'import-row';
        row.setAttribute('role', 'option');
        const seriesText = seriesLabel(item.series);
        const metaParts = [seriesText];
        if (item.date) metaParts.push(item.date);
        const nameEl = document.createElement('div');
        nameEl.className = 'import-row-name';
        nameEl.textContent = item.name || '未命名活動';
        const metaEl = document.createElement('div');
        metaEl.className = 'import-row-meta';
        metaEl.textContent = metaParts.join(' · ');
        row.appendChild(nameEl);
        row.appendChild(metaEl);
        row.addEventListener('click', () => pickImported(item, group));
        importList.appendChild(row);
        shown += 1;
      });
    });
    if (!shown) {
      importList.innerHTML = '<div class="import-empty">搵唔到符合嘅活動，試下改吓搜尋字。</div>';
    }
  }

  function pickImported(item, group) {
    if (formHasContent() && !window.confirm('表格已有內容，匯入會蓋過而家嘅資料。確定匯入？')) return;
    fillImported(item);
    closeImport();
    const label = (group && (group.issueLabel || group.label)) || (group && group.id) || '';
    showImportMsg('ok', `已匯入「${shortName(item.name)}」（${label}）。請檢查日期等欄位，確認後先提交。`);
    if (msg) msg.className = 'msg';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (form.name) form.name.focus();
  }

  function loadCatalog() {
    if (catalogPeriods) return Promise.resolve(catalogPeriods);
    if (catalogLoading) return catalogLoading;
    importList.innerHTML = '<div class="import-empty">載入緊活動…</div>';
    catalogLoading = fetchCatalog()
      .then((periods) => {
        catalogPeriods = periods || [];
        catalogLoading = null;
        return catalogPeriods;
      })
      .catch((err) => {
        catalogLoading = null;
        importList.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'import-empty';
        empty.textContent = err.message || '載入活動列表失敗，請稍後再試。';
        importList.append(empty);
        throw err;
      });
    return catalogLoading;
  }

  importBtn.addEventListener('click', () => {
    openImport();
    loadCatalog()
      .then(() => renderImportList(importSearch.value))
      .catch(() => {});
  });
  importSearch.addEventListener('input', () => renderImportList(importSearch.value));
  importCancel.addEventListener('click', closeImport);
  importModal.addEventListener('click', (event) => {
    if (event.target === importModal) closeImport();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && importModal.classList.contains('show')) closeImport();
  });

  form.addEventListener('reset', () => {
    if (importMsg) importMsg.className = 'msg';
    setTimeout(() => {
      fillSelect(seriesSelect, '');
      periodInput.value = period;
    }, 0);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    msg.className = 'msg';
    const data = Object.fromEntries(new FormData(form).entries());
    data.period = period;
    if (!String(data.name || '').trim()) {
      showMsg('err', '請填寫活動名稱先～');
      form.name.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '提交緊…';
    try {
      await createSubmission(period, data);
      form.reset();
      periodInput.value = period;
      fillSelect(seriesSelect, '');
      if (importMsg) importMsg.className = 'msg';
      showMsg('ok', '收到！已提交。可以去「活動一覽」調動排列 🎉');
      window.scrollTo({ top: msg.offsetTop - 80, behavior: 'smooth' });
    } catch (err) {
      showMsg('err', err.message || '提交失敗，請稍後再試');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交通訊稿';
    }
  });
}
