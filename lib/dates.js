'use strict';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtYmd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function isValidYmd(y, m, d) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Pull day numbers from the text after a month, ignoring optional 日 and
 * optional weekday labels in () or （）, e.g. 11, 11日, 11(一), 11日(一).
 * Weekday text is ignored and not validated against the calendar.
 */
function extractDays(raw) {
  const days = [];
  const re = /(\d{1,2})\s*(?:日)?\s*(?:[\(（]\s*(?:週|星期|周)?[一二三四五六日天]\s*[\)）])?/g;
  let m;
  while ((m = re.exec(String(raw))) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= 31) days.push(n);
  }
  return days;
}

/**
 * Parse free-text HK activity dates into YYYY-MM-DD list.
 * Supports dateList, YYYY-MM-DD, 2027年5月1日, 5月1日, 10月9、30日,
 * 10月9、30日；11月13、27日, 4月5日(五), and optional weekday annotations
 * such as 1月11(一)、12(二)日 or 1月11日(一)、12日(二). Year defaults to periodYear.
 */
function parseActivityDates(entry, periodYear) {
  const out = [];
  const seen = new Set();

  function push(y, m, d) {
    if (!isValidYmd(y, m, d)) return;
    const s = fmtYmd(y, m, d);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }

  if (Array.isArray(entry && entry.dateList)) {
    for (const item of entry.dateList) {
      const s = String(item || '').trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) push(Number(m[1]), Number(m[2]), Number(m[3]));
    }
    if (out.length) return out;
  }

  const raw = String((entry && entry.date) || '').trim();
  if (!raw) return out;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    push(Number(m[1]), Number(m[2]), Number(m[3]));
    return out;
  }

  const segments = raw.split(/[；;]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const monthRe = /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月/g;
    const months = [];
    let m;
    while ((m = monthRe.exec(seg)) !== null) {
      months.push({
        year: m[1] ? Number(m[1]) : null,
        month: Number(m[2]),
        end: m.index + m[0].length,
        start: m.index,
      });
    }
    if (months.length) {
      let y = Number(periodYear) || new Date().getFullYear();
      for (let i = 0; i < months.length; i++) {
        const cur = months[i];
        if (cur.year) y = cur.year;
        const rest = seg.slice(cur.end, i + 1 < months.length ? months[i + 1].start : seg.length);
        for (const d of extractDays(rest)) push(y, cur.month, d);
      }
      continue;
    }
    const isos = seg.match(/\d{4}-\d{2}-\d{2}/g);
    if (isos) {
      for (const s of isos) {
        const mm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (mm) push(Number(mm[1]), Number(mm[2]), Number(mm[3]));
      }
    }
  }
  return out;
}

function normalizeDateListInput(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
  }
  if (value == null || value === '') return [];
  return String(value)
    .split(/[\s,，;；]+/)
    .map((v) => v.trim())
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v));
}

function buildMonthGrid(year, month, dayMap, holidayLookup) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = first.getUTCDay();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = fmtYmd(year, month, d);
    const items = (dayMap.get(key) || []).slice().sort((a, b) => {
      const cmp = String(a.number || '').localeCompare(String(b.number || ''), 'zh-HK', {
        numeric: true,
      });
      if (cmp !== 0) return cmp;
      return String(a.time || '').localeCompare(String(b.time || ''), 'zh-HK');
    });
    const hol =
      typeof holidayLookup === 'function' ? holidayLookup(key) : holidayLookup && holidayLookup[key];
    cells.push({
      day: d,
      date: key,
      items,
      holiday: hol ? { name: hol.name, date: hol.date || key } : null,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

module.exports = {
  parseActivityDates,
  normalizeDateListInput,
  buildMonthGrid,
  fmtYmd,
};
