(function (global) {
  var ISSUE_BASE_YEAR = 2027;
  var ISSUE_BASE_NUMBER = 65;
  var QUARTER_MONTHS = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };

  function parsePeriodId(id) {
    var m = String(id || '').match(/^(\d{4})-Q([1-4])$/);
    if (!m) return null;
    return { year: Number(m[1]), quarter: Number(m[2]) };
  }

  function periodRangeLabel(id) {
    var p = parsePeriodId(id);
    if (!p) return id || '';
    var range = QUARTER_MONTHS[p.quarter];
    return p.year + '年' + range[0] + '–' + range[1] + '月';
  }

  function periodIssueNumber(id) {
    var p = parsePeriodId(id);
    if (!p) return null;
    return ISSUE_BASE_NUMBER + (p.year - ISSUE_BASE_YEAR) * 4 + (p.quarter - 1);
  }

  function periodIssueLabel(id) {
    var n = periodIssueNumber(id);
    return n == null ? (id || '') : '第' + n + '期';
  }

  function periodDisplayLabel(id) {
    if (!parsePeriodId(id)) return id || '';
    return periodIssueLabel(id) + '（' + periodRangeLabel(id) + '）';
  }

  function periodLabelFallback(id) {
    return periodDisplayLabel(id);
  }

  // April–March 年度: Q1 (Jan–Mar) belongs to the previous 年度.
  function periodFiscalStartYear(id) {
    var p = parsePeriodId(id);
    if (!p) return null;
    return p.quarter === 1 ? p.year - 1 : p.year;
  }

  function periodFiscalYearLabel(id) {
    var start = periodFiscalStartYear(id);
    if (start == null) return '';
    return start + '–' + (start + 1) + '年度';
  }

  function groupPeriodsByFiscalYear(periods) {
    var groups = [];
    var map = {};
    (periods || []).forEach(function (period) {
      var start = periodFiscalStartYear(period && period.id);
      var key = start == null ? 'other' : String(start);
      if (!map[key]) {
        var label =
          start == null
            ? '其他'
            : periodFiscalYearLabel(period.id);
        map[key] = { startYear: start, label: label, periods: [] };
        groups.push(map[key]);
      }
      map[key].periods.push(period);
    });
    groups.sort(function (a, b) {
      if (a.startYear == null && b.startYear == null) return 0;
      if (a.startYear == null) return 1;
      if (b.startYear == null) return -1;
      return b.startYear - a.startYear;
    });
    groups.forEach(function (g) {
      g.periods.sort(function (a, b) {
        var pa = parsePeriodId(a && a.id);
        var pb = parsePeriodId(b && b.id);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        return pa.year * 10 + pa.quarter - (pb.year * 10 + pb.quarter);
      });
    });
    return groups;
  }

  function getQueryPeriod() {
    var params = new URLSearchParams(window.location.search);
    return params.get('period') || '';
  }

  async function fetchPeriods() {
    var res = await fetch('/api/periods');
    var json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || '載入通訊期失敗');
    return json.periods || [];
  }

  function requirePeriodOrRedirect() {
    var period = getQueryPeriod();
    if (!/^\d{4}-Q[1-4]$/.test(period)) {
      window.location.replace('/');
      return null;
    }
    return period;
  }

  global.CommsPeriods = {
    periodRangeLabel: periodRangeLabel,
    periodIssueNumber: periodIssueNumber,
    periodIssueLabel: periodIssueLabel,
    periodDisplayLabel: periodDisplayLabel,
    periodLabelFallback: periodLabelFallback,
    periodFiscalStartYear: periodFiscalStartYear,
    periodFiscalYearLabel: periodFiscalYearLabel,
    groupPeriodsByFiscalYear: groupPeriodsByFiscalYear,
    getQueryPeriod: getQueryPeriod,
    fetchPeriods: fetchPeriods,
    requirePeriodOrRedirect: requirePeriodOrRedirect,
  };
})(window);
