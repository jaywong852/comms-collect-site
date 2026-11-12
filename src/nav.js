import { pageHref } from './paths.js';
import { fetchPeriods, periodLabelFallback } from './periods.js';

export function bindHomeLink() {
  const link = document.getElementById('home-link');
  if (link) link.href = pageHref('index');
}

export function bindAdminLink() {
  const link = document.getElementById('admin-link');
  if (link) link.href = pageHref('admin');
}

export function bindPeriodNav(period) {
  const pages = {
    'submit-link': 'submit',
    'manage-link': 'manage',
    'calendar-link': 'calendar',
  };
  Object.entries(pages).forEach(([id, page]) => {
    const link = document.getElementById(id);
    if (link) link.href = pageHref(page, period ? { period } : null);
  });
}

export function showPeriodTitle(period, prefix) {
  const title = document.getElementById('period-title');
  return fetchPeriods()
    .then((periods) => {
      const found = periods.find((item) => item.id === period);
      const label = found ? found.label : periodLabelFallback(period);
      if (title) title.textContent = label;
      document.title = `${prefix}｜${label}`;
      return label;
    })
    .catch(() => {
      const label = periodLabelFallback(period);
      if (title) title.textContent = label;
      document.title = `${prefix}｜${label}`;
      return label;
    });
}
