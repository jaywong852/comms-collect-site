import { SERIES_EMPTY_LABEL, SERIES_LIST } from '../lib/series.js';

export { SERIES_EMPTY_LABEL, SERIES_LIST };

const SERIES_KEYS = {
  興趣及運動系列: 'interest',
  心思學院系列: 'mind',
  治療及支援小組系列: 'therapy',
  社交聯誼及會員發展系列: 'social',
  健康管理系列: 'health',
  社區聯繫: 'community',
  青少年系列: 'youth',
  小家屬系列: 'family',
};

export function seriesKey(series) {
  const name = String(series || '').trim();
  return SERIES_KEYS[name] || 'unclassified';
}

export function seriesLabel(series) {
  const name = String(series || '').trim();
  return name || SERIES_EMPTY_LABEL;
}

export function fillSelect(selectEl, selected) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = `未選／${SERIES_EMPTY_LABEL}`;
  selectEl.appendChild(empty);
  SERIES_LIST.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    selectEl.appendChild(option);
  });
  selectEl.value = selected || '';
}
