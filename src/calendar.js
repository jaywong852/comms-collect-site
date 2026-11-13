import { fetchAuthStatus } from './auth.js';
import { fetchCalendar } from './data.js';
import { exportCalendar } from './exporters.js';
import { mountAuth } from './auth-ui.js';
import { bindHomeLink, bindPeriodNav, showPeriodTitle } from './nav.js';
import { requirePeriodOrRedirect } from './paths.js';

const period = requirePeriodOrRedirect();
if (period) {
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const monthsEl = document.getElementById('months');
  const unplacedCard = document.getElementById('unplaced-card');
  const unplacedList = document.getElementById('unplaced-list');
  const exportBtn = document.getElementById('export-btn');
  const authModal = document.getElementById('auth-modal');

  bindHomeLink();
  bindPeriodNav(period);
  showPeriodTitle(period, '日誌表');

  function closeAuthModal() {
    if (!authModal) return;
    authModal.classList.remove('show');
    authModal.setAttribute('aria-hidden', 'true');
  }

  function openAuthThenRetry(retry) {
    const panel = document.getElementById('auth-panel');
    if (!authModal || !panel) {
      alert('匯出 Word 要先登入後台。請先到活動一覽登入，再返嚟匯出。');
      return;
    }
    fetchAuthStatus()
      .then((status) => {
        if (status.isAdmin) {
          retry();
          return;
        }
        mountAuth(panel, {
          configured: status.configured,
          setupIntro: '第一次用請先設定後台帳號。設定之後就可以匯出日誌表。',
          loginIntro: '匯出 Word 要先登入後台。登入成功之後會再試一次匯出。',
          onSuccess: () => {
            closeAuthModal();
            retry();
          },
        });
        authModal.classList.add('show');
        authModal.setAttribute('aria-hidden', 'false');
      })
      .catch(() => {
        alert('未能確認登入狀態，請稍後再試');
      });
  }

  function renderMonth(month) {
    const section = document.createElement('section');
    section.className = 'card cal-month';
    const head = document.createElement('div');
    head.className = 'cal-month-head';
    head.innerHTML = '<div class="cal-month-en"></div><div class="cal-month-zh"></div>';
    head.querySelector('.cal-month-en').textContent = month.labelEn;
    head.querySelector('.cal-month-zh').textContent = month.labelZh;
    section.appendChild(head);

    const table = document.createElement('div');
    table.className = 'cal-grid';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', month.labelZh);
    WEEKDAYS.forEach((label) => {
      const cell = document.createElement('div');
      cell.className = 'cal-dow';
      cell.textContent = label;
      table.appendChild(cell);
    });

    (month.weeks || []).forEach((week) => {
      week.forEach((cell) => {
        const el = document.createElement('div');
        if (!cell) {
          el.className = 'cal-cell cal-empty';
          table.appendChild(el);
          return;
        }
        el.className = `cal-cell${cell.holiday ? ' cal-holiday' : ''}`;
        const dayNum = document.createElement('div');
        dayNum.className = `cal-daynum${cell.holiday ? ' cal-daynum-holiday' : ''}`;
        dayNum.textContent = String(cell.day);
        el.appendChild(dayNum);
        const body = document.createElement('div');
        body.className = 'cal-cell-body';
        if (cell.holiday && cell.holiday.name) {
          const holiday = document.createElement('div');
          holiday.className = 'cal-holiday-name';
          holiday.textContent = cell.holiday.name;
          body.appendChild(holiday);
        }
        (cell.items || []).forEach((item) => {
          const row = document.createElement('div');
          row.className = 'cal-item';
          const title = document.createElement('div');
          title.className = 'cal-num';
          const num = item.number || '';
          const name = item.name || '';
          if (num && name) title.textContent = `${num}. ${name}`;
          else if (num) title.textContent = num;
          else title.textContent = name || '—';
          row.appendChild(title);
          if (item.time) {
            const time = document.createElement('div');
            time.className = 'cal-time';
            time.textContent = item.time;
            row.appendChild(time);
          }
          body.appendChild(row);
        });
        el.appendChild(body);
        table.appendChild(el);
      });
    });

    section.appendChild(table);
    return section;
  }

  function renderUnplaced(list) {
    if (!list || !list.length) {
      unplacedCard.hidden = true;
      unplacedList.innerHTML = '';
      return;
    }
    unplacedCard.hidden = false;
    unplacedList.innerHTML = '';
    list.forEach((item) => {
      const el = document.createElement('article');
      el.className = 'item';
      el.style.cursor = 'default';
      const bits = [`編號：${item.number || '—'}`];
      if (item.date) bits.push(`日期原文：${item.date}`);
      if (item.time) bits.push(`時間：${item.time}`);
      el.innerHTML = '<h3></h3><div class="meta"></div>';
      el.querySelector('h3').textContent = `${item.number ? `${item.number}. ` : ''}${item.name || '（無標題）'}`;
      el.querySelector('.meta').textContent = bits.join('　·　');
      unplacedList.appendChild(el);
    });
  }

  async function load() {
    monthsEl.innerHTML = '<div class="card empty">載入日誌表…</div>';
    try {
      const json = await fetchCalendar(period);
      monthsEl.innerHTML = '';
      (json.months || []).forEach((month) => monthsEl.appendChild(renderMonth(month)));
      renderUnplaced(json.unplaced || []);
    } catch (err) {
      monthsEl.replaceChildren();
      const empty = document.createElement('div');
      empty.className = 'card empty';
      const strong = document.createElement('strong');
      strong.textContent = '載入失敗';
      empty.append(strong, document.createTextNode(err.message || ''));
      monthsEl.append(empty);
    }
  }

  function tryCalendarExport() {
    if (!exportBtn) return;
    exportBtn.disabled = true;
    exportCalendar(period)
      .catch((err) => {
        if (err && err.needsAuth) {
          openAuthThenRetry(tryCalendarExport);
          return;
        }
        alert(err.message || '匯出失敗，請稍後再試');
      })
      .then(() => {
        exportBtn.disabled = false;
      });
  }

  if (exportBtn) exportBtn.addEventListener('click', tryCalendarExport);
  if (authModal) {
    authModal.addEventListener('click', (event) => {
      if (event.target === authModal) closeAuthModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && authModal.classList.contains('show')) closeAuthModal();
    });
  }

  load();
}
