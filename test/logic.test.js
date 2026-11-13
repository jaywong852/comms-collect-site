import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseActivityDates } from '../lib/dates.js';
import { buildCalendarDoc, buildDetailsDoc } from '../lib/export-word.js';
import { getHoliday } from '../lib/hk-holidays.js';
import { reindexPeriodInList } from '../lib/series.js';
import { actionRequiresAdmin, activityListCapabilities } from '../src/access.js';
import { buildCalendarPayload } from '../src/calendar-model.js';
import {
  groupPeriodsByFiscalYear,
  listPeriods,
  periodDeadlineLabel,
  periodFiscalYearLabel,
  periodIssueNumber,
  periodLabel,
} from '../src/periods.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('period issues and fiscal year grouping stay on the existing scale', () => {
  assert.equal(periodIssueNumber('2027-Q1'), 65);
  assert.equal(periodIssueNumber('2027-Q2'), 66);
  assert.equal(periodIssueNumber('2027-Q3'), 67);
  assert.equal(periodIssueNumber('2027-Q4'), 68);
  assert.equal(periodIssueNumber('2028-Q1'), 69);
  assert.equal(periodLabel('2027-Q2'), '第66期（2027年4–6月）');

  const groups = groupPeriodsByFiscalYear(listPeriods());
  assert.equal(groups[0].label, periodFiscalYearLabel('2027-Q2'));
  assert.deepEqual(
    groups[0].periods.map((period) => period.id),
    ['2027-Q2', '2027-Q3', '2027-Q4', '2028-Q1']
  );
  assert.equal(groups[1].label, periodFiscalYearLabel('2027-Q1'));
  assert.deepEqual(
    groups[1].periods.map((period) => period.id),
    ['2027-Q1']
  );
  assert.ok(groups[0].startYear > groups[1].startYear);
});

test('homepage periods carry the given submission deadlines', () => {
  const expected = {
    '2027-Q1': '截止日期：3/11/2026(二)',
    '2027-Q2': '截止日期：2/2/2027(二)',
    '2027-Q3': '截止日期：4/5/2027(二)',
    '2027-Q4': '截止日期：3/8/2027(二)',
    '2028-Q1': '截止日期：2/11/2027(二)',
  };
  const periods = listPeriods();
  assert.deepEqual(
    periods.map((period) => period.id),
    Object.keys(expected)
  );
  periods.forEach((period) => {
    assert.equal(period.deadlineLabel, expected[period.id]);
    assert.equal(periodDeadlineLabel(period.id), expected[period.id]);
    assert.equal(period.deadlineLabel.includes(' '), false);
  });

  const landing = readFileSync(join(root, 'src/landing.js'), 'utf8');
  assert.match(landing, /period\.deadlineLabel/);
  assert.doesNotMatch(landing, /3\/11\/2026|截止日期/);
});

test('date text parses month lists, semicolons, weekdays, and 及', () => {
  assert.deepEqual(parseActivityDates({ date: '2027年5月1日', dateList: [] }, 2027), ['2027-05-01']);
  assert.deepEqual(parseActivityDates({ date: '5月1日', dateList: [] }, 2027), ['2027-05-01']);
  assert.deepEqual(parseActivityDates({ date: '4月5日(五)', dateList: [] }, 2027), ['2027-04-05']);
  assert.deepEqual(parseActivityDates({ date: '10月9、30日', dateList: [] }, 2027), ['2027-10-09', '2027-10-30']);
  assert.deepEqual(parseActivityDates({ date: '10月9、30日；11月13、27日', dateList: [] }, 2027), [
    '2027-10-09',
    '2027-10-30',
    '2027-11-13',
    '2027-11-27',
  ]);
  assert.deepEqual(parseActivityDates({ date: '1月11(一)、12(二)日', dateList: [] }, 2027), [
    '2027-01-11',
    '2027-01-12',
  ]);
  assert.deepEqual(parseActivityDates({ date: '1月13、20、27及2月3日(星期三)', dateList: [] }, 2027), [
    '2027-01-13',
    '2027-01-20',
    '2027-01-27',
    '2027-02-03',
  ]);
  assert.deepEqual(
    parseActivityDates({ date: '忽略文字', dateList: ['2027-05-01', 'bad'] }, 2027),
    ['2027-05-01']
  );
});

