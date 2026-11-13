import { parseActivityDates } from '../lib/dates.js';
import { normalizeSeries, reindexPeriodInList } from '../lib/series.js';
import { actionRequiresAdmin } from './access.js';
import { currentAdminSession } from './auth.js';
import { buildCalendarPayload, withNumbers } from './calendar-model.js';
import {
  comparePeriodIdsForCatalog,
  isKnownPeriod,
  parsePeriodId,
  periodIssueLabel,
  periodLabel,
  periodRangeLabel,
  periodSortKey,
} from './periods.js';
import { supabase } from './supabase.js';

const LIMITS = {
  name: 200,
  summary: 1000,
  content: 8000,
  date: 200,
  time: 80,
  location: 300,
  assemblyTime: 80,
  assemblyPlace: 300,
  audience: 300,
  quota: 80,
  fee: 120,
  contact: 120,
  notes: 2000,
};

function sanitizeText(value, maxLen) {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

export function sanitizeSubmission(input) {
  const source = input || {};
  const fields = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    fields[key] = sanitizeText(source[key], max);
  }
  fields.series = normalizeSeries(source.series);
  return fields;
}

function dateListFrom(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch (_) {
      return [];
    }
  }
  return [];
}

export function fromRow(row) {
  const sortOrder = Number(row.sort_order);
  return {
    id: row.id,
    submittedAt: row.submitted_at || '',
    updatedAt: row.updated_at || '',
    period: row.period || '',
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    name: row.name || '',
    summary: row.summary || '',
    content: row.content || '',
    date: row.date || '',
    time: row.time || '',
    location: row.location || '',
    audience: row.audience || '',
    quota: row.quota || '',
    fee: row.fee || '',
    contact: row.contact || '',
    notes: row.notes || '',
    dateList: dateListFrom(row.date_list),
    series: normalizeSeries(row.series),
    assemblyTime: row.assembly_time || '',
    assemblyPlace: row.assembly_place || '',
  };
}

function authRequired() {
  const err = new Error('請先登入');
  err.needsAuth = true;
  err.status = 401;
  return err;
}

function asError(error, fallback) {
  const raw = `${error?.message || ''} ${error?.details || ''} ${error?.code || ''}`;
  if (/failed to fetch|networkerror|network/i.test(raw)) return new Error('網絡錯誤，請稍後再試');
  if (/42501|row-level security|permission denied/i.test(raw)) return authRequired();
  return new Error(fallback);
}

async function requireAdmin() {
  const session = await currentAdminSession();
  if (!session) throw authRequired();
  return session;
}

async function requireAdminFor(action) {
  if (!actionRequiresAdmin(action)) return null;
  return requireAdmin();
}

function parsedDateList(period, dateText) {
  const parsed = parsePeriodId(period);
  return parseActivityDates({ date: dateText, dateList: [] }, parsed && parsed.year);
}

function nextSortOrder(list) {
  let max = -1;
  for (const item of list) {
    if (typeof item.sortOrder === 'number' && item.sortOrder > max) max = item.sortOrder;
  }
  return max + 1;
}

async function fetchPeriod(period) {
  const { data, error } = await supabase.from('submissions').select('*').eq('period', period).limit(5000);
  if (error) throw asError(error, '載入失敗');
  return (data || []).map(fromRow);
}

export async function fetchPeriodNumbered(period) {
  if (!parsePeriodId(period)) throw new Error('請提供有效嘅通訊期');
  return withNumbers(await fetchPeriod(period));
}

export async function fetchCalendar(period) {
  if (!parsePeriodId(period)) throw new Error('請提供有效嘅通訊期');
  return buildCalendarPayload(period, await fetchPeriod(period));
}

function catalogSubmission(item) {
  return {
    id: item.id,
    period: item.period,
    name: item.name || '',
    series: item.series || '',
    summary: item.summary || '',
    content: item.content || '',
    date: item.date || '',
    time: item.time || '',
    location: item.location || '',
    assemblyTime: item.assemblyTime || '',
    assemblyPlace: item.assemblyPlace || '',
    audience: item.audience || '',
    quota: item.quota || '',
    fee: item.fee || '',
    contact: item.contact || '',
    notes: item.notes || '',
  };
}

