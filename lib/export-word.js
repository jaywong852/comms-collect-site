'use strict';

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { SERIES_LIST, SERIES_EMPTY_LABEL } from './series.js';

const FONT_NAME = '新細明體';
const FONT = {
  ascii: FONT_NAME,
  eastAsia: FONT_NAME,
  hAnsi: FONT_NAME,
  cs: FONT_NAME,
};

const A4_PORTRAIT = { width: 11906, height: 16838 };
const A4_LANDSCAPE = { width: 16838, height: 11906 };

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const TABLE_BORDERS = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
  insideHorizontal: THIN_BORDER,
  insideVertical: THIN_BORDER,
};

const DETAIL_FIELDS = [
  ['summary', '簡介'],
  ['content', '內容'],
  ['audience', '對象'],
  ['date', '日期'],
  ['time', '時間'],
  ['location', '地點'],
  ['assemblyTime', '集合時間'],
  ['assemblyPlace', '集合地點'],
  ['quota', '名額'],
  ['fee', '費用'],
  ['contact', '負責人'],
  ['notes', '備註'],
];

function run(text, opts) {
  return new TextRun({
    text: text == null ? '' : String(text),
    font: FONT,
    size: 24,
    ...opts,
  });
}

function para(children, opts) {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    children: Array.isArray(children) ? children : [children],
    ...opts,
  });
}

function groupBySeries(submissions) {
  const buckets = new Map();
  for (const name of SERIES_LIST) buckets.set(name, []);
  buckets.set('', []);
  for (const item of submissions || []) {
    const key = SERIES_LIST.includes(item.series) ? item.series : '';
    buckets.get(key).push(item);
  }
  const groups = [];
  for (const name of SERIES_LIST) {
    const items = buckets.get(name);
    if (items.length) groups.push({ title: name, items });
  }
  const uncategorized = buckets.get('');
  if (uncategorized.length) groups.push({ title: SERIES_EMPTY_LABEL, items: uncategorized });
  return groups;
}

function activityNumber(item) {
  const n = String(item && item.number != null ? item.number : '').trim();
  return n || '';
}

function leftLabel(item) {
  const num = activityNumber(item);
  const name = String((item && item.name) || '').trim() || '未命名活動';
  return num ? `${num}. ${name}` : name;
}

function detailsFieldParagraphs(item) {
  const out = [];
  for (const [key, label] of DETAIL_FIELDS) {
    const value = String((item && item[key]) || '').trim();
    if (!value) continue;
    out.push(
      para([
        run(`${label}: `, { bold: true }),
        run(value),
      ])
    );
  }
  if (!out.length) out.push(para([run('')]));
  return out;
}

function buildDetailsDoc(submissions) {
  const colName = 2122;
  const colDetail = 6894;
  const tableWidth = colName + colDetail;
  const groups = groupBySeries(submissions);
  const children = [];

  if (!groups.length) {
    children.push(para([run('今期暫時未有活動。')]));
  }

  groups.forEach((group, gi) => {
    children.push(
      para([run(group.title, { bold: true })], {
        spacing: { before: gi === 0 ? 0 : 240, after: 80 },
      })
    );

    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          headerCell('活動名稱', colName),
          headerCell('活動詳情', colDetail),
        ],
      }),
    ];

    for (const item of group.items) {
      rows.push(
        new TableRow({
          cantSplit: false,
          children: [
            new TableCell({
              width: { size: colName, type: WidthType.DXA },
              verticalAlign: VerticalAlign.TOP,
              margins: { top: 40, bottom: 40, left: 60, right: 60 },
              children: [
                para([
                  run(leftLabel(item)),
                ]),
              ],
            }),
            new TableCell({
              width: { size: colDetail, type: WidthType.DXA },
              verticalAlign: VerticalAlign.TOP,
              margins: { top: 40, bottom: 40, left: 80, right: 80 },
              children: detailsFieldParagraphs(item),
            }),
          ],
        })
      );
    }

    children.push(
      new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: [colName, colDetail],
        layout: TableLayoutType.FIXED,
        borders: TABLE_BORDERS,
        rows,
      })
    );
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_PORTRAIT.width,
              height: A4_PORTRAIT.height,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });
  return packDocument(doc);
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [
      para([run(text, { bold: true })], { alignment: AlignmentType.CENTER }),
    ],
  });
}

