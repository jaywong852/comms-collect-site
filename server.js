'use strict';

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  parseActivityDates,
  normalizeDateListInput,
  buildMonthGrid,
} = require('./lib/dates');
const { getHoliday } = require('./lib/hk-holidays');
const {
  SERIES_LIST,
  SERIES_EMPTY_LABEL,
  normalizeSeries,
  seriesLabel,
  reindexPeriodInList,
  compareBySeriesThenOrder,
} = require('./lib/series');
const { buildDetailsDoc, buildCalendarDoc } = require('./lib/export-word');
const adminAuth = require('./lib/admin-auth');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');
const SESSION_SECRET = adminAuth.loadSessionSecret(DATA_DIR);
const COOKIE_SECURE = adminAuth.isCookieSecure();

const QUARTER_MONTHS = {
  1: [1, 3],
  2: [4, 6],
  3: [7, 9],
  4: [10, 12],
};

// 2027-Q1 is issue 65; later quarters increment by 1.
const ISSUE_BASE_YEAR = 2027;
const ISSUE_BASE_NUMBER = 65;

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

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (COOKIE_SECURE) {
  app.set('trust proxy', 1);
}
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]\n', 'utf8');
}

function parsePeriodId(id) {
  const m = String(id || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return null;
  return { year: Number(m[1]), quarter: Number(m[2]), id: `${m[1]}-Q${m[2]}` };
}

function periodRangeLabel(id) {
  const p = parsePeriodId(id);
  if (!p) return String(id || '');
  const [start, end] = QUARTER_MONTHS[p.quarter];
  return `${p.year}年${start}–${end}月`;
}

function periodIssueNumber(id) {
  const p = parsePeriodId(id);
  if (!p) return null;
  return ISSUE_BASE_NUMBER + (p.year - ISSUE_BASE_YEAR) * 4 + (p.quarter - 1);
}

function periodIssueLabel(id) {
  const n = periodIssueNumber(id);
  return n == null ? String(id || '') : `第${n}期`;
}

function periodLabel(id) {
  const p = parsePeriodId(id);
  if (!p) return String(id || '');
  return `${periodIssueLabel(id)}（${periodRangeLabel(id)}）`;
}

function periodMonths(id) {
  const p = parsePeriodId(id);
  if (!p) return [];
  const [start, end] = QUARTER_MONTHS[p.quarter];
  const months = [];
  for (let m = start; m <= end; m++) months.push({ year: p.year, month: m });
  return months;
}

function periodSortKey(id) {
  const p = parsePeriodId(id);
  if (!p) return 0;
  return p.year * 10 + p.quarter;
}

function periodFiscalStartYear(id) {
  const p = parsePeriodId(id);
  if (!p) return null;
  return p.quarter === 1 ? p.year - 1 : p.year;
}

function comparePeriodIdsForCatalog(a, b) {
  const fa = periodFiscalStartYear(a);
  const fb = periodFiscalStartYear(b);
  if (fa == null && fb == null) return String(a || '').localeCompare(String(b || ''), 'zh-HK');
  if (fa == null) return 1;
  if (fb == null) return -1;
  if (fb !== fa) return fb - fa;
  return periodSortKey(a) - periodSortKey(b);
}

function catalogSubmission(s) {
  return {
    id: s.id,
    period: s.period,
    name: s.name || '',
    series: s.series || '',
    summary: s.summary || '',
    content: s.content || '',
    date: s.date || '',
    time: s.time || '',
    location: s.location || '',
    assemblyTime: s.assemblyTime || '',
    assemblyPlace: s.assemblyPlace || '',
    audience: s.audience || '',
    quota: s.quota || '',
    fee: s.fee || '',
    contact: s.contact || '',
    notes: s.notes || '',
  };
}

function buildSubmissionsCatalog() {
  const list = readSubmissions();
  const byPeriod = new Map();
  for (const s of list) {
    const id = s.period || '';
    if (!byPeriod.has(id)) byPeriod.set(id, []);
    byPeriod.get(id).push(s);
  }
  const periodIds = [...byPeriod.keys()].sort(comparePeriodIdsForCatalog);
  return {
    ok: true,
    periods: periodIds.map((id) => ({
      id,
      label: periodLabel(id),
      issueLabel: periodIssueLabel(id),
      rangeLabel: periodRangeLabel(id),
      submissions: byPeriod.get(id).slice().sort(compareBySeriesThenOrder).map(catalogSubmission),
    })),
  };
}


function listPeriods() {
  const startYear = 2027;
  const startQ = 1;
  const count = 5;
  const out = [];
  let y = startYear;
  let q = startQ;
  for (let i = 0; i < count; i++) {
    const id = `${y}-Q${q}`;
    out.push({
      id,
      issue: periodIssueNumber(id),
      issueLabel: periodIssueLabel(id),
      rangeLabel: periodRangeLabel(id),
      label: periodLabel(id),
      year: y,
      quarter: q,
    });
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return out;
}

function isKnownPeriod(id) {
  return listPeriods().some((p) => p.id === id);
}

function sanitizeText(value, maxLen) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

function sanitizeNumber(value) {
  if (value == null || value === '') return '';
  return String(value).trim().slice(0, 20);
}

function migrateEntry(entry, index) {
  const next = { ...entry };
  if (!next.period || !parsePeriodId(next.period)) next.period = '2027-Q2';
  if (typeof next.sortOrder !== 'number' || Number.isNaN(next.sortOrder)) {
    next.sortOrder = index;
  }
  next.series = normalizeSeries(next.series);
  next.number = String(next.sortOrder + 1);
  if (!Array.isArray(next.dateList)) next.dateList = [];
  if (next.assemblyTime == null) next.assemblyTime = '';
  if (next.assemblyPlace == null) next.assemblyPlace = '';
  return next;
}

function reindexAndSave(period) {
  const next = reindexPeriodInList(readSubmissions(), period);
  writeSubmissions(next);
  return next.filter((s) => s.period === period).sort(compareBySeriesThenOrder);
}

function readSubmissions() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    const list = Array.isArray(parsed) ? parsed : [];
    let changed = false;
    const migrated = list.map((entry, i) => {
      const before = JSON.stringify(entry);
      const after = migrateEntry(entry, i);
      if (JSON.stringify(after) !== before) changed = true;
      return after;
    });
    if (changed) writeSubmissions(migrated);
    return migrated;
  } catch (err) {
    console.error('讀取 submissions 失敗：', err.message);
    return [];
  }
}