export async function fetchCatalog() {
  const { data, error } = await supabase
    .from('submissions')
    .select(
      'id,period,name,series,summary,content,date,time,location,assembly_time,assembly_place,audience,quota,fee,contact,notes,sort_order,submitted_at'
    )
    .limit(5000);
  if (error) throw asError(error, '載入活動列表失敗');
  const rows = (data || []).map(fromRow);
  const byPeriod = new Map();
  for (const row of rows) {
    if (!byPeriod.has(row.period)) byPeriod.set(row.period, []);
    byPeriod.get(row.period).push(row);
  }
  return [...byPeriod.keys()].sort(comparePeriodIdsForCatalog).map((id) => ({
    id,
    label: periodLabel(id),
    issueLabel: periodIssueLabel(id),
    rangeLabel: periodRangeLabel(id),
    submissions: withNumbers(byPeriod.get(id)).map(catalogSubmission),
  }));
}

export async function createSubmission(period, input) {
  if (!parsePeriodId(period)) throw new Error('請選擇通訊期');
  if (!isKnownPeriod(period)) throw new Error('呢個通訊期唔喺可選範圍');
  const fields = sanitizeSubmission(input);
  if (!fields.name) throw new Error('請填寫活動名稱');
  const payload = {
    period,
    name: fields.name,
    summary: fields.summary,
    content: fields.content,
    date: fields.date,
    time: fields.time,
    location: fields.location,
    assembly_time: fields.assemblyTime,
    assembly_place: fields.assemblyPlace,
    audience: fields.audience,
    quota: fields.quota,
    fee: fields.fee,
    contact: fields.contact,
    notes: fields.notes,
    series: fields.series,
    date_list: parsedDateList(period, fields.date),
  };
  if (await currentAdminSession()) {
    payload.sort_order = nextSortOrder(await fetchPeriod(period));
  }
  const { data, error } = await supabase.from('submissions').insert(payload).select('*').single();
  if (error) throw asError(error, '提交失敗，請稍後再試');
  return fromRow(data);
}

async function writeSortOrders(rows) {
  if (!rows.length) return;
  const results = await Promise.all(
    rows.map((row) =>
      supabase.from('submissions').update({ sort_order: row.sortOrder }).eq('id', row.id).select('id')
    )
  );
  for (const result of results) {
    if (result.error) throw asError(result.error, '儲存次序失敗');
    if (!result.data || !result.data.length) throw new Error('儲存次序失敗');
  }
}

export async function reorderSeries(period, series, ids) {
  await requireAdminFor('reorder');
  if (!parsePeriodId(period)) throw new Error('請提供通訊期');
  if (!Array.isArray(ids) || !ids.length) throw new Error('請提供排序 id 列表');
  const rows = await fetchPeriod(period);
  const seriesKey = normalizeSeries(series);
  const scope = rows.filter((row) => normalizeSeries(row.series) === seriesKey);
  const idSet = new Set(scope.map((row) => row.id));
  for (const id of ids) {
    if (!idSet.has(id)) throw new Error('排序列表包含唔屬於呢個系列／呢期嘅項目');
  }
  if (ids.length !== scope.length) throw new Error('排序列表要包含該組全部項目');
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  const adjusted = rows.map((row) => {
    if (normalizeSeries(row.series) !== seriesKey) return row;
    const sortOrder = orderMap.get(row.id);
    if (sortOrder === undefined) return row;
    return { ...row, sortOrder };
  });
  const reindexed = reindexPeriodInList(adjusted, period).filter((row) => row.period === period);
  const original = new Map(rows.map((row) => [row.id, row.sortOrder]));
  await writeSortOrders(reindexed.filter((row) => original.get(row.id) !== row.sortOrder));
  return fetchPeriodNumbered(period);
}

