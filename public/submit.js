(function () {
  var period = CommsPeriods.requirePeriodOrRedirect();
  if (!period) return;

  document.getElementById('period').value = period;
  if (window.CommsSeries) CommsSeries.fillSelect(document.getElementById('series'), '');
  document.getElementById('submit-link').href = '/submit?period=' + encodeURIComponent(period);
  document.getElementById('manage-link').href = '/manage?period=' + encodeURIComponent(period);
  var cal = document.getElementById('calendar-link');
  if (cal) cal.href = '/calendar?period=' + encodeURIComponent(period);
  document.title = '新增活動｜' + CommsPeriods.periodLabelFallback(period);

  CommsPeriods.fetchPeriods().then(function (periods) {
    var found = periods.find(function (p) { return p.id === period; });
    var label = found ? found.label : CommsPeriods.periodLabelFallback(period);
    document.getElementById('period-title').textContent = label;
    document.title = '新增活動｜' + label;
  }).catch(function () {
    document.getElementById('period-title').textContent =
      CommsPeriods.periodLabelFallback(period);
  });

  var form = document.getElementById('submit-form');
  var btn = document.getElementById('submit-btn');
  var msg = document.getElementById('form-msg');

  function showMsg(type, text) {
    msg.className = 'msg show ' + type;
    msg.textContent = text;
  }


  var IMPORT_FIELDS = [
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

  var importBtn = document.getElementById('import-btn');
  var importModal = document.getElementById('import-modal');
  var importList = document.getElementById('import-list');
  var importSearch = document.getElementById('import-search');
  var importCancel = document.getElementById('import-cancel');
  var importMsg = document.getElementById('import-msg');
  var catalogPeriods = null;
  var catalogItems = {};
  var catalogLoading = null;

  function showImportMsg(type, text) {
    if (!importMsg) return;
    importMsg.className = 'msg show ' + type;
    importMsg.textContent = text;
  }

  function shortName(name) {
    var s = String(name || '').trim() || '未命名活動';
    return s.length > 20 ? s.slice(0, 19) + '…' : s;
  }

  function formHasContent() {
    return IMPORT_FIELDS.some(function (key) {
      var el = form.elements[key];
      if (!el) return false;
      return String(el.value || '').trim() !== '';
    });
  }

  function fillImported(item) {
    IMPORT_FIELDS.forEach(function (key) {
      if (key === 'series') return;
      if (form.elements[key]) form.elements[key].value = item[key] || '';
    });
    if (window.CommsSeries) {
      CommsSeries.fillSelect(document.getElementById('series'), item.series || '');
    } else if (form.elements.series) {
      form.elements.series.value = item.series || '';
    }
    document.getElementById('period').value = period;
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
    setTimeout(function () {
      importSearch.focus();
    }, 30);
  }

  function renderImportList(query) {
    var q = String(query || '').trim().toLowerCase();
    importList.innerHTML = '';
    if (!catalogPeriods) {
      importList.innerHTML = '<div class="import-empty">載入緊活動…</div>';
      return;
    }
    if (!catalogPeriods.length) {
      importList.innerHTML = '<div class="import-empty">仲未有可匯入嘅活動。</div>';
      return;
    }
    var shown = 0;
    catalogPeriods.forEach(function (group) {
      var items = (group.submissions || []).filter(function (item) {
        if (!q) return true;
        var name = String(item.name || '').toLowerCase();
        var series = String(item.series || '').toLowerCase();
        var seriesLabel = (window.CommsSeries ? CommsSeries.seriesLabel(item.series) : series).toLowerCase();
        return name.indexOf(q) !== -1 || series.indexOf(q) !== -1 || seriesLabel.indexOf(q) !== -1;
      });
      if (!items.length) return;
      var head = document.createElement('div');
      head.className = 'import-group-head';
      head.textContent = group.label || group.issueLabel || group.id;
      importList.appendChild(head);
      items.forEach(function (item) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'import-row';
        row.setAttribute('role', 'option');
        row.setAttribute('data-id', item.id);
        var seriesText = window.CommsSeries ? CommsSeries.seriesLabel(item.series) : (item.series || '未分類');
        var metaParts = [seriesText];
        if (item.date) metaParts.push(item.date);
        var nameEl = document.createElement('div');
        nameEl.className = 'import-row-name';
        nameEl.textContent = item.name || '未命名活動';
        var metaEl = document.createElement('div');
        metaEl.className = 'import-row-meta';
        metaEl.textContent = metaParts.join(' · ');
        row.appendChild(nameEl);
        row.appendChild(metaEl);
        row.addEventListener('click', function () {
          pickImported(item, group);
        });
        importList.appendChild(row);
        shown += 1;
      });
    });
    if (!shown) {
      importList.innerHTML = '<div class="import-empty">搵唔到符合嘅活動，試下改吓搜尋字。</div>';
    }
  }

  function pickImported(item, group) {
    if (formHasContent() && !window.confirm('表格已有內容，匯入會蓋過而家嘅資料。確定匯入？')) {
      return;
    }
    fillImported(item);
    closeImport();
    var label = (group && (group.issueLabel || group.label)) || '';
    if (!label && group && group.id && window.CommsPeriods) {
      label = (CommsPeriods.periodIssueLabel && CommsPeriods.periodIssueLabel(group.id)) ||
        CommsPeriods.periodLabelFallback(group.id);
    }
    if (!label) label = (group && group.id) || '';
    showImportMsg(
      'ok',
      '已匯入「' + shortName(item.name) + '」（' + label + '）。請檢查日期等欄位，確認後先提交。'
    );
    if (msg) msg.className = 'msg';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (form.name) form.name.focus();
  }

  function loadCatalog() {
    if (catalogPeriods) return Promise.resolve(catalogPeriods);
    if (catalogLoading) return catalogLoading;
    importList.innerHTML = '<div class="import-empty">載入緊活動…</div>';
    catalogLoading = fetch('/api/submissions/catalog')
      .then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok || !json.ok) throw new Error(json.error || '載入活動列表失敗');
          return json;
        });
      })
      .then(function (json) {
        catalogPeriods = json.periods || [];
        catalogItems = {};
        catalogPeriods.forEach(function (group) {
          (group.submissions || []).forEach(function (item) {
            catalogItems[item.id] = item;
          });
        });
        catalogLoading = null;
        return catalogPeriods;
      })
      .catch(function (err) {
        catalogLoading = null;
        importList.innerHTML =
          '<div class="import-empty">' + (err.message || '載入活動列表失敗，請稍後再試。') + '</div>';
        throw err;
      });
    return catalogLoading;
  }

  importBtn.addEventListener('click', function () {
    openImport();
    loadCatalog()
      .then(function () {
        renderImportList(importSearch.value);
      })
      .catch(function () {});
  });
  importSearch.addEventListener('input', function () {
    renderImportList(importSearch.value);
  });
  importCancel.addEventListener('click', closeImport);
  importModal.addEventListener('click', function (e) {
    if (e.target === importModal) closeImport();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && importModal.classList.contains('show')) {
      closeImport();
    }
  });

  form.addEventListener('reset', function () {
    if (importMsg) importMsg.className = 'msg';
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    msg.className = 'msg';
    var data = Object.fromEntries(new FormData(form).entries());
    data.period = period;
    if (!String(data.name || '').trim()) {
      showMsg('err', '請填寫活動名稱先～');
      form.name.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = '提交緊…';
    try {
      var res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) throw new Error(json.error || '提交失敗，請稍後再試');
      form.reset();
      document.getElementById('period').value = period;
      if (window.CommsSeries) CommsSeries.fillSelect(document.getElementById('series'), '');
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
})();
