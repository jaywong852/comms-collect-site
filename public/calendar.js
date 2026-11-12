(function () {
  var period = CommsPeriods.requirePeriodOrRedirect();
  if (!period) return;

  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  var monthsEl = document.getElementById('months');
  var unplacedCard = document.getElementById('unplaced-card');
  var unplacedList = document.getElementById('unplaced-list');

  document.getElementById('submit-link').href =
    '/submit?period=' + encodeURIComponent(period);
  document.getElementById('manage-link').href =
    '/manage?period=' + encodeURIComponent(period);
  document.getElementById('calendar-link').href =
    '/calendar?period=' + encodeURIComponent(period);


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

  function closeAuthModal() {
    var backdrop = document.getElementById('auth-modal');
    if (!backdrop) return;
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
  }

  function openAuthThenRetry(retry) {
    var backdrop = document.getElementById('auth-modal');
    var panel = document.getElementById('auth-panel');
    if (!backdrop || !panel || !window.CommsAuth) {
      alert('匯出 Word 要先登入後台。請先到活動一覽登入，再返嚟匯出。');
      return;
    }
    CommsAuth.fetchStatus().then(function (status) {
      if (status.isAdmin) {
        retry();
        return;
      }
      CommsAuth.mount(panel, {
        configured: status.configured,
        setupIntro: '第一次用請先設定密碼。設定之後就可以匯出日誌表。',
        loginIntro: '匯出 Word 要先登入後台。登入成功之後會再試一次匯出。',
        onSuccess: function () {
          closeAuthModal();
          retry();
        },
      });
      backdrop.classList.add('show');
      backdrop.setAttribute('aria-hidden', 'false');
    }).catch(function () {
      alert('未能確認登入狀態，請稍後再試');
    });
  }

  function downloadExport(url, fallbackName) {
    return fetch(url, { credentials: 'same-origin' }).then(function (res) {
      if (res.status === 401) {
        var err = new Error('請先登入後台再匯出');
        err.needsAuth = true;
        throw err;
      }
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

  CommsPeriods.fetchPeriods()
    .then(function (periods) {
      var found = periods.find(function (p) { return p.id === period; });
      var label = found ? found.label : CommsPeriods.periodLabelFallback(period);
      document.getElementById('period-title').textContent = label;
      document.title = '日誌表｜' + label;
    })
    .catch(function () {
      document.getElementById('period-title').textContent =
        CommsPeriods.periodLabelFallback(period);
    });

  function renderMonth(month) {
    var section = document.createElement('section');
    section.className = 'card cal-month';

    var head = document.createElement('div');
    head.className = 'cal-month-head';
    head.innerHTML =
      '<div class="cal-month-en"></div><div class="cal-month-zh"></div>';
    head.querySelector('.cal-month-en').textContent = month.labelEn;
    head.querySelector('.cal-month-zh').textContent = month.labelZh;
    section.appendChild(head);

    var table = document.createElement('div');
    table.className = 'cal-grid';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', month.labelZh);

    WEEKDAYS.forEach(function (w) {
      var h = document.createElement('div');
      h.className = 'cal-dow';
      h.textContent = w;
      table.appendChild(h);
    });

    (month.weeks || []).forEach(function (week) {
      week.forEach(function (cell) {
        var el = document.createElement('div');
        if (!cell) {
          el.className = 'cal-cell cal-empty';
          table.appendChild(el);
          return;
        }
        el.className = 'cal-cell' + (cell.holiday ? ' cal-holiday' : '');
        var dayNum = document.createElement('div');
        dayNum.className = 'cal-daynum' + (cell.holiday ? ' cal-daynum-holiday' : '');
        dayNum.textContent = String(cell.day);
        el.appendChild(dayNum);

        var body = document.createElement('div');
        body.className = 'cal-cell-body';
        if (cell.holiday && cell.holiday.name) {
          var hol = document.createElement('div');
          hol.className = 'cal-holiday-name';
          hol.textContent = cell.holiday.name;
          body.appendChild(hol);
        }
        (cell.items || []).forEach(function (item) {
          var row = document.createElement('div');
          row.className = 'cal-item';
          var title = document.createElement('div');
          title.className = 'cal-num';
          var num = item.number || '';
          var name = item.name || '';
          if (num && name) title.textContent = num + '. ' + name;
          else if (num) title.textContent = num;
          else title.textContent = name || '—';
          row.appendChild(title);
          if (item.time) {
            var time = document.createElement('div');
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
    list.forEach(function (item) {
      var el = document.createElement('article');
      el.className = 'item';
      el.style.cursor = 'default';
      var bits = [];
      bits.push('編號：' + (item.number || '—'));
      if (item.date) bits.push('日期原文：' + item.date);
      if (item.time) bits.push('時間：' + item.time);
      el.innerHTML = '<h3></h3><div class="meta"></div>';
      el.querySelector('h3').textContent =
        (item.number ? item.number + '. ' : '') + (item.name || '（無標題）');
      el.querySelector('.meta').textContent = bits.join('　·　');
      unplacedList.appendChild(el);
    });
  }

  async function load() {
    monthsEl.innerHTML = '<div class="card empty">載入日誌表…</div>';
    try {
      var res = await fetch('/api/calendar?period=' + encodeURIComponent(period));
      var json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '載入失敗');
      monthsEl.innerHTML = '';
      (json.months || []).forEach(function (m) {
        monthsEl.appendChild(renderMonth(m));
      });
      renderUnplaced(json.unplaced || []);
    } catch (err) {
      monthsEl.innerHTML =
        '<div class="card empty"><strong>載入失敗</strong>' +
        (err.message || '') +
        '</div>';
    }
  }

  load();

  var exportBtn = document.getElementById('export-btn');
  function tryCalendarExport() {
    if (!exportBtn) return;
    exportBtn.disabled = true;
    downloadExport(
      '/api/export/calendar?period=' + encodeURIComponent(period),
      '活動一覽表.docx'
    ).catch(function (err) {
      if (err && err.needsAuth) {
        openAuthThenRetry(tryCalendarExport);
        return;
      }
      alert(err.message || '匯出失敗，請稍後再試');
    }).then(function () {
      exportBtn.disabled = false;
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', tryCalendarExport);
  }

  var authModal = document.getElementById('auth-modal');
  if (authModal) {
    authModal.addEventListener('click', function (e) {
      if (e.target === authModal) closeAuthModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && authModal.classList.contains('show')) {
        closeAuthModal();
      }
    });
  }
})();