function writeSubmissions(list) {
  ensureDataFile();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, error: '未登入後台' });
}

function nextSortOrder(list, period) {
  let max = -1;
  for (const s of list) {
    if (s.period === period && typeof s.sortOrder === 'number' && s.sortOrder > max) {
      max = s.sortOrder;
    }
  }
  return max + 1;
}

function nextActivityNumber(list, period) {
  let max = 0;
  for (const s of list) {
    if (s.period !== period) continue;
    const n = parseFloat(String(s.number || ''));
    if (!Number.isNaN(n) && n > max) max = Math.floor(n);
  }
  return String(max + 1);
}

function sortByOrder(a, b) {
  return compareBySeriesThenOrder(a, b);
}

function pickFields(body) {
  const dateList = normalizeDateListInput(body.dateList);
  return {
    name: sanitizeText(body.name, 200),
    summary: sanitizeText(body.summary, 1000),
    content: sanitizeText(body.content, 8000),
    date: sanitizeText(body.date, 200),
    time: sanitizeText(body.time, 80),
    location: sanitizeText(body.location, 300),
    assemblyTime: sanitizeText(body.assemblyTime, 80),
    assemblyPlace: sanitizeText(body.assemblyPlace, 300),
    audience: sanitizeText(body.audience, 300),
    quota: sanitizeText(body.quota, 80),
    fee: sanitizeText(body.fee, 120),
    contact: sanitizeText(body.contact, 120),
    notes: sanitizeText(body.notes, 2000),
    series: normalizeSeries(body.series),
    dateList,
  };
}

function syncNumberFromOrder(entry) {
  const order = typeof entry.sortOrder === 'number' ? entry.sortOrder : 0;
  return { ...entry, number: String(order + 1) };
}


