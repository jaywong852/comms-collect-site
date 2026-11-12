(function () {
  var period = CommsPeriods.requirePeriodOrRedirect();
  if (!period) return;

  var listEl = document.getElementById('list');
  var statsEl = document.getElementById('stats');
  var statusMsg = document.getElementById('status-msg');
  var refreshBtn = document.getElementById('refresh-btn');
  var deleteSelectedBtn = document.getElementById('delete-selected-btn');
  var deleteModeBtn = document.getElementById('delete-mode-btn');
  var modal = document.getElementById('modal');
  var editForm = document.getElementById('edit-form');
  var editMsg = document.getElementById('edit-msg');
  var saveBtn = document.getElementById('save-btn');
  var closeModalBtn = document.getElementById('close-modal');
  var currentId = null;
  var items = [];
  var selectedIds = {};
  var dragId = null;
  var dragSeries = null;
  var deleting = false;
  var deleteMode = false;

  document.getElementById('submit-link').href =
    '/submit?period=' + encodeURIComponent(period);
  document.getElementById('manage-link').href =
    '/manage?period=' + encodeURIComponent(period);
  document.getElementById('calendar-link').href =
    '/calendar?period=' + encodeURIComponent(period);

  var authPanel = document.getElementById('auth-panel');
  var managePanel = document.getElementById('manage-panel');
  var logoutBtn = document.getElementById('logout-btn');

  function showLoggedIn() {
    authPanel.hidden = true;
    managePanel.hidden = false;
    loadList();
  }

  function showLoggedOut(configured) {
    managePanel.hidden = true;
    authPanel.hidden = false;
    if (typeof closeEdit === 'function') closeEdit();
    CommsAuth.mount(authPanel, {
      configured: !!configured,
      onSuccess: showLoggedIn,
    });
  }

  async function checkAuth() {
    try {
      var status = await CommsAuth.fetchStatus();
      if (status.isAdmin) showLoggedIn();
      else showLoggedOut(status.configured);
    } catch (err) {
      showLoggedOut(false);
      if (statusMsg) {
        showStatus('err', '未能確認登入狀態，請稍後再試');
      }
    }
  }

  function filenameFromDisposition(header, fallback) {
    if (!header) return fallback;
    var star = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (star) {
      try { return decodeURIComponent(star[1]); } catch (e) {}
    }
    var quoted = header.match(/filename="([^"]+)"/i);
    if (quoted) return quoted[1];
    return fallback;
  }

  async function manageFetch(url, options) {
    var res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (res.status === 401) {
      var status = await CommsAuth.fetchStatus().catch(function () {
        return { configured: true };
      });
      showLoggedOut(!!status.configured);
      var err = new Error('請先登入後台');
      err.needsAuth = true;
      throw err;
    }
    return res;
  }

  function downloadExport(url, fallbackName) {
    return manageFetch(url).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          throw new Error((json && json.error) || '匯出失敗，請稍後再試');
        });
      }
      var name = filenameFromDisposition(res.headers.get('Content-Disposition'), fallbackName);
      return res.blob().then(function (blob) {
        return { blob: blob, name: name };
      });
    }).then(function (file) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(file.blob);
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    });
  }

  if (window.CommsSeries) {
    CommsSeries.fillSelect(document.getElementById('edit-series'), '');
  }

  function showStatus(type, text) {
    statusMsg.className = 'msg show ' + type;
    statusMsg.textContent = text;
    if (type === 'ok') {
      setTimeout(function () {
        if (statusMsg.textContent === text) statusMsg.className = 'msg';
      }, 1800);
    }
  }

  function showEditMsg(type, text) {
    editMsg.className = 'msg show ' + type;
    editMsg.textContent = text;
  }

  CommsPeriods.fetchPeriods()
    .then(function (periods) {
      var found = periods.find(function (p) { return p.id === period; });
      var label = found ? found.label : CommsPeriods.periodLabelFallback(period);
      document.getElementById('period-title').textContent = label;
      document.title = '活動一覽｜' + label;
    })
    .catch(function () {
      document.getElementById('period-title').textContent =
        CommsPeriods.periodLabelFallback(period);
    });

  function fillForm(item) {
    editForm.name.value = item.name || '';
    if (window.CommsSeries) {
      CommsSeries.fillSelect(document.getElementById('edit-series'), item.series || '');
    } else if (editForm.series) {
      editForm.series.value = item.series || '';
    }
    editForm.summary.value = item.summary || '';
    editForm.content.value = item.content || '';
    editForm.date.value = item.date || '';
    editForm.time.value = item.time || '';
    editForm.location.value = item.location || '';
    editForm.assemblyTime.value = item.assemblyTime || '';
    editForm.assemblyPlace.value = item.assemblyPlace || '';
    editForm.audience.value = item.audience || '';
    editForm.quota.value = item.quota || '';
    editForm.fee.value = item.fee || '';
    editForm.contact.value = item.contact || '';
    editForm.notes.value = item.notes || '';
  }

  function openEdit(item) {
    currentId = item.id;
    editMsg.className = 'msg';
    fillForm(item);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeEdit() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    currentId = null;
  }

  function selectedItems() {
    return items.filter(function (item) { return selectedIds[item.id]; });
  }

  function pruneSelection() {
    var keep = {};
    items.forEach(function (item) {
      if (selectedIds[item.id]) keep[item.id] = true;
    });
    selectedIds = keep;
  }

  function updateToolbarDelete() {
    if (!deleteSelectedBtn) return;
    var n = selectedItems().length;
    deleteSelectedBtn.hidden = !deleteMode;
    deleteSelectedBtn.disabled = !deleteMode || deleting || n === 0;
    deleteSelectedBtn.title = n
      ? '刪除已選嘅 ' + n + ' 個活動'
      : '請先勾選要刪除嘅活動';
  }

  function updateDeleteModeUI() {
    if (deleteModeBtn) {
      deleteModeBtn.setAttribute('aria-pressed', deleteMode ? 'true' : 'false');
      deleteModeBtn.textContent = deleteMode ? '完成' : '刪除';
      deleteModeBtn.title = deleteMode
        ? '結束刪除模式'
        : '進入刪除模式，先勾選再刪除';
      deleteModeBtn.classList.toggle('btn-danger', !deleteMode);
      deleteModeBtn.classList.toggle('btn-secondary', deleteMode);
    }
    document.body.classList.toggle('manage-delete-mode', deleteMode);
    updateToolbarDelete();
  }

  function setDeleteMode(on) {
    deleteMode = !!on;
    if (!deleteMode) selectedIds = {};
    updateDeleteModeUI();
    render();
  }

  function confirmDelete(list) {
    if (!list.length) {
      showStatus('err', '請先勾選要刪除嘅活動');
      return false;
    }
    if (list.length === 1) {
      var name = list[0].name || '（無標題）';
      return confirm('確定刪除「' + name + '」？此操作不能復原。');
    }
    return confirm('確定刪除已選嘅 ' + list.length + ' 個活動？此操作不能復原。');
  }

  async function deleteItems(list) {
    if (deleting) return;
    if (!confirmDelete(list)) return;
    var ids = list.map(function (x) { return x.id; });
    deleting = true;
    updateToolbarDelete();
    try {
      var res;
      if (ids.length === 1) {
        res = await manageFetch('/api/submissions/' + encodeURIComponent(ids[0]), {
          method: 'DELETE',
        });
      } else {
        res = await manageFetch('/api/submissions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: period, ids: ids }),
        });
      }
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) throw new Error(json.error || '刪除失敗');
      if (Array.isArray(json.submissions)) {
        items = json.submissions;
      }
      ids.forEach(function (id) { delete selectedIds[id]; });
      pruneSelection();
      selectedIds = {};
      deleteMode = false;
      updateDeleteModeUI();
      if (ids.length === 1) {
        showStatus('ok', '已刪除「' + (list[0].name || '活動') + '」（編號已按系列更新）');
      } else {
        showStatus('ok', '已刪除 ' + ids.length + ' 個活動（編號已按系列更新）');
      }
      render();
    } catch (err) {
      showStatus('err', err.message || '刪除失敗');
      await loadList();
    } finally {
      deleting = false;
      updateToolbarDelete();
    }
  }

  function groupItems(list) {
    var groups = [];
    var map = {};
    var order = (CommsSeries.SERIES_LIST || []).concat(['']);
    order.forEach(function (key) {
      map[key] = [];
    });
    list.forEach(function (item) {
      var key = String(item.series || '').trim();
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    order.forEach(function (key) {
      if (map[key] && map[key].length) {
        groups.push({ series: key, label: CommsSeries.seriesLabel(key), items: map[key] });
      }
    });
    Object.keys(map).forEach(function (key) {
      if (order.indexOf(key) >= 0) return;
      if (map[key].length) {
        groups.push({ series: key, label: CommsSeries.seriesLabel(key), items: map[key] });
      }
    });
    return groups;
  }

  function seriesClass(series) {
    var key = window.CommsSeries && CommsSeries.seriesKey
      ? CommsSeries.seriesKey(series)
      : 'unclassified';
    return 'series-' + key;
  }

  function renderLegend() {
    var el = document.getElementById('series-legend');
    if (!el || !window.CommsSeries) return;
    el.innerHTML = '';
    var names = (CommsSeries.SERIES_LIST || []).concat(['']);
    names.forEach(function (name) {
      var item = document.createElement('span');
      item.className = 'series-legend-item ' + seriesClass(name);
      var swatch = document.createElement('span');
      swatch.className = 'series-legend-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      var lab = document.createElement('span');
      lab.textContent = CommsSeries.seriesLabel(name);
      item.appendChild(swatch);
      item.appendChild(lab);
      el.appendChild(item);
    });
    el.hidden = false;
  }

  function render() {
    statsEl.textContent =
      items.length === 0
        ? '暫時未有活動'
        : deleteMode
          ? '共 ' + items.length + ' 個活動（刪除模式：勾選後按刪除，或按「完成」離開）'
          : '共 ' + items.length + ' 個活動（系列優先，組內可拖曳）';

    if (!items.length) {
      var legendEmpty = document.getElementById('series-legend');
      if (legendEmpty) legendEmpty.hidden = true;
      listEl.innerHTML =
        '<div class="empty"><strong>仲未有活動</strong>可以先去交稿頁提交。</div>';
      updateToolbarDelete();
      return;
    }

    renderLegend();
    listEl.innerHTML = '';
    var groups = groupItems(items);
    groups.forEach(function (group) {
      var tone = seriesClass(group.series);
      var section = document.createElement('section');
      section.className = 'series-group ' + tone;
      section.dataset.series = group.series;

      var head = document.createElement('h3');
      head.className = 'series-heading';
      head.textContent = group.label;
      section.appendChild(head);

      var wrap = document.createElement('div');
      wrap.className = 'sort-list';

      group.items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'sort-item ' + tone;
        row.draggable = true;
        row.dataset.id = item.id;
        row.dataset.series = group.series;
        row.title = '拉動整個框框調次序（同一系列內）';
        row.setAttribute('aria-grabbed', 'false');
        var checkHtml = '';
        var deleteBtnHtml = '';
        if (deleteMode) {
          checkHtml =
            '<label class="sort-check-wrap">' +
            '<input class="sort-check" type="checkbox" draggable="false" aria-label="選取呢個活動" />' +
            '</label>';
          deleteBtnHtml =
            '<button class="btn btn-danger delete-btn" type="button" draggable="false">刪除</button>';
        }
        row.innerHTML =
          '<div class="sort-main">' +
          checkHtml +
          '<div class="sort-index"></div>' +
          '<div>' +
          '<h3></h3>' +
          '<div class="meta"></div>' +
          '</div>' +
          '</div>' +
          '<div class="sort-actions">' +
          '<button class="btn btn-secondary edit-btn" type="button" draggable="false">編輯</button>' +
          deleteBtnHtml +
          '</div>';
        row.querySelector('.sort-index').textContent = String(item.number || '');
        row.querySelector('h3').textContent = item.name || '（無標題）';
        var bits = [];
        if (item.date) bits.push(item.date);
        if (item.time) bits.push(item.time);
        if (item.location) bits.push(item.location);
        if (item.assemblyTime) bits.push('集合 ' + item.assemblyTime);
        if (item.assemblyPlace) bits.push('集合地點：' + item.assemblyPlace);
        if (item.contact) bits.push(item.contact);
        row.querySelector('.meta').textContent = bits.join('　·　') || '未填日期／地點';
        var check = row.querySelector('.sort-check');
        if (check) {
          check.checked = !!selectedIds[item.id];
          if (check.checked) row.classList.add('selected');
          ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(function (evt) {
            check.addEventListener(evt, function (e) { e.stopPropagation(); });
            row.querySelector('.sort-check-wrap').addEventListener(evt, function (e) {
              e.stopPropagation();
            });
          });
          check.addEventListener('change', function (e) {
            e.stopPropagation();
            if (check.checked) selectedIds[item.id] = true;
            else delete selectedIds[item.id];
            row.classList.toggle('selected', check.checked);
            updateToolbarDelete();
          });
        }

        row.querySelector('.edit-btn').addEventListener('click', function (e) {
          e.stopPropagation();
          openEdit(item);
        });
        var deleteBtn = row.querySelector('.delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            deleteItems([item]);
          });
        }

        row.addEventListener('dragstart', function (e) {
          if (
            e.target.closest &&
            e.target.closest('button, a, input, textarea, select, label, .sort-check, .sort-check-wrap, .sort-actions')
          ) {
            e.preventDefault();
            return;
          }
          dragId = item.id;
          dragSeries = group.series;
          row.classList.add('dragging');
          row.setAttribute('aria-grabbed', 'true');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
          e.dataTransfer.setData('application/x-series', group.series);
        });
        row.addEventListener('dragend', function () {
          row.classList.remove('dragging');
          row.setAttribute('aria-grabbed', 'false');
          dragId = null;
          dragSeries = null;
          listEl.querySelectorAll('.sort-item').forEach(function (el) {
            el.classList.remove('drag-over');
          });
        });
        row.addEventListener('dragover', function (e) {
          if (dragSeries !== null && dragSeries !== group.series) {
            e.dataTransfer.dropEffect = 'none';
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', function () {
          row.classList.remove('drag-over');
        });
        row.addEventListener('drop', function (e) {
          e.preventDefault();
          row.classList.remove('drag-over');
          var fromId = e.dataTransfer.getData('text/plain') || dragId;
          var fromSeries = e.dataTransfer.getData('application/x-series');
          if (fromSeries === '' || fromSeries == null) fromSeries = dragSeries;
          if (fromSeries !== group.series) {
            showStatus('err', '只可以喺同一個系列入面調次序');
            return;
          }
          var toId = item.id;
          if (!fromId || fromId === toId) return;
          var groupIds = group.items.map(function (x) { return x.id; });
          var fromIndex = groupIds.indexOf(fromId);
          var toIndex = groupIds.indexOf(toId);
          if (fromIndex < 0 || toIndex < 0) return;
          groupIds.splice(fromIndex, 1);
          groupIds.splice(toIndex, 0, fromId);
          persistOrder(group.series, groupIds);
        });

        wrap.appendChild(row);
      });

      section.appendChild(wrap);
      listEl.appendChild(section);
    });
    updateToolbarDelete();
  }

  async function persistOrder(seriesKey, ids) {
    try {
      var res = await manageFetch('/api/submissions/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: period,
          series: seriesKey,
          ids: ids,
        }),
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) throw new Error(json.error || '儲存次序失敗');
      items = json.submissions || items;
      showStatus('ok', '次序已儲存（編號已按系列更新）');
      render();
    } catch (err) {
      showStatus('err', err.message || '儲存次序失敗');
      await loadList();
    }
  }

  async function loadList() {
    statsEl.textContent = '載入緊…';
    try {
      var res = await manageFetch('/api/submissions?period=' + encodeURIComponent(period));
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) throw new Error(json.error || '載入失敗');
      items = json.submissions || [];
      pruneSelection();
      render();
    } catch (err) {
      statsEl.textContent = err.message || '載入失敗';
      listEl.innerHTML =
        '<div class="empty"><strong>載入失敗</strong>' +
        (err.message || '') +
        '</div>';
    }
  }

  editForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!currentId) return;
    var data = Object.fromEntries(new FormData(editForm).entries());
    if (!String(data.name || '').trim()) {
      showEditMsg('err', '請填寫活動名稱');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存緊…';
    try {
      var res = await manageFetch('/api/submissions/' + encodeURIComponent(currentId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok || !json.ok) throw new Error(json.error || '儲存失敗');
      closeEdit();
      showStatus('ok', '已更新活動資料');
      await loadList();
    } catch (err) {
      showEditMsg('err', err.message || '儲存失敗');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存修改';
    }
  });

  closeModalBtn.addEventListener('click', closeEdit);
  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeEdit();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('show')) {
      closeEdit();
      return;
    }
    if (deleteMode) setDeleteMode(false);
  });
  refreshBtn.addEventListener('click', loadList);
  var exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', function () {
      exportBtn.disabled = true;
      downloadExport(
        '/api/export/details?period=' + encodeURIComponent(period),
        '活動詳情.docx'
      ).catch(function (err) {
        showStatus('err', err.message || '匯出失敗，請稍後再試');
      }).then(function () {
        exportBtn.disabled = false;
      });
    });
  }

  if (deleteModeBtn) {
    deleteModeBtn.addEventListener('click', function () {
      setDeleteMode(!deleteMode);
    });
  }
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', function () {
      var list = selectedItems();
      if (!list.length) {
        showStatus('err', '請先勾選要刪除嘅活動');
        return;
      }
      deleteItems(list);
    });
  }

  updateDeleteModeUI();

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function () {
      await CommsAuth.logout();
      var status = await CommsAuth.fetchStatus().catch(function () {
        return { configured: true };
      });
      showLoggedOut(!!status.configured);
    });
  }

  checkAuth();
})();
