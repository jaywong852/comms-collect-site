(function () {
  var root = document.getElementById('period-groups');

  function card(period) {
    var el = document.createElement('article');
    el.className = 'period-card';
    el.innerHTML =
      '<div class="period-card-top">' +
      '<strong class="period-id"></strong>' +
      '<div class="period-label"></div>' +
      '</div>' +
      '<div class="period-actions">' +
      '<a class="btn btn-primary submit-link">新增活動</a>' +
      '<a class="btn btn-secondary manage-link">活動一覽</a>' +
      '<a class="btn btn-secondary calendar-link">日誌表</a>' +
      '</div>';
    el.querySelector('.period-id').textContent =
      period.issueLabel || CommsPeriods.periodIssueLabel(period.id);
    el.querySelector('.period-label').textContent =
      period.rangeLabel || CommsPeriods.periodRangeLabel(period.id);
    el.querySelector('.submit-link').href = '/submit?period=' + encodeURIComponent(period.id);
    el.querySelector('.manage-link').href = '/manage?period=' + encodeURIComponent(period.id);
    el.querySelector('.calendar-link').href = '/calendar?period=' + encodeURIComponent(period.id);
    return el;
  }

  function yearGroup(group) {
    var section = document.createElement('section');
    section.className = 'year-group';
    var heading = document.createElement('h3');
    heading.className = 'year-heading';
    heading.textContent = group.label;
    var grid = document.createElement('div');
    grid.className = 'period-grid';
    group.periods.forEach(function (p) {
      grid.appendChild(card(p));
    });
    section.appendChild(heading);
    section.appendChild(grid);
    return section;
  }

  async function init() {
    try {
      var periods = await CommsPeriods.fetchPeriods();
      root.innerHTML = '';
      if (!periods.length) {
        root.innerHTML = '<div class="empty"><strong>未有通訊期</strong>請稍後再試。</div>';
        return;
      }
      CommsPeriods.groupPeriodsByFiscalYear(periods).forEach(function (g) {
        root.appendChild(yearGroup(g));
      });
    } catch (err) {
      root.innerHTML =
        '<div class="empty"><strong>載入失敗</strong>' + (err.message || '') + '</div>';
    }
  }

  init();
})();