function buildCalendarPayload(period) {
  const p = parsePeriodId(period);
  const monthsMeta = periodMonths(period);
  const list = readSubmissions()
    .filter((s) => s.period === period)
    .slice()
    .sort(sortByOrder);

  const dayMap = new Map();
  const unplaced = [];

  for (const s of list) {
    const dates = parseActivityDates(s, p.year);
    const cellItem = {
      id: s.id,
      number: String(s.number || ''),
      time: s.time || '',
      name: s.name || '',
    };
    if (!dates.length) {
      unplaced.push({
        id: s.id,
        number: String(s.number || ''),
        name: s.name || '',
        date: s.date || '',
        time: s.time || '',
      });
      continue;
    }
    let placed = false;
    for (const ymd of dates) {
      const [yy, mm] = ymd.split('-').map(Number);
      const inPeriod = monthsMeta.some((m) => m.year === yy && m.month === mm);
      if (!inPeriod) continue;
      if (!dayMap.has(ymd)) dayMap.set(ymd, []);
      dayMap.get(ymd).push(cellItem);
      placed = true;
    }
    if (!placed) {
      unplaced.push({
        id: s.id,
        number: String(s.number || ''),
        name: s.name || '',
        date: s.date || '',
        time: s.time || '',
        parsedDates: dates,
      });
    }
  }

  const months = monthsMeta.map(({ year, month }) => ({
    year,
    month,
    labelZh: `${year}年${month}月`,
    labelEn: `${MONTH_NAMES_EN[month]} ${year}`,
    weeks: buildMonthGrid(year, month, dayMap, getHoliday),
  }));

  return {
    ok: true,
    period,
    periodLabel: periodLabel(period),
    months,
    unplaced,
    submissions: list,
  };
}

// --- Periods ---

app.get('/api/periods', (req, res) => {
  res.json({ ok: true, periods: listPeriods() });
});

app.get('/api/series', (req, res) => {
  res.json({
    ok: true,
    series: SERIES_LIST.map((name, i) => ({ name, rank: i })),
    emptyLabel: SERIES_EMPTY_LABEL,
  });
});

app.get('/api/calendar', (req, res) => {
  const period = sanitizeText(req.query.period, 20);
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請提供有效嘅通訊期' });
  }
  res.json(buildCalendarPayload(period));
});

function sendDocx(res, filename, buffer) {
  const encoded = encodeURIComponent(filename);
  const ascii = filename.replace(/[^ -~]/g, '_') || 'export.docx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

app.get('/api/export/details', requireAdmin, async (req, res) => {
  const period = sanitizeText(req.query.period, 20);
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請提供有效嘅通訊期' });
  }
  try {
    const list = readSubmissions()
      .filter((s) => s.period === period)
      .slice()
      .sort(sortByOrder);
    const buffer = await buildDetailsDoc(list);
    return sendDocx(res, `${periodIssueLabel(period)}-活動詳情.docx`, buffer);
  } catch (err) {
    console.error('匯出活動詳情失敗：', err);
    return res.status(500).json({ ok: false, error: '匯出失敗，請稍後再試' });
  }
});

app.get('/api/export/calendar', requireAdmin, async (req, res) => {
  const period = sanitizeText(req.query.period, 20);
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請提供有效嘅通訊期' });
  }
  try {
    const payload = buildCalendarPayload(period);
    const buffer = await buildCalendarDoc(payload);
    return sendDocx(res, `${periodIssueLabel(period)}-活動一覽表.docx`, buffer);
  } catch (err) {
    console.error('匯出日誌表失敗：', err);
    return res.status(500).json({ ok: false, error: '匯出失敗，請稍後再試' });
  }
});

// --- Public submissions ---

app.get('/api/submissions', requireAdmin, (req, res) => {
  const period = sanitizeText(req.query.period, 20);
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請提供有效嘅通訊期（例如 2027-Q2）' });
  }
  const p = parsePeriodId(period);
  const list = readSubmissions()
    .filter((s) => s.period === period)
    .slice()
    .sort(sortByOrder)
    .map((s) => ({
      ...s,
      parsedDates: parseActivityDates(s, p.year),
    }));
  res.json({
    ok: true,
    period,
    periodLabel: periodLabel(period),
    submissions: list,
  });
});

app.post('/api/submissions', (req, res) => {
  const body = req.body || {};
  const period = sanitizeText(body.period, 20);
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請選擇通訊期' });
  }
  if (!isKnownPeriod(period)) {
    return res.status(400).json({ ok: false, error: '呢個通訊期唔喺可選範圍' });
  }

  const fields = pickFields(body);
  if (!fields.name) return res.status(400).json({ ok: false, error: '請填寫活動名稱' });

  const list = readSubmissions();
  const sortOrder = nextSortOrder(list, period);
  const entry = {
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    period,
    sortOrder,
    ...fields,
    series: fields.series,
    number: String(sortOrder + 1),
  };
  list.push(entry);
  writeSubmissions(list);
  const sorted = reindexAndSave(period);
  const saved = sorted.find((s) => s.id === entry.id) || entry;
  return res.status(201).json({ ok: true, id: saved.id, submission: saved });
});