test('activity numbers follow series priority then sort order', () => {
  const list = [
    { id: 'a', period: '2027-Q2', series: '青少年系列', sortOrder: 0, submittedAt: '2027-01-01' },
    { id: 'b', period: '2027-Q2', series: '興趣及運動系列', sortOrder: 0, submittedAt: '2027-01-02' },
    { id: 'c', period: '2027-Q2', series: '', sortOrder: 5, submittedAt: '2027-01-03' },
    { id: 'other', period: '2027-Q1', series: '社區聯繫', sortOrder: 4, submittedAt: '2027-01-01' },
  ];
  const next = reindexPeriodInList(list, '2027-Q2').filter((item) => item.period === '2027-Q2');
  assert.deepEqual(
    next.map((item) => item.id),
    ['b', 'a', 'c']
  );
  assert.deepEqual(
    next.map((item) => item.number),
    ['1', '2', '3']
  );
  assert.deepEqual(
    next.map((item) => item.sortOrder),
    [0, 1, 2]
  );
  assert.equal(reindexPeriodInList(list, '2027-Q2').find((item) => item.id === 'other').sortOrder, 4);
});

test('calendar keeps Hong Kong holidays and skips unparsed dates', () => {
  assert.equal(getHoliday('2027-01-01').name, '元旦');
  const payload = buildCalendarPayload('2027-Q1', [
    {
      id: '1',
      period: '2027-Q1',
      series: '興趣及運動系列',
      sortOrder: 0,
      submittedAt: '2027-01-01T00:00:00.000Z',
      name: '已入表',
      date: '1月13日',
      time: '下午2:30',
      dateList: [],
    },
    {
      id: '2',
      period: '2027-Q1',
      series: '興趣及運動系列',
      sortOrder: 1,
      submittedAt: '2027-01-02T00:00:00.000Z',
      name: '未能辨識',
      date: '待定',
      time: '',
      dateList: [],
    },
  ]);
  const january = payload.months[0];
  const newYear = january.weeks.flat().find((cell) => cell && cell.date === '2027-01-01');
  const placed = january.weeks.flat().find((cell) => cell && cell.date === '2027-01-13');
  assert.equal(newYear.holiday.name, '元旦');
  assert.equal(placed.items[0].number, '1');
  assert.equal(placed.items[0].name, '已入表');
  assert.equal(payload.unplaced[0].name, '未能辨識');
});

async function docxXml(packed) {
  const buffer = Buffer.isBuffer(packed) ? packed : Buffer.from(await packed.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), 'comms-docx-'));
  const file = join(dir, 'export.docx');
  writeFileSync(file, buffer);
  const xml = execFileSync(
    'python3',
    [
      '-c',
      'import sys, zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("word/document.xml").decode("utf-8"))',
      file,
    ],
    { encoding: 'utf8' }
  );
  rmSync(dir, { recursive: true, force: true });
  return xml;
}

test('details Word export does not highlight the activity name', async () => {
  const xml = await docxXml(
    await buildDetailsDoc([
      {
        number: '1',
        name: '春季義工日',
        series: '興趣及運動系列',
        summary: '一行簡介',
        content: '詳細內容',
      },
    ])
  );
  assert.match(xml, /1\. 春季義工日/);
  assert.match(xml, /簡介/);
  assert.doesNotMatch(xml, /w:highlight/);
  assert.doesNotMatch(xml, /FFFF00/i);
  assert.doesNotMatch(xml, /yellow/i);
});

