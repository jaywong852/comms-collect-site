import './supabase.js';
import { bindAdminLink } from './nav.js';
import { pageHref } from './paths.js';
import { fetchPeriods, groupPeriodsByFiscalYear, periodIssueLabel, periodRangeLabel } from './periods.js';

const root = document.getElementById('period-groups');
bindAdminLink();

function card(period) {
  const el = document.createElement('article');
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
  el.querySelector('.period-id').textContent = period.issueLabel || periodIssueLabel(period.id);
  el.querySelector('.period-label').textContent = period.rangeLabel || periodRangeLabel(period.id);
  el.querySelector('.submit-link').href = pageHref('submit', { period: period.id });
  el.querySelector('.manage-link').href = pageHref('manage', { period: period.id });
  el.querySelector('.calendar-link').href = pageHref('calendar', { period: period.id });
  return el;
}

function yearGroup(group) {
  const section = document.createElement('section');
  section.className = 'year-group';
  const heading = document.createElement('h3');
  heading.className = 'year-heading';
  heading.textContent = group.label;
  const grid = document.createElement('div');
  grid.className = 'period-grid';
  group.periods.forEach((period) => {
    grid.appendChild(card(period));
  });
  section.appendChild(heading);
  section.appendChild(grid);
  return section;
}

async function init() {
  try {
    const periods = await fetchPeriods();
    root.innerHTML = '';
    if (!periods.length) {
      root.innerHTML = '<div class="empty"><strong>未有通訊期</strong>請稍後再試。</div>';
      return;
    }
    groupPeriodsByFiscalYear(periods).forEach((group) => {
      root.appendChild(yearGroup(group));
    });
  } catch (err) {
    root.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'empty';
    const strong = document.createElement('strong');
    strong.textContent = '載入失敗';
    empty.append(strong, document.createTextNode(err.message || ''));
    root.append(empty);
  }
}

init();
