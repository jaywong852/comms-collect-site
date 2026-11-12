(function (global) {
  var SERIES_LIST = [
    '興趣及運動系列',
    '心思學院系列',
    '治療及支援小組系列',
    '社交聯誼及會員發展系列',
    '健康管理系列',
    '社區聯繫',
    '青少年系列',
    '小家屬系列',
  ];
  var EMPTY_LABEL = '未分類';

  var SERIES_KEYS = {
    '興趣及運動系列': 'interest',
    '心思學院系列': 'mind',
    '治療及支援小組系列': 'therapy',
    '社交聯誼及會員發展系列': 'social',
    '健康管理系列': 'health',
    '社區聯繫': 'community',
    '青少年系列': 'youth',
    '小家屬系列': 'family',
  };

  function seriesKey(series) {
    var s = String(series || '').trim();
    return SERIES_KEYS[s] || 'unclassified';
  }

  function seriesRank(series) {
    var s = String(series || '').trim();
    if (!s) return SERIES_LIST.length;
    var i = SERIES_LIST.indexOf(s);
    return i >= 0 ? i : SERIES_LIST.length;
  }

  function seriesLabel(series) {
    var s = String(series || '').trim();
    return s || EMPTY_LABEL;
  }

  function fillSelect(selectEl, selected) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '未選／' + EMPTY_LABEL;
    selectEl.appendChild(opt0);
    SERIES_LIST.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selectEl.appendChild(opt);
    });
    selectEl.value = selected || '';
  }

  global.CommsSeries = {
    SERIES_LIST: SERIES_LIST,
    SERIES_KEYS: SERIES_KEYS,
    EMPTY_LABEL: EMPTY_LABEL,
    seriesRank: seriesRank,
    seriesLabel: seriesLabel,
    seriesKey: seriesKey,
    fillSelect: fillSelect,
  };
})(window);