test('calendar Word export is a landscape activity list', async () => {
  const payload = buildCalendarPayload('2027-Q2', []);
  const xml = await docxXml(await buildCalendarDoc(payload));
  assert.match(xml, /活動一覽表/);
  assert.match(xml, /w:orient="landscape"/);
});

test('activity edit, reorder, and word export are public; only delete stays behind login', () => {
  const visitor = activityListCapabilities(false);
  const admin = activityListCapabilities(true);
  assert.equal(visitor.view, true);
  assert.equal(visitor.edit, true);
  assert.equal(visitor.reorder, true);
  assert.equal(visitor.deleteMode, false);
  assert.equal(visitor.exportWord, true);
  assert.equal(admin.edit, true);
  assert.equal(admin.reorder, true);
  assert.equal(admin.deleteMode, true);
  assert.equal(admin.exportWord, true);

  assert.equal(actionRequiresAdmin('update'), false);
  assert.equal(actionRequiresAdmin('reorder'), false);
  assert.equal(actionRequiresAdmin('delete'), true);
  assert.equal(actionRequiresAdmin('export-details'), false);
  assert.equal(actionRequiresAdmin('export-calendar'), false);
  assert.equal(actionRequiresAdmin('admin-list'), true);

  const manage = readFileSync(join(root, 'src/manage.js'), 'utf8');
  const data = readFileSync(join(root, 'src/data.js'), 'utf8');
  const exporters = readFileSync(join(root, 'src/exporters.js'), 'utf8');
  const calendar = readFileSync(join(root, 'src/calendar.js'), 'utf8');
  assert.match(manage, /await fetchPeriodNumbered\(period\)/);
  assert.match(manage, /await updateSubmission\(currentId, period, data\)/);
  assert.match(manage, /await reorderSeries\(period, seriesName, ids\)/);
  assert.match(manage, /guard\(\(\) => deleteSubmissions\(period, ids\)\)/);
  assert.match(manage, /exportDetails\(period\)/);
  assert.doesNotMatch(manage, /guard\(\(\) => exportDetails/);
  assert.doesNotMatch(manage, /guard\(\(\) => fetchPeriodNumbered/);
  assert.doesNotMatch(manage, /guard\(\(\) => updateSubmission/);
  assert.doesNotMatch(manage, /guard\(\(\) => reorderSeries/);
  assert.match(data, /requireAdminFor\('delete'\)/);
  assert.match(data, /requireAdminFor\('update'\)/);
  assert.match(data, /requireAdminFor\('reorder'\)/);
  assert.doesNotMatch(exporters, /currentAdminSession|needsAuth|assertExportAllowed/);
  assert.doesNotMatch(calendar, /openAuthThenRetry|mountAuth|needsAuth/);
  assert.match(calendar, /exportCalendar\(period\)/);

  const sql = readFileSync(
    join(root, 'supabase/migrations/20261113012200_allow_anonymous_submission_update.sql'),
    'utf8'
  );
  assert.match(sql, /create policy submissions_public_update/);
  assert.match(sql, /for update/);
  assert.match(sql, /to anon, authenticated/);
  assert.match(sql, /using \(true\)/);
  assert.match(sql, /with check \(true\)/);
  assert.doesNotMatch(sql, /for delete/i);
  assert.doesNotMatch(sql, /drop policy[^;]*submissions_admin_delete/i);
  assert.doesNotMatch(sql, /service_role/);
});

test('source does not ship secrets, submission dumps, or mainland import/export wording', () => {
  const files = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|html|css|md|yml)$/.test(name)) files.push(path);
    }
  }
  ['src', 'lib', 'submit', 'manage', 'calendar', 'admin', '.github'].forEach((dir) => walk(join(root, dir)));
  files.push(join(root, 'index.html'), join(root, 'README.md'), join(root, 'package.json'));
  const banned = ['service_role', '導出', '導入', 'submissions.json', 'ADMIN_PASSWORD'];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const word of banned) {
      assert.equal(text.includes(word), false, `${relative(root, file)} contains ${word}`);
    }
  }
});
