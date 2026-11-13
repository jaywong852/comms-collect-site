'use strict';

/** Fixed series priority (活動編號以系列為先). */
const SERIES_LIST = [
  '興趣及運動系列',
  '心思學院系列',
  '治療及支援小組系列',
  '社交聯誼及會員發展系列',
  '健康管理系列',
  '社區聯繫',
  '青少年系列',
  '小家屬系列',
];

const SERIES_EMPTY = '';
const SERIES_EMPTY_LABEL = '未分類';

function seriesRank(series) {
  const s = String(series || '').trim();
  if (!s) return SERIES_LIST.length;
  const i = SERIES_LIST.indexOf(s);
  return i >= 0 ? i : SERIES_LIST.length;
}

function normalizeSeries(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return SERIES_EMPTY;
  if (SERIES_LIST.includes(s)) return s;
  return SERIES_EMPTY;
}

function seriesLabel(series) {
  const s = normalizeSeries(series);
  return s || SERIES_EMPTY_LABEL;
}

function compareBySeriesThenOrder(a, b) {
  const ra = seriesRank(a.series);
  const rb = seriesRank(b.series);
  if (ra !== rb) return ra - rb;
  const ao = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
  const bo = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
  if (ao !== bo) return ao - bo;
  return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
}

/**
 * Sort period items by series priority then within-series order,
 * rewrite sortOrder 0..n-1 and number 1..n globally.
 * Returns new full list (other periods untouched).
 */
function reindexPeriodInList(all, period) {
  const others = all.filter((s) => s.period !== period);
  const mine = all
    .filter((s) => s.period === period)
    .map((s) => ({ ...s, series: normalizeSeries(s.series) }))
    .sort(compareBySeriesThenOrder)
    .map((s, i) => ({
      ...s,
      sortOrder: i,
      number: String(i + 1),
    }));
  return others.concat(mine);
}

export {
  SERIES_LIST,
  SERIES_EMPTY,
  SERIES_EMPTY_LABEL,
  seriesRank,
  normalizeSeries,
  seriesLabel,
  compareBySeriesThenOrder,
  reindexPeriodInList,
};
