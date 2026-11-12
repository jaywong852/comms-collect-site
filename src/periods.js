const ISSUE_BASE_YEAR = 2027;
const ISSUE_BASE_NUMBER = 65;
const QUARTER_MONTHS = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };

export function parsePeriodId(id) {
  const match = String(id || '').match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  return { year: Number(match[1]), quarter: Number(match[2]), id: `${match[1]}-Q${match[2]}` };
}

export function periodRangeLabel(id) {
  const period = parsePeriodId(id);
  if (!period) return String(id || '');
  const range = QUARTER_MONTHS[period.quarter];
  return `${period.year}年${range[0]}–${range[1]}月`;
}

export function periodIssueNumber(id) {
  const period = parsePeriodId(id);
  if (!period) return null;
  return ISSUE_BASE_NUMBER + (period.year - ISSUE_BASE_YEAR) * 4 + (period.quarter - 1);
}

export function periodIssueLabel(id) {
  const issue = periodIssueNumber(id);
  return issue == null ? String(id || '') : `第${issue}期`;
}

export function periodLabel(id) {
  if (!parsePeriodId(id)) return String(id || '');
  return `${periodIssueLabel(id)}（${periodRangeLabel(id)}）`;
}

export function periodDisplayLabel(id) {
  return periodLabel(id);
}

export function periodLabelFallback(id) {
  return periodLabel(id);
}

export function periodMonths(id) {
  const period = parsePeriodId(id);
  if (!period) return [];
  const [start, end] = QUARTER_MONTHS[period.quarter];
  const months = [];
  for (let month = start; month <= end; month += 1) {
    months.push({ year: period.year, month });
  }
  return months;
}

export function periodSortKey(id) {
  const period = parsePeriodId(id);
  if (!period) return 0;
  return period.year * 10 + period.quarter;
}

export function periodFiscalStartYear(id) {
  const period = parsePeriodId(id);
  if (!period) return null;
  return period.quarter === 1 ? period.year - 1 : period.year;
}

export function periodFiscalYearLabel(id) {
  const start = periodFiscalStartYear(id);
  if (start == null) return '';
  return `${start}–${start + 1}年度`;
}

export function comparePeriodIdsForCatalog(a, b) {
  const fiscalA = periodFiscalStartYear(a);
  const fiscalB = periodFiscalStartYear(b);
  if (fiscalA == null && fiscalB == null) return String(a || '').localeCompare(String(b || ''), 'zh-HK');
  if (fiscalA == null) return 1;
  if (fiscalB == null) return -1;
  if (fiscalB !== fiscalA) return fiscalB - fiscalA;
  return periodSortKey(a) - periodSortKey(b);
}

export function listPeriods() {
  const count = 5;
  const out = [];
  let year = 2027;
  let quarter = 1;
  for (let i = 0; i < count; i += 1) {
    const id = `${year}-Q${quarter}`;
    out.push({
      id,
      issue: periodIssueNumber(id),
      issueLabel: periodIssueLabel(id),
      rangeLabel: periodRangeLabel(id),
      label: periodLabel(id),
      year,
      quarter,
    });
    quarter += 1;
    if (quarter > 4) {
      quarter = 1;
      year += 1;
    }
  }
  return out;
}

export function isKnownPeriod(id) {
  return listPeriods().some((period) => period.id === id);
}

export function groupPeriodsByFiscalYear(periods) {
  const groups = [];
  const map = {};
  (periods || []).forEach((period) => {
    const start = periodFiscalStartYear(period && period.id);
    const key = start == null ? 'other' : String(start);
    if (!map[key]) {
      map[key] = {
        startYear: start,
        label: start == null ? '其他' : periodFiscalYearLabel(period.id),
        periods: [],
      };
      groups.push(map[key]);
    }
    map[key].periods.push(period);
  });
  groups.sort((a, b) => {
    if (a.startYear == null && b.startYear == null) return 0;
    if (a.startYear == null) return 1;
    if (b.startYear == null) return -1;
    return b.startYear - a.startYear;
  });
  groups.forEach((group) => {
    group.periods.sort((a, b) => {
      const left = parsePeriodId(a && a.id);
      const right = parsePeriodId(b && b.id);
      if (!left && !right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return left.year * 10 + left.quarter - (right.year * 10 + right.quarter);
    });
  });
  return groups;
}

export function fetchPeriods() {
  return Promise.resolve(listPeriods());
}
