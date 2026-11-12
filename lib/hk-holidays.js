'use strict';

/**
 * Hong Kong general holidays (公眾假期) for years used by this site.
 *
 * 2027: gazetted — https://www.gov.hk/en/about/abouthk/holiday/2027.htm
 *       (press release May 2026)
 * 2028: not yet gazetted as of build time; dates follow standing rules /
 *       lunar calendar + common calendars (provisional until gazette).
 *
 * Names are short Traditional Chinese labels suited to calendar cells.
 */

const HOLIDAYS_BY_YEAR = {
  2027: [
    ['2027-01-01', '元旦'],
    ['2027-02-06', '農曆年初一'],
    ['2027-02-08', '農曆年初三'],
    ['2027-02-09', '農曆年初四'],
    ['2027-03-26', '耶穌受難節'],
    ['2027-03-27', '耶穌受難節翌日'],
    ['2027-03-29', '復活節星期一'],
    ['2027-04-05', '清明節'],
    ['2027-05-01', '勞動節'],
    ['2027-05-13', '佛誕'],
    ['2027-06-09', '端午節'],
    ['2027-07-01', '香港特別行政區成立紀念日'],
    ['2027-09-16', '中秋節翌日'],
    ['2027-10-01', '國慶日'],
    ['2027-10-08', '重陽節'],
    ['2027-12-25', '聖誕節'],
    ['2027-12-27', '聖誕節後首個工作日'],
  ],
  2028: [
    ['2028-01-01', '元旦'],
    ['2028-01-26', '農曆年初一'],
    ['2028-01-27', '農曆年初二'],
    ['2028-01-28', '農曆年初三'],
    ['2028-04-04', '清明節'],
    ['2028-04-14', '耶穌受難節'],
    ['2028-04-15', '耶穌受難節翌日'],
    ['2028-04-17', '復活節星期一'],
    ['2028-05-01', '勞動節'],
    ['2028-05-02', '佛誕'],
    ['2028-05-29', '端午節'],
    ['2028-07-01', '香港特別行政區成立紀念日'],
    ['2028-10-02', '國慶日補假'],
    ['2028-10-04', '中秋節翌日'],
    ['2028-10-26', '重陽節'],
    ['2028-12-25', '聖誕節'],
    ['2028-12-26', '聖誕節後首個工作日'],
  ],
};

/** @type {Map<string, { date: string, name: string }>} */
const INDEX = new Map();
for (const year of Object.keys(HOLIDAYS_BY_YEAR)) {
  for (const [date, name] of HOLIDAYS_BY_YEAR[year]) {
    INDEX.set(date, { date, name });
  }
}

function getHoliday(ymd) {
  return INDEX.get(String(ymd)) || null;
}

function holidaysInMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const out = [];
  for (const [date, info] of INDEX) {
    if (date.startsWith(prefix)) out.push(info);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

module.exports = {
  HOLIDAYS_BY_YEAR,
  getHoliday,
  holidaysInMonth,
};