function calRun(text, opts) {
  return new TextRun({
    text: text == null ? '' : String(text),
    font: FONT,
    size: 16,
    ...opts,
  });
}

function calPara(children, opts) {
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 240 },
    children: Array.isArray(children) ? children : [children],
    ...opts,
  });
}

function emptyCell(width, opts) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 20, bottom: 20, left: 40, right: 40 },
    children: [calPara([calRun('')])],
    ...opts,
  });
}

function weekdayCell(label, width, isSunday) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 20, bottom: 20, left: 40, right: 40 },
    children: [
      calPara(
        [calRun(label, { bold: true, color: isSunday ? 'FF0000' : '000000' })],
        { alignment: AlignmentType.CENTER }
      ),
    ],
  });
}

function dayCell(cell, width, colIndex) {
  if (!cell) return emptyCell(width);

  const isSunday = colIndex === 0;
  const isHoliday = !!(cell.holiday && cell.holiday.name);
  const dateColor = isSunday || isHoliday ? 'FF0000' : '000000';
  const dateText = `${cell.day}/${Number(String(cell.date).slice(5, 7))}`;
  const children = [
    calPara([calRun(dateText, { color: dateColor })]),
  ];

  if (isHoliday) {
    const holName = String(cell.holiday.name || '');
    let holSize = 52;
    if (holName.length > 8) holSize = 28;
    else if (holName.length > 4) holSize = 36;
    children.push(
      calPara([calRun(holName, { color: 'FF0000', size: holSize })], {
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 40, line: Math.max(240, holSize * 10) },
      })
    );
  }

  for (const item of cell.items || []) {
    const num = String(item.number || '').trim();
    const name = String(item.name || '').trim();
    const time = String(item.time || '').trim();
    let line = '';
    if (num) line += `${num}.`;
    line += name;
    if (time) line += ` ${time}`;
    children.push(calPara([calRun(line)]));
  }

  if (children.length === 1 && !isHoliday) {
    // date only; keep a stable empty line like the sample's empty days
  }

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 20, bottom: 20, left: 40, right: 40 },
    children,
  });
}

function monthTable(month, colWidth, tableWidth) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const rows = [
    new TableRow({
      height: { value: 360, rule: HeightRule.ATLEAST },
      children: [
        new TableCell({
          width: { size: tableWidth, type: WidthType.DXA },
          columnSpan: 7,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 20, bottom: 20, left: 40, right: 40 },
          children: [
            calPara(
              [calRun(month.labelZh || `${month.year}年${month.month}月`, { bold: true })],
              { alignment: AlignmentType.CENTER }
            ),
          ],
        }),
      ],
    }),
    new TableRow({
      height: { value: 360, rule: HeightRule.ATLEAST },
      tableHeader: true,
      children: weekdays.map((label, i) => weekdayCell(label, colWidth, i === 0)),
    }),
  ];

  for (const week of month.weeks || []) {
    rows.push(
      new TableRow({
        height: { value: 1215, rule: HeightRule.ATLEAST },
        cantSplit: true,
        children: week.map((cell, i) => dayCell(cell, colWidth, i)),
      })
    );
  }

  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: Array(7).fill(colWidth),
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows,
  });
}

function titlePara(first) {
  return para([run('活動一覽表', { bold: true })], {
    spacing: { before: first ? 0 : 280, after: 80 },
  });
}

function buildCalendarDoc(payload) {
  const colWidth = 2198;
  const tableWidth = colWidth * 7;
  const months = (payload && payload.months) || [];
  const children = [];

  if (!months.length) {
    children.push(titlePara(true));
    children.push(para([run('今期暫時未有日誌表。')]));
  } else {
    months.forEach((month, i) => {
      children.push(titlePara(i === 0));
      children.push(monthTable(month, colWidth, tableWidth));
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 16 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // docx swaps width/height when orientation is landscape
            size: {
              width: A4_PORTRAIT.width,
              height: A4_PORTRAIT.height,
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: { top: 567, right: 720, bottom: 567, left: 720 },
          },
        },
        children,
      },
    ],
  });
  return packDocument(doc);
}

function packDocument(doc) {
  if (typeof window === 'undefined') return Packer.toBuffer(doc);
  return Packer.toBlob(doc);
}

export {
  buildDetailsDoc,
  buildCalendarDoc,
};
