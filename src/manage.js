import { fetchAuthStatus, logout } from './auth.js';
import { deleteSubmissions, fetchPeriodNumbered, reorderSeries, updateSubmission } from './data.js';
import { exportDetails } from './exporters.js';
import { mountAuth } from './auth-ui.js';
import { bindHomeLink, bindPeriodNav, showPeriodTitle } from './nav.js';
import { requirePeriodOrRedirect } from './paths.js';
import { SERIES_LIST, fillSelect, seriesKey, seriesLabel } from './series.js';

const period = requirePeriodOrRedirect();
if (period) {
  const listEl = document.getElementById('list');
  const statsEl = document.getElementById('stats');
  const statusMsg = document.getElementById('status-msg');
  const refreshBtn = document.getElementById('refresh-btn');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  const deleteModeBtn = document.getElementById('delete-mode-btn');
  const modal = document.getElementById('modal');
  const editForm = document.getElementById('edit-form');
  const editMsg = document.getElementById('edit-msg');
  const saveBtn = document.getElementById('save-btn');
  const closeModalBtn = document.getElementById('close-modal');
  const authPanel = document.getElementById('auth-panel');
  const managePanel = document.getElementById('manage-panel');
  const logoutBtn = document.getElementById('logout-btn');
  const exportBtn = document.getElementById('export-btn');

  let currentId = null;
  let items = [];
  let selectedIds = {};
  let dragId = null;
  let dragSeries = null;
  let deleting = false;
  let deleteMode = false;

  bindHomeLink();
  bindPeriodNav(period);
  showPeriodTitle(period, '活動一覽');
  fillSelect(document.getElementById('edit-series'), '');

  function showStatus(type, text) {
    statusMsg.className = `msg show ${type}`;
    statusMsg.textContent = text;
    if (type === 'ok') {
      setTimeout(() => {
        if (statusMsg.textContent === text) statusMsg.className = 'msg';
      }, 1800);
    }
  }

  function showEditMsg(type, text) {
    editMsg.className = `msg show ${type}`;
    editMsg.textContent = text;
  }

  function closeEdit() {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    currentId = null;
  }

  function showLoggedIn() {
    authPanel.hidden = true;
    managePanel.hidden = false;
    loadList();
  }

  function showLoggedOut(configured) {
    managePanel.hidden = true;
    authPanel.hidden = false;
    closeEdit();
    mountAuth(authPanel, {
      configured: !!configured,
      onSuccess: showLoggedIn,
    });
  }

  async function guard(action) {
    try {
      return await action();
    } catch (err) {
      if (err && err.needsAuth) {
        const status = await fetchAuthStatus().catch(() => ({ configured: true }));
        showLoggedOut(!!status.configured);
        const wrapped = new Error('請先登入後台');
        wrapped.needsAuth = true;
        throw wrapped;
      }
      throw err;
    }
  }

  async function checkAuth() {
    try {
      const status = await fetchAuthStatus();
      if (status.isAdmin) showLoggedIn();
      else showLoggedOut(status.configured);
    } catch (err) {
      showLoggedOut(false);
      showStatus('err', '未能確認登入狀態，請稍後再試');
    }
  }

  function fillForm(item) {
    editForm.name.value = item.name || '';
    fillSelect(document.getElementById('edit-series'), item.series || '');
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

  function selectedItems() {
    return items.filter((item) => selectedIds[item.id]);
  }

  function pruneSelection() {
    const keep = {};
    items.forEach((item) => {
      if (selectedIds[item.id]) keep[item.id] = true;
    });
    selectedIds = keep;
  }

  function updateToolbarDelete() {
    if (!deleteSelectedBtn) return;
    const count = selectedItems().length;
    deleteSelectedBtn.hidden = !deleteMode;
    deleteSelectedBtn.disabled = !deleteMode || deleting || count === 0;
    deleteSelectedBtn.title = count ? `刪除已選嘅 ${count} 個活動` : '請先勾選要刪除嘅活動';
  }

  function updateDeleteModeUI() {
    if (deleteModeBtn) {
      deleteModeBtn.setAttribute('aria-pressed', deleteMode ? 'true' : 'false');
      deleteModeBtn.textContent = deleteMode ? '完成' : '刪除';
      deleteModeBtn.title = deleteMode ? '結束刪除模式' : '進入刪除模式，先勾選再刪除';
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
      const name = list[0].name || '（無標題）';
      return confirm(`確定刪除「${name}」？此操作不能復原。`);
    }
    return confirm(`確定刪除已選嘅 ${list.length} 個活動？此操作不能復原。`);
  }

  async function deleteItems(list) {
    if (deleting) return;
    if (!confirmDelete(list)) return;
    const ids = list.map((item) => item.id);
    deleting = true;
    updateToolbarDelete();
    try {
      items = await guard(() => deleteSubmissions(period, ids));
      ids.forEach((id) => {
        delete selectedIds[id];
      });
      selectedIds = {};
      deleteMode = false;
      updateDeleteModeUI();
      if (ids.length === 1) showStatus('ok', `已刪除「${list[0].name || '活動'}」（編號已按系列更新）`);
      else showStatus('ok', `已刪除 ${ids.length} 個活動（編號已按系列更新）`);
      render();
    } catch (err) {
      if (!(err && err.needsAuth)) {
        showStatus('err', err.message || '刪除失敗');
        await loadList();
      }
    } finally {
      deleting = false;
      updateToolbarDelete();
    }
  }

  function groupItems(list) {
    const groups = [];
    const map = {};
    const order = SERIES_LIST.concat(['']);
    order.forEach((key) => {
      map[key] = [];
    });
    list.forEach((item) => {
      const key = String(item.series || '').trim();
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    order.forEach((key) => {
      if (map[key] && map[key].length) groups.push({ series: key, label: seriesLabel(key), items: map[key] });
    });
    Object.keys(map).forEach((key) => {
      if (order.indexOf(key) >= 0) return;
      if (map[key].length) groups.push({ series: key, label: seriesLabel(key), items: map[key] });
    });
    return groups;
  }

  function seriesClass(series) {
    return `series-${seriesKey(series)}`;
  }

  function renderLegend() {
    const el = document.getElementById('series-legend');
    if (!el) return;
    el.innerHTML = '';
    SERIES_LIST.concat(['']).forEach((name) => {
      const item = document.createElement('span');
      item.className = `series-legend-item ${seriesClass(name)}`;
      const swatch = document.createElement('span');
      swatch.className = 'series-legend-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = seriesLabel(name);
      item.appendChild(swatch);
      item.appendChild(label);
      el.appendChild(item);
    });
    el.hidden = false;
  }

  function render() {
    statsEl.textContent =
      items.length === 0
        ? '暫時未有活動'
        : deleteMode
          ? `共 ${items.length} 個活動（刪除模式：勾選後按刪除，或按「完成」離開）`
          : `共 ${items.length} 個活動（系列優先，組內可拖曳）`;

    if (!items.length) {
      const legendEmpty = document.getElementById('series-legend');
      if (legendEmpty) legendEmpty.hidden = true;
      listEl.innerHTML = '<div class="empty"><strong>仲未有活動</strong>可以先去交稿頁提交。</div>';
      updateToolbarDelete();
      return;
    }

    renderLegend();
    listEl.innerHTML = '';
    groupItems(items).forEach((group) => {
      const tone = seriesClass(group.series);
      const section = document.createElement('section');
      section.className = `series-group ${tone}`;
      section.dataset.series = group.series;

      const head = document.createElement('h3');
      head.className = 'series-heading';
      head.textContent = group.label;
      section.appendChild(head);

      const wrap = document.createElement('div');
      wrap.className = 'sort-list';

      group.items.forEach((item) => {
        const row = document.createElement('div');
        row.className = `sort-item ${tone}`;
        row.draggable = true;
        row.dataset.id = item.id;
        row.dataset.series = group.series;
        row.title = '拉動整個框框調次序（同一系列內）';
        row.setAttribute('aria-grabbed', 'false');
        const checkHtml = deleteMode
          ? '<label class="sort-check-wrap"><input class="sort-check" type="checkbox" draggable="false" aria-label="選取呢個活動" /></label>'
          : '';
        const deleteBtnHtml = deleteMode
          ? '<button class="btn btn-danger delete-btn" type="button" draggable="false">刪除</button>'
          : '';
        row.innerHTML =
          '<div class="sort-main">' +
          checkHtml +
          '<div class="sort-index"></div>' +
          '<div><h3></h3><div class="meta"></div></div>' +
          '</div>' +
          '<div class="sort-actions">' +
          '<button class="btn btn-secondary edit-btn" type="button" draggable="false">編輯</button>' +
          deleteBtnHtml +
          '</div>';
        row.querySelector('.sort-index').textContent = String(item.number || '');
        row.querySelector('h3').textContent = item.name || '（無標題）';
        const bits = [];
        if (item.date) bits.push(item.date);
        if (item.time) bits.push(item.time);
        if (item.location) bits.push(item.location);
        if (item.assemblyTime) bits.push(`集合 ${item.assemblyTime}`);
        if (item.assemblyPlace) bits.push(`集合地點：${item.assemblyPlace}`);
        if (item.contact) bits.push(item.contact);
        row.querySelector('.meta').textContent = bits.join('　·　') || '未填日期／地點';
        const check = row.querySelector('.sort-check');
        if (check) {
          check.checked = !!selectedIds[item.id];
          if (check.checked) row.classList.add('selected');
          ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach((evt) => {
            check.addEventListener(evt, (event) => event.stopPropagation());
            row.querySelector('.sort-check-wrap').addEventListener(evt, (event) => event.stopPropagation());
          });
          check.addEventListener('change', (event) => {
            event.stopPropagation();
            if (check.checked) selectedIds[item.id] = true;
            else delete selectedIds[item.id];
            row.classList.toggle('selected', check.checked);
            updateToolbarDelete();
          });
        }

        row.querySelector('.edit-btn').addEventListener('click', (event) => {
          event.stopPropagation();
          openEdit(item);
        });
        const deleteBtn = row.querySelector('.delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteItems([item]);
          });
        }

        row.addEventListener('dragstart', (event) => {
          if (
            event.target.closest &&
            event.target.closest('button, a, input, textarea, select, label, .sort-check, .sort-check-wrap, .sort-actions')
          ) {
            event.preventDefault();
            return;
          }
          dragId = item.id;
          dragSeries = group.series;
          row.classList.add('dragging');
          row.setAttribute('aria-grabbed', 'true');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', item.id);
          event.dataTransfer.setData('application/x-series', group.series);
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          row.setAttribute('aria-grabbed', 'false');
          dragId = null;
          dragSeries = null;
          listEl.querySelectorAll('.sort-item').forEach((el) => el.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', (event) => {
          if (dragSeries !== null && dragSeries !== group.series) {
            event.dataTransfer.dropEffect = 'none';
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          row.classList.remove('drag-over');
          const fromId = event.dataTransfer.getData('text/plain') || dragId;
          let fromSeries = event.dataTransfer.getData('application/x-series');
          if (fromSeries === '' || fromSeries == null) fromSeries = dragSeries;
          if (fromSeries !== group.series) {
            showStatus('err', '只可以喺同一個系列入面調次序');
            return;
          }
          const toId = item.id;
          if (!fromId || fromId === toId) return;
          const groupIds = group.items.map((entry) => entry.id);
          const fromIndex = groupIds.indexOf(fromId);
          const toIndex = groupIds.indexOf(toId);
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

  async function persistOrder(seriesName, ids) {
    try {
      items = await guard(() => reorderSeries(period, seriesName, ids));
      showStatus('ok', '次序已儲存（編號已按系列更新）');
      render();
    } catch (err) {
      if (err && err.needsAuth) return;
      showStatus('err', err.message || '儲存次序失敗');
      await loadList();
    }
  }

  async function loadList() {
    statsEl.textContent = '載入緊…';
    try {
      items = await guard(() => fetchPeriodNumbered(period));
      pruneSelection();
      render();
    } catch (err) {
      if (err && err.needsAuth) return;
      statsEl.textContent = err.message || '載入失敗';
      listEl.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'empty';
      const strong = document.createElement('strong');
      strong.textContent = '載入失敗';
      empty.append(strong, document.createTextNode(err.message || ''));
      listEl.append(empty);
    }
  }

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentId) return;
    const data = Object.fromEntries(new FormData(editForm).entries());
    if (!String(data.name || '').trim()) {
      showEditMsg('err', '請填寫活動名稱');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = '儲存緊…';
    try {
      await guard(() => updateSubmission(currentId, period, data));
      closeEdit();
      showStatus('ok', '已更新活動資料');
      await loadList();
    } catch (err) {
      if (!(err && err.needsAuth)) showEditMsg('err', err.message || '儲存失敗');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '儲存修改';
    }
  });

  closeModalBtn.addEventListener('click', closeEdit);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeEdit();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (modal.classList.contains('show')) {
      closeEdit();
      return;
    }
    if (deleteMode) setDeleteMode(false);
  });
  refreshBtn.addEventListener('click', loadList);
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportBtn.disabled = true;
      guard(() => exportDetails(period))
        .catch((err) => {
          if (!(err && err.needsAuth)) showStatus('err', err.message || '匯出失敗，請稍後再試');
        })
        .then(() => {
          exportBtn.disabled = false;
        });
    });
  }
  if (deleteModeBtn) deleteModeBtn.addEventListener('click', () => setDeleteMode(!deleteMode));
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
      const list = selectedItems();
      if (!list.length) {
        showStatus('err', '請先勾選要刪除嘅活動');
        return;
      }
      deleteItems(list);
    });
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
      const status = await fetchAuthStatus().catch(() => ({ configured: true }));
      showLoggedOut(!!status.configured);
    });
  }

  updateDeleteModeUI();
  checkAuth();
}