export async function updateSubmission(id, period, input) {
  await requireAdminFor('update');
  const fields = sanitizeSubmission(input);
  if (!fields.name) throw new Error('請填寫活動名稱');
  const rows = await fetchPeriod(period);
  const prev = rows.find((row) => row.id === id);
  if (!prev) throw new Error('搵唔到呢份稿');
  const nextSeries = fields.series;
  const seriesChanged = normalizeSeries(prev.series) !== nextSeries;
  let sortOrder = prev.sortOrder;
  if (seriesChanged) {
    const same = rows.filter((row) => row.id !== id && normalizeSeries(row.series) === nextSeries);
    sortOrder = same.length ? Math.max(...same.map((row) => row.sortOrder)) + 1 : 0;
  }
  const dateChanged = (prev.date || '') !== fields.date;
  const merged = rows.map((row) => {
    if (row.id !== id) return row;
    return {
      ...row,
      ...fields,
      series: nextSeries,
      sortOrder,
      dateList: dateChanged ? parsedDateList(period, fields.date) : row.dateList,
    };
  });
  const reindexed = reindexPeriodInList(merged, period);
  const saved = reindexed.find((row) => row.id === id);
  const patch = {
    name: fields.name,
    summary: fields.summary,
    content: fields.content,
    date: fields.date,
    time: fields.time,
    location: fields.location,
    assembly_time: fields.assemblyTime,
    assembly_place: fields.assemblyPlace,
    audience: fields.audience,
    quota: fields.quota,
    fee: fields.fee,
    contact: fields.contact,
    notes: fields.notes,
    series: nextSeries,
    sort_order: saved.sortOrder,
  };
  if (dateChanged) patch.date_list = saved.dateList;
  const { data, error } = await supabase.from('submissions').update(patch).eq('id', id).select('id');
  if (error) throw asError(error, '儲存失敗');
  if (!data || !data.length) throw new Error('儲存失敗');
  const original = new Map(rows.map((row) => [row.id, row.sortOrder]));
  await writeSortOrders(
    reindexed.filter((row) => row.period === period && row.id !== id && original.get(row.id) !== row.sortOrder)
  );
  const list = await fetchPeriodNumbered(period);
  return list.find((row) => row.id === id) || fromRow({ ...patch, id, period, sort_order: saved.sortOrder });
}

export async function deleteSubmissions(period, ids) {
  await requireAdminFor('delete');
  if (!parsePeriodId(period)) throw new Error('請提供通訊期');
  const unique = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!unique.length) throw new Error('請先勾選要刪除嘅活動');
  const existing = await fetchPeriod(period);
  for (const id of unique) {
    if (!existing.some((row) => row.id === id)) throw new Error('搵唔到要刪除嘅活動');
  }
  const { data, error } = await supabase
    .from('submissions')
    .delete()
    .in('id', unique)
    .eq('period', period)
    .select('id');
  if (error) throw asError(error, '刪除失敗');
  if (!data || data.length !== unique.length) throw authRequired();
  const remaining = await fetchPeriod(period);
  const reindexed = reindexPeriodInList(remaining, period).filter((row) => row.period === period);
  const original = new Map(remaining.map((row) => [row.id, row.sortOrder]));
  await writeSortOrders(reindexed.filter((row) => original.get(row.id) !== row.sortOrder));
  return fetchPeriodNumbered(period);
}

export async function fetchAdminList(period) {
  await requireAdminFor('admin-list');
  let query = supabase.from('submissions').select('*').limit(5000);
  if (period) {
    if (!parsePeriodId(period)) throw new Error('通訊期格式唔啱');
    query = query.eq('period', period);
  }
  const { data, error } = await query;
  if (error) throw asError(error, '載入失敗');
  const rows = (data || []).map(fromRow);
  const byPeriod = new Map();
  for (const row of rows) {
    if (!byPeriod.has(row.period)) byPeriod.set(row.period, []);
    byPeriod.get(row.period).push(row);
  }
  const ids = [...byPeriod.keys()].sort((a, b) => {
    if (period) return 0;
    return periodSortKey(b) - periodSortKey(a);
  });
  const list = [];
  for (const id of ids) {
    for (const row of withNumbers(byPeriod.get(id))) {
      list.push({ ...row, periodLabel: periodLabel(row.period) });
    }
  }
  return list;
}
