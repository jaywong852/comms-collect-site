import { buildMonthGrid, parseActivityDates } from '../lib/dates.js';
import { getHoliday } from '../lib/hk-holidays.js';
import { compareBySeriesThenOrder } from '../lib/series.js';
import { parsePeriodId, periodLabel, periodMonths } from './periods.js';

const MONTH_NAMES_EN = [
  '',
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

export function withNumbers(list) {
  return (list || [])
    .slice()
    .sort(compareBySeriesThenOrder)
    .map((item, index) => ({
      ...item,
      number: String(index + 1),
    }));
}

export function buildCalendarPayload(period, list) {
  const parsed = parsePeriodId(period);
  const year = parsed ? parsed.year : new Date().getFullYear();
  const monthsMeta = periodMonths(period);
  const ordered = withNumbers(list);
  const dayMap = new Map();
  const unplaced = [];

  for (const item of ordered) {
    const dates = parseActivityDates(item, year);
    const cellItem = {
      id: item.id,
      number: String(item.number || ''),
      time: item.time || '',
      name: item.name || '',
    };
    if (!dates.length) {
      unplaced.push({
        id: item.id,
        number: String(item.number || ''),
        name: item.name || '',
        date: item.date || '',
        time: item.time || '',
      });
      continue;
    }
    let placed = false;
    for (const ymd of dates) {
      const [yy, mm] = ymd.split('-').map(Number);
      const inPeriod = monthsMeta.some((month) => month.year === yy && month.month === mm);
      if (!inPeriod) continue;
      if (!dayMap.has(ymd)) dayMap.set(ymd, []);
      dayMap.get(ymd).push(cellItem);
      placed = true;
    }
    if (!placed) {
      unplaced.push({
        id: item.id,
        number: String(item.number || ''),
        name: item.name || '',
        date: item.date || '',
        time: item.time || '',
        parsedDates: dates,
      });
    }
  }

  const months = monthsMeta.map(({ year: monthYear, month }) => ({
    year: monthYear,
    month,
    labelZh: `${monthYear}年${month}月`,
    labelEn: `${MONTH_NAMES_EN[month]} ${monthYear}`,
    weeks: buildMonthGrid(monthYear, month, dayMap, getHoliday),
  }));

  return {
    ok: true,
    period,
    periodLabel: periodLabel(period),
    months,
    unplaced,
    submissions: ordered,
  };
}
