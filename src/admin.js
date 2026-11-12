import { fetchAuthStatus, logout } from './auth.js';
import { deleteSubmissions, fetchAdminList } from './data.js';
import { mountAuth } from './auth-ui.js';
import { bindHomeLink } from './nav.js';
import { fetchPeriods, periodLabelFallback } from './periods.js';

const loginPanel = document.getElementById('login-panel');
const adminPanel = document.getElementById('admin-panel');
const listEl = document.getElementById('list');
const statsEl = document.getElementById('stats');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');
const periodFilter = document.getElementById('period-filter');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');
const deleteBtn = document.getElementById('delete-btn');

let currentId = null;
let currentPeriod = null;

const LABELS = [
  ['periodLabel', '通訊期'],
  ['name', '活動名稱'],
  ['summary', '簡介'],
  ['content', '內容'],
  ['date', '日期'],
  ['time', '時間'],
  ['location', '地點'],
  ['assemblyTime', '集合時間'],
  ['assemblyPlace', '集合地點'],
  ['audience', '對象'],
  ['quota', '名額'],
  ['fee', '費用'],
  ['contact', '負責人'],
  ['notes', '備註'],
  ['sortOrder', '次序'],
  ['submittedAt', '提交時間'],
];

bindHomeLink();

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-HK', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return iso;
  }
}

function dash(value) {
  if (value === 0) return '0';
  const text = String(value == null ? '' : value).trim();
  return text || '—';
}

function setAuthed(isAuthed) {
  loginPanel.hidden = !!isAuthed;
  adminPanel.hidden = !isAuthed;
}

function mountAuthPanel(configured) {
  mountAuth(loginPanel, {
    configured: !!configured,
    setupIntro: '第一次用請先設定後台帳號，用嚟進入後台同管理活動一覽。',
    loginIntro: '後台用嚟總覽各期通訊稿。活動一覽嘅編輯、排序、刪除同匯出都要用呢個帳號。',
    onSuccess: () => {
      afterLogin();
    },
  });
}

async function afterLogin() {
  setAuthed(true);
  await fillPeriodFilter();
  await loadList();
}

async function showLoggedOut() {
  setAuthed(false);
  const status = await fetchAuthStatus().catch(() => ({ configured: false }));
  mountAuthPanel(status.configured);
}

async function fillPeriodFilter() {
  try {
    const periods = await fetchPeriods();
    const current = periodFilter.value;
    periodFilter.innerHTML = '<option value="">全部時期</option>';
    periods.forEach((period) => {
      const option = document.createElement('option');
      option.value = period.id;
      option.textContent = period.label || periodLabelFallback(period.id);
      periodFilter.appendChild(option);
    });
    periodFilter.value = current;
  } catch (_) {
    /* keep the existing options */
  }
}

function openModal(item) {
  currentId = item.id;
  currentPeriod = item.period;
  modalTitle.textContent = item.name || '通訊稿詳情';
  modalBody.innerHTML = '';
  const view = { ...item, periodLabel: item.periodLabel || periodLabelFallback(item.period) };
  LABELS.forEach(([key, label]) => {
    const div = document.createElement('div');
    const full =
      key === 'summary' ||
      key === 'content' ||
      key === 'notes' ||
      key === 'location' ||
      key === 'assemblyPlace' ||
      key === 'submittedAt' ||
      key === 'periodLabel';
    div.className = `detail${full ? ' full' : ''}`;
    const value = key === 'submittedAt' ? formatTime(view[key]) : dash(view[key]);
    div.innerHTML = `<span class="k">${label}</span><div class="v"></div>`;
    div.querySelector('.v').textContent = value;
    modalBody.appendChild(div);
  });
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  currentId = null;
  currentPeriod = null;
}

function renderList(items) {
  const cache = items || [];
  statsEl.textContent = cache.length === 0 ? '暫時未有提交' : `共 ${cache.length} 份通訊稿`;
  if (!cache.length) {
    listEl.innerHTML = '<div class="empty"><strong>仲未有通訊稿</strong>公開表單有人提交之後，就會喺呢度出現。</div>';
    return;
  }
  listEl.innerHTML = '';
  cache.forEach((item) => {
    const el = document.createElement('article');
    el.className = 'item';
    el.tabIndex = 0;
    el.innerHTML =
      '<div class="item-top"><div><div class="pill soft"></div><h3></h3><div class="meta"></div></div>' +
      '<button class="btn btn-secondary view-btn" type="button">睇詳情</button></div>';
    el.querySelector('.pill').textContent = item.periodLabel || periodLabelFallback(item.period);
    el.querySelector('h3').textContent = item.name || '（無標題）';
    const bits = [
      `次序：${typeof item.sortOrder === 'number' ? item.sortOrder + 1 : '—'}`,
      `提交：${formatTime(item.submittedAt)}`,
    ];
    if (item.contact) bits.push(`負責人：${item.contact}`);
    el.querySelector('.meta').textContent = bits.join('　·　');
    const open = () => openModal(item);
    el.querySelector('.view-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      open();
    });
    el.addEventListener('click', open);
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    listEl.appendChild(el);
  });
}

async function loadList() {
  statsEl.textContent = '載入緊…';
  try {
    renderList(await fetchAdminList(periodFilter.value));
  } catch (err) {
    if (err && err.needsAuth) {
      showLoggedOut();
      return;
    }
    statsEl.textContent = err.message || '載入失敗';
  }
}

async function checkSession() {
  try {
    const status = await fetchAuthStatus();
    if (status.isAdmin) await afterLogin();
    else {
      setAuthed(false);
      mountAuthPanel(status.configured);
    }
  } catch (_) {
    setAuthed(false);
    mountAuthPanel(false);
  }
}

refreshBtn.addEventListener('click', loadList);
periodFilter.addEventListener('change', loadList);
logoutBtn.addEventListener('click', async () => {
  await logout();
  await showLoggedOut();
});
closeModalBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});
deleteBtn.addEventListener('click', async () => {
  if (!currentId || !currentPeriod) return;
  if (!confirm('確定刪除呢份通訊稿？刪咗就唔可以還原。')) return;
  try {
    await deleteSubmissions(currentPeriod, [currentId]);
    closeModal();
    await loadList();
  } catch (err) {
    alert(err.message || '刪除失敗');
  }
});

checkSession();
