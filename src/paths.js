function siteBase() {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function pageHref(page, params) {
  const suffix = !page || page === 'index' ? '' : `${String(page).replace(/^\/+|\/+$/g, '')}/`;
  const url = new URL(`${siteBase()}${suffix}`, 'http://localhost');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

export function requirePeriodOrRedirect() {
  const period = new URLSearchParams(window.location.search).get('period') || '';
  if (!/^\d{4}-Q[1-4]$/.test(period)) {
    window.location.replace(pageHref('index'));
    return null;
  }
  return period;
}