app.put('/api/submissions/reorder', requireAdmin, (req, res) => {
  const body = req.body || {};
  const period = sanitizeText(body.period, 20);
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
  const seriesFilter =
    body.series === undefined || body.series === null
      ? null
      : normalizeSeries(body.series);
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請提供通訊期' });
  }
  if (!ids || !ids.length) {
    return res.status(400).json({ ok: false, error: '請提供排序 id 列表' });
  }

  const list = readSubmissions();
  const inPeriod = list.filter((s) => s.period === period);
  const scope =
    seriesFilter === null
      ? inPeriod
      : inPeriod.filter((s) => normalizeSeries(s.series) === seriesFilter);
  const idSet = new Set(scope.map((s) => s.id));
  for (const id of ids) {
    if (!idSet.has(id)) {
      return res.status(400).json({ ok: false, error: '排序列表包含唔屬於呢個系列／呢期嘅項目' });
    }
  }
  if (ids.length !== scope.length) {
    return res.status(400).json({ ok: false, error: '排序列表要包含該組全部項目' });
  }

  // Within the scoped series, apply relative order using large offsets then reindex globally
  const orderMap = new Map(ids.map((id, i) => [id, i]));
  const next = list.map((s) => {
    if (s.period !== period) return s;
    if (seriesFilter !== null && normalizeSeries(s.series) !== seriesFilter) return s;
    const sortOrder = orderMap.get(s.id);
    if (sortOrder === undefined) return s;
    return {
      ...s,
      sortOrder,
      updatedAt: new Date().toISOString(),
    };
  });
  writeSubmissions(next);
  const sorted = reindexAndSave(period);
  res.json({ ok: true, submissions: sorted });
});

app.put('/api/submissions/:id', requireAdmin, (req, res) => {
  const list = readSubmissions();
  const idx = list.findIndex((s) => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: '搵唔到呢份稿' });

  const body = req.body || {};
  const fields = pickFields(body);
  if (!fields.name) return res.status(400).json({ ok: false, error: '請填寫活動名稱' });

  const prev = list[idx];
  const newSeries = fields.series;
  const seriesChanged = normalizeSeries(prev.series) !== newSeries;
  let sortOrder = prev.sortOrder;
  if (seriesChanged) {
    // place at end of new series bucket before reindex
    const same = list.filter(
      (s) => s.period === prev.period && normalizeSeries(s.series) === newSeries && s.id !== prev.id
    );
    sortOrder = same.length
      ? Math.max(...same.map((s) => (typeof s.sortOrder === 'number' ? s.sortOrder : 0))) + 1
      : 0;
  }
  const updated = {
    ...prev,
    ...fields,
    series: newSeries,
    sortOrder,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = updated;
  writeSubmissions(list);
  const sorted = reindexAndSave(prev.period);
  const saved = sorted.find((s) => s.id === prev.id) || updated;
  res.json({ ok: true, submission: saved });
});

function removeSubmissions(ids) {
  const idSet = new Set((ids || []).map(String).filter(Boolean));
  const list = readSubmissions();
  const found = list.filter((s) => idSet.has(s.id));
  if (!found.length) {
    return { ok: false, deleted: 0, periods: [], next: list, found: [] };
  }
  const periods = [...new Set(found.map((s) => s.period).filter(Boolean))];
  let next = list.filter((s) => !idSet.has(s.id));
  for (const period of periods) {
    next = reindexPeriodInList(next, period);
  }
  writeSubmissions(next);
  return { ok: true, deleted: found.length, periods, next, found };
}

