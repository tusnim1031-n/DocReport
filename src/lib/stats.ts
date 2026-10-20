/**
 * การกรอง การค้นหา การเรียงลำดับ และสถิติ
 * ตัวเลขสรุปทั้งหมดคำนวณจากข้อมูลจริงที่นำเข้าเท่านั้น
 */
import { THAI_MONTH_LABELS } from './dates';
import type { RegisterRow } from './types';

export type SortKey = 'documentDate' | 'receivedDate' | 'receiveNo' | 'documentNo' | 'from' | 'subject';

export type FilterState = {
  search: string;
  dateFrom: string;
  dateTo: string;
  /** ใช้คอลัมน์วันที่ใดในการกรอง */
  dateField: 'documentDate' | 'receivedDate';
  month: string; // 'all' หรือ 'yyyy-mm'
  sortKey: SortKey;
  sortDirection: 'asc' | 'desc';
};

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  dateFrom: '',
  dateTo: '',
  dateField: 'documentDate',
  month: 'all',
  sortKey: 'documentDate',
  sortDirection: 'asc',
};

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.month !== 'all'
  );
}

function sortValue(row: RegisterRow, filters: FilterState): string {
  switch (filters.sortKey) {
    case 'documentDate':
      return row.documentDateISO || row.receivedDateISO || '';
    case 'receivedDate':
      return row.receivedDateISO || row.documentDateISO || '';
    case 'receiveNo':
      return row.receiveNo;
    case 'documentNo':
      return row.documentNo;
    case 'from':
      return row.from;
    case 'subject':
      return row.subject;
  }
}

/** เรียงลำดับแบบ "ธรรมชาติ" ให้เลขรับ/เลขที่หนังสือเรียงถูกต้อง (1, 2, 10) */
function naturalCompare(a: string, b: string): number {
  const chunk = /(\d+)|(\D+)/g;
  const aParts = a.toLowerCase().match(chunk) ?? [];
  const bParts = b.toLowerCase().match(chunk) ?? [];
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const aPart = aParts[i] ?? '';
    const bPart = bParts[i] ?? '';
    if (aPart === bPart) continue;
    const aNum = Number(aPart);
    const bNum = Number(bPart);
    const bothNumeric = aPart !== '' && bPart !== '' && !Number.isNaN(aNum) && !Number.isNaN(bNum);
    if (bothNumeric && aNum !== bNum) return aNum - bNum;
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

export function applyFilters(rows: RegisterRow[], filters: FilterState): RegisterRow[] {
  const search = filters.search.trim().toLowerCase();
  const searchTerms = search === '' ? [] : search.split(/\s+/);

  const filtered = rows.filter((row) => {
    if (searchTerms.length > 0) {
      const haystack = [row.receiveNo, row.documentNo, row.from, row.subject]
        .join(' ')
        .toLowerCase()
        .replace(/\s+/g, ' ');
      const allMatch = searchTerms.every((term) => haystack.includes(term));
      if (!allMatch) return false;
    }

    const dateValue =
      filters.dateField === 'documentDate' ? row.documentDateISO : row.receivedDateISO;
    const fallback =
      filters.dateField === 'documentDate' ? row.receivedDateISO : row.documentDateISO;
    const comparable = dateValue || fallback;

    if (filters.dateFrom !== '') {
      if (comparable === '' || comparable < filters.dateFrom) return false;
    }
    if (filters.dateTo !== '') {
      if (comparable === '' || comparable > filters.dateTo) return false;
    }
    if (filters.month !== 'all') {
      if (comparable.slice(0, 7) !== filters.month) return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aValue = sortValue(a, filters);
    const bValue = sortValue(b, filters);

    // แถวที่ไม่มีวันที่ให้ไปอยู่ท้ายเสมอ ไม่ปะปนกับข้อมูลที่มีวันที่
    if (filters.sortKey === 'documentDate' || filters.sortKey === 'receivedDate') {
      if (aValue === '' && bValue !== '') return 1;
      if (bValue === '' && aValue !== '') return -1;
    }

    const result = naturalCompare(aValue, bValue);
    return filters.sortDirection === 'asc' ? result : -result;
  });

  return sorted;
}

export type Statistics = {
  total: number;
  /** จำนวนแถวที่ไม่มีวันที่ลงวันที่และวันที่รับเลย */
  withoutAnyDate: number;
  minDocumentDateISO: string;
  maxDocumentDateISO: string;
  minReceivedDateISO: string;
  maxReceivedDateISO: string;
  /** จำนวนวันที่ไม่ชัดเจน (พ.ศ./ค.ศ.) */
  uncertainDateRows: number;
  byMonth: Array<{ month: string; label: string; count: number }>;
  byReceiver: Array<{ name: string; count: number }>;
};

export function computeStatistics(rows: RegisterRow[]): Statistics {
  let minDocumentISO = '';
  let maxDocumentISO = '';
  let minReceivedISO = '';
  let maxReceivedISO = '';
  let withoutAnyDate = 0;
  let uncertainDateRows = 0;
  const monthCounts = new Map<string, number>();

  for (const row of rows) {
    const documentDate = row.documentDateISO;
    const receivedDate = row.receivedDateISO;

    if (!documentDate && !receivedDate) withoutAnyDate += 1;

    if (documentDate) {
      if (minDocumentISO === '' || documentDate < minDocumentISO) minDocumentISO = documentDate;
      if (maxDocumentISO === '' || documentDate > maxDocumentISO) maxDocumentISO = documentDate;
    }
    if (receivedDate) {
      if (minReceivedISO === '' || receivedDate < minReceivedISO) minReceivedISO = receivedDate;
      if (maxReceivedISO === '' || receivedDate > maxReceivedISO) maxReceivedISO = receivedDate;
    }

    if (row.dateIssue.trim() !== '') {
      uncertainDateRows += 1;
    }

    const monthKey = documentDate.slice(0, 7) || receivedDate.slice(0, 7);
    if (monthKey) {
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    }
  }

  const byMonth = [...monthCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const [yearText, monthText] = month.split('-');
      const year = Number(yearText);
      const monthNumber = Number(monthText);
      const label = `${THAI_MONTH_LABELS[monthNumber - 1] ?? monthText} ${year + 543}`;
      return { month, label, count };
    });

  return {
    total: rows.length,
    withoutAnyDate,
    minDocumentDateISO: minDocumentISO,
    maxDocumentDateISO: maxDocumentISO,
    minReceivedDateISO: minReceivedISO,
    maxReceivedDateISO: maxReceivedISO,
    uncertainDateRows,
    byMonth,
    byReceiver: [],
  };
}

/** ตัวเลือกเดือนสำหรับ dropdown (เฉพาะเดือนที่พบในข้อมูล) */
export function monthOptions(rows: RegisterRow[]): Array<{ value: string; label: string }> {
  const set = new Set<string>();
  for (const row of rows) {
    const key = row.documentDateISO.slice(0, 7) || row.receivedDateISO.slice(0, 7);
    if (key) set.add(key);
  }
  return [...set]
    .sort((a, b) => a.localeCompare(b))
    .map((month) => {
      const [yearText, monthText] = month.split('-');
      const label = `${THAI_MONTH_LABELS[Number(monthText) - 1] ?? monthText} ${Number(yearText) + 543}`;
      return { value: month, label };
    });
}
