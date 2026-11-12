import { buildCalendarDoc, buildDetailsDoc } from '../lib/export-word.js';
import { currentAdminSession } from './auth.js';
import { fetchCalendar, fetchPeriodNumbered } from './data.js';
import { periodIssueLabel } from './periods.js';

function authRequired() {
  const err = new Error('請先登入後台再匯出');
  err.needsAuth = true;
  return err;
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

async function asBlob(packed) {
  if (packed instanceof Blob) return packed;
  return new Blob([packed], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function exportDetails(period) {
  if (!(await currentAdminSession())) throw authRequired();
  const list = await fetchPeriodNumbered(period);
  downloadBlob(await asBlob(await buildDetailsDoc(list)), `${periodIssueLabel(period)}-活動詳情.docx`);
}

export async function exportCalendar(period) {
  if (!(await currentAdminSession())) throw authRequired();
  const payload = await fetchCalendar(period);
  downloadBlob(await asBlob(await buildCalendarDoc(payload)), `${periodIssueLabel(period)}-活動一覽表.docx`);
}