app.post('/api/submissions/delete', requireAdmin, (req, res) => {
  const body = req.body || {};
  const period = sanitizeText(body.period, 20);
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String).filter(Boolean))] : [];
  if (!period || !parsePeriodId(period)) {
    return res.status(400).json({ ok: false, error: '請提供通訊期' });
  }
  if (!ids.length) {
    return res.status(400).json({ ok: false, error: '請先勾選要刪除嘅活動' });
  }

  const list = readSubmissions();
  for (const id of ids) {
    const found = list.find((s) => s.id === id);
    if (!found) return res.status(404).json({ ok: false, error: '搵唔到要刪除嘅活動' });
    if (found.period !== period) {
      return res.status(400).json({ ok: false, error: '只能刪除呢一期嘅活動' });
    }
  }

  const result = removeSubmissions(ids);
  const submissions = result.next
    .filter((s) => s.period === period)
    .sort(compareBySeriesThenOrder);
  res.json({ ok: true, deleted: result.deleted, submissions });
});

app.delete('/api/submissions/:id', requireAdmin, (req, res) => {
  const list = readSubmissions();
  const found = list.find((s) => s.id === req.params.id);
  if (!found) return res.status(404).json({ ok: false, error: '搵唔到呢份稿' });
  const period = found.period;
  const result = removeSubmissions([found.id]);
  const submissions = result.next
    .filter((s) => s.period === period)
    .sort(compareBySeriesThenOrder);
  res.json({ ok: true, deleted: 1, submissions });
});


app.get('/api/submissions/catalog', (req, res) => {
  res.json(buildSubmissionsCatalog());
});

app.get('/api/submissions/:id', (req, res) => {
  const list = readSubmissions();
  const found = list.find((s) => s.id === req.params.id);
  if (!found) return res.status(404).json({ ok: false, error: '搵唔到呢份稿' });
  const p = parsePeriodId(found.period);
  res.json({
    ok: true,
    submission: {
      ...found,
      parsedDates: parseActivityDates(found, p && p.year),
    },
    periodLabel: periodLabel(found.period),
  });
});

// --- Admin ---

app.get('/api/admin/status', (req, res) => {
  res.json({
    ok: true,
    configured: adminAuth.isConfigured(DATA_DIR),
    isAdmin: !!(req.session && req.session.isAdmin),
  });
});

app.post('/api/admin/setup', (req, res) => {
  const password = (req.body && req.body.password) || '';
  const confirm = (req.body && req.body.confirm) || '';
  const result = adminAuth.setupPassword(DATA_DIR, password, confirm);
  if (!result.ok) {
    return res.status(result.status).json({ ok: false, error: result.error });
  }
  req.session.isAdmin = true;
  return res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  const verdict = adminAuth.verifyLogin(DATA_DIR, password);
  if (verdict === 'needs-setup') {
    return res.status(409).json({ ok: false, error: '請先設定後台密碼', needsSetup: true });
  }
  if (verdict !== 'ok') {
    return res.status(401).json({ ok: false, error: '密碼唔啱，請再試' });
  }
  req.session.isAdmin = true;
  return res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({ ok: true, isAdmin: !!(req.session && req.session.isAdmin) });
});

app.get('/api/admin/submissions', requireAdmin, (req, res) => {
  const period = sanitizeText(req.query.period, 20);
  let list = readSubmissions().slice();
  if (period) {
    if (!parsePeriodId(period)) {
      return res.status(400).json({ ok: false, error: '通訊期格式唔啱' });
    }
    list = list.filter((s) => s.period === period).sort(sortByOrder);
  } else {
    list.sort((a, b) => {
      const pk = periodSortKey(b.period) - periodSortKey(a.period);
      if (pk !== 0) return pk;
      return sortByOrder(a, b);
    });
  }
  res.json({
    ok: true,
    period: period || null,
    submissions: list.map((s) => ({ ...s, periodLabel: periodLabel(s.period) })),
  });
});

app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const list = readSubmissions();
  const found = list.find((s) => s.id === req.params.id);
  if (!found) {
    return res.status(404).json({ ok: false, error: '搵唔到呢份稿' });
  }
  removeSubmissions([found.id]);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});
app.get('/manage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manage.html'));
});
app.get('/calendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendar.html'));
});

ensureDataFile();
(() => {
  let list = readSubmissions();
  const periods = [...new Set(list.map((s) => s.period).filter(Boolean))];
  for (const period of periods) {
    list = reindexPeriodInList(list, period);
  }
  writeSubmissions(list);
})();

app.listen(PORT, () => {
  console.log(`通訊收集網站已啟動：http://localhost:${PORT}`);
  console.log(`後台：http://localhost:${PORT}/admin`);
});
