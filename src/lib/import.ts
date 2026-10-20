/**
 * การจับคู่คอลัมน์และการนำเข้าข้อมูล
 * - เดาคอลัมน์อัตโนมัติจากชื่อหัวตารางภาษาไทย/อังกฤษที่ใกล้เคียงกัน
 * - สร้างแถวข้อมูลจากคอลัมน์ที่ผู้ใช้จับคู่เท่านั้น (ไม่ดึงคอลัมน์อื่นมาแทน)
 * - ตรวจรายการซ้ำแบบรายงานผล ไม่ลบให้อัตโนมัติ
 */
import { parseDateValue, type DateParseResult } from './dates';
import {
  emptyRegisterRow,
  nextRowId,
  rowFingerprint,
  type RegisterRow,
  type ReportColumnKey,
} from './types';
import type { SheetPreview } from './excel';

export type ColumnMapping = Partial<Record<ReportColumnKey, number>>;

export type RowIssue = {
  rowNumber: number;
  field: string;
  message: string;
};

export type ImportedResult = {
  rows: RegisterRow[];
  /** จำนวนแถวที่อ่านได้ทั้งหมดจากชีต (ก่อนแปลง) */
  totalRows: number;
  /** แถวที่นำเข้าได้ */
  importedCount: number;
  /** แถวว่างที่ข้าม */
  blankRowCount: number;
  /** แถวที่มีข้อผิดพลาด (วันที่ไม่ชัดเจน/แปลงไม่ได้) */
  issueRows: number;
  issues: RowIssue[];
  /** จำนวนแถวที่ไม่มีข้อมูลในคอลัมน์เลขรับและเรื่อง (ข้อมูลไม่ครบ) */
  incompleteRows: number;
  /** ปี พ.ศ./ค.ศ. ที่ไม่แน่ใจ */
  uncertainDates: RowIssue[];
  /** แถวที่มีวันที่ต้องการการตรวจสอบเรื่อง พ.ศ./ค.ศ. */
  unclearEraCount: number;
};

const KEYWORDS: Record<ReportColumnKey, string[]> = {
  receiveNo: ['เลขรับ', 'เลขที่รับ', 'รับที่', 'ทะเบียนรับ', 'เลขทะเบียนรับ', 'รับเลขที่', 'เลขรับที่'],
  documentNo: ['เลขที่หนังสือ', 'ที่หนังสือ', 'เลขหนังสือ', 'หนังสือที่', 'เลขที่', 'ที่', 'ที่ออก'],
  documentDate: ['ลงวันที่', 'วันที่หนังสือ', 'วันที่ลง', 'วันที่ออกหนังสือ', 'วันทีลง'],
  from: ['จากหน่วยงาน', 'หน่วยงานผู้ส่ง', 'ผู้ส่ง', 'ต้นทาง', 'จาก'],
  subject: ['ชื่อเรื่อง', 'เรื่องที่', 'เนื้อเรื่อง', 'เรื่อง'],
  receivedDate: ['วันที่รับหนังสือ', 'วันที่รับ', 'วันรับ', 'รับวันที่'],
  note: ['หมายเหตุเพิ่มเติม', 'หมายเหตุอื่น', 'หมายเหตุ', 'บันทึก', 'remark'],
};

function normalize(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[()（）[\]{}]/g, '')
    .replace(/[.:]/g, '')
    .toLowerCase();
}

/** ให้คะแนนความใกล้เคียงของหัวตารางกับคอลัมน์รายงาน */
function headerScore(header: string, keywords: string[]): number {
  const normalized = normalize(header);
  if (normalized === '') return 0;
  let best = 0;
  for (const keyword of keywords) {
    const key = normalize(keyword);
    if (normalized === key) {
      best = Math.max(best, 100);
    } else if (normalized.startsWith(key) || normalized.endsWith(key)) {
      best = Math.max(best, 70);
    } else if (normalized.includes(key)) {
      best = Math.max(best, 50);
    } else if (key.includes(normalized) && normalized.length >= 3) {
      best = Math.max(best, 30);
    }
  }
  return best;
}

/** เดาจับคู่คอลัมน์อัตโนมัติ (ผู้ใช้แก้ไขได้เสมอ) */
export function guessMapping(
  headers: string[],
  dateColumns: number[] = [],
): { mapping: ColumnMapping; confidence: Record<string, number> } {
  const mapping: ColumnMapping = {};
  const confidence: Record<string, number> = {};
  const usedColumns = new Set<number>();
  const keys = Object.keys(KEYWORDS) as ReportColumnKey[];

  // รอบแรก: จับคู่ที่คะแนนสูงก่อน (เรียกคะแนนมาก -> น้อย)
  const candidates: Array<{ key: ReportColumnKey; column: number; score: number }> = [];
  keys.forEach((key) => {
    headers.forEach((header, column) => {
      const score = headerScore(header, KEYWORDS[key]);
      if (score > 0) candidates.push({ key, column, score });
    });
  });
  candidates.sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (mapping[candidate.key] !== undefined) continue;
    if (usedColumns.has(candidate.column)) continue;
    mapping[candidate.key] = candidate.column;
    confidence[candidate.key] = candidate.score;
    usedColumns.add(candidate.column);
  }

  // คำใบ้เพิ่มเติม: คอลัมน์วันที่จากรูปแบบเซลล์
  const unusedDateColumns = dateColumns.filter((column) => !usedColumns.has(column));
  if (mapping.documentDate === undefined && unusedDateColumns.length > 0) {
    mapping.documentDate = unusedDateColumns[0];
    confidence.documentDate = 25;
    usedColumns.add(unusedDateColumns[0]);
  }
  if (mapping.receivedDate === undefined && unusedDateColumns.length > 1) {
    mapping.receivedDate = unusedDateColumns[1];
    confidence.receivedDate = 25;
    usedColumns.add(unusedDateColumns[1]);
  }

  return { mapping, confidence };
}

export type ImportOptions = {
  sheet: SheetPreview;
  mapping: ColumnMapping;
  /** ผู้ใช้ยืนยันว่าข้อมูลวันที่ในไฟล์เป็น พ.ศ. หรือ ค.ศ. */
  eraPolicy: 'auto' | 'BE' | 'CE';
  /** นำเข้าทุกแถว หรือเฉพาะแถวที่มีเลขรับหรือเรื่อง */
  skipIncomplete: boolean;
};

function convertDate(value: string, eraPolicy: 'auto' | 'BE' | 'CE'): DateParseResult | null {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  if (eraPolicy === 'auto') return parsed;
  if (parsed.precision !== 'day' && parsed.precision !== 'month') return parsed;

  // ค้นหาปีในข้อความต้นทาง แล้วตีความใหม่ตามที่ผู้ใช้ยืนยัน
  const month = Number(parsed.sortKey.slice(5, 7)) || 1;
  const day = parsed.precision === 'day' ? Number(parsed.sortKey.slice(8, 10)) || 1 : 1;

  // ใช้ปีในข้อความต้นทางโดยตรง เพื่อไม่ให้เกิดการแปลงซ้ำ
  const rawYear = extractRawYear(value);
  const sourceYear = rawYear ?? (eraPolicy === 'BE' ? (parsed.yearCE ?? 0) + 543 : (parsed.yearCE ?? 0));
  const targetYearCE = eraPolicy === 'BE' ? sourceYear - 543 : sourceYear;

  // ตรวจความสมเหตุสมผล: ค.ศ. ควรอยู่ระหว่าง 1900–2150 (พ.ศ. 2443–2693)
  const plausible =
    eraPolicy === 'BE'
      ? targetYearCE >= 1900 && targetYearCE <= 2150
      : sourceYear >= 1900 && sourceYear <= 2150;

  if (!plausible) {
    // ปีที่ตีความแล้วไม่สมเหตุสมผล ให้คงผลเดิมไว้พร้อมแจ้งเตือน (ไม่แก้ข้อมูลตามที่ผู้ใช้บอกโดยไม่ตรวจ)
    return {
      ...parsed,
      uncertain: true,
      note: `ปี ${sourceYear} เมื่อตีความเป็น ${eraPolicy === 'BE' ? 'พ.ศ.' : 'ค.ศ.'} ได้ปี ค.ศ. ${targetYearCE} ซึ่งไม่สมเหตุสมผล กรุณาตรวจสอบรูปแบบปีของไฟล์นี้`,
    };
  }

  const iso =
    parsed.precision === 'day'
      ? `${targetYearCE.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : '';
  return {
    iso,
    sortKey:
      parsed.precision === 'day'
        ? iso
        : `${targetYearCE.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}`,
    display: parsed.display,
    precision: parsed.precision,
    yearCE: targetYearCE,
    yearBE: targetYearCE + 543,
    isBE: eraPolicy === 'BE',
    uncertain: false,
  };
}

/** ดึงค่าปี 4 หลักจากข้อความวันที่ต้นทาง (ถ้ามี) */
function extractRawYear(value: string): number | null {
  const text = value.trim();
  // ISO: yyyy-mm-dd
  const iso = text.match(/^(\d{4})\s*[/\-.]/);
  if (iso) return Number(iso[1]);
  const trailing = text.match(/[/\-.]\s*(\d{4})\s*$/);
  if (trailing) return Number(trailing[1]);
  // วันที่ เดือน(ชื่อ) ปี
  const named = text.match(/(\d{4})\s*$/);
  if (named) return Number(named[1]);
  return null;
}

/** สร้างแถวข้อมูลจากชีตและ mapping ที่ผู้ใช้เลือก */
export function buildRows(options: ImportOptions): ImportedResult {
  const { sheet, mapping, eraPolicy, skipIncomplete } = options;
  const issues: RowIssue[] = [];
  const rows: RegisterRow[] = [];
  let incompleteRows = 0;
  let issueRows = 0;
  let unclearEraCount = 0;
  const maxIssues = 200;

  const get = (row: string[], key: ReportColumnKey): string => {
    const column = mapping[key];
    if (column === undefined || column < 0) return '';
    return row[column] ?? '';
  };

  const hasAnyMapping = (Object.keys(mapping) as ReportColumnKey[]).some(
    (key) => mapping[key] !== undefined,
  );
  if (!hasAnyMapping) {
    throw new Error('ยังไม่ได้จับคู่คอลัมน์ใด ๆ กรุณาเลือกคอลัมน์อย่างน้อย 1 คอลัมน์');
  }

  sheet.rows.forEach((sourceRow, index) => {
    const rowNumber = sheet.rowNumbers[index] ?? index + 1;
    const receiveNo = get(sourceRow, 'receiveNo').trim();
    const subject = get(sourceRow, 'subject').trim();
    const documentNo = get(sourceRow, 'documentNo').trim();
    const from = get(sourceRow, 'from').trim();
    // คอลัมน์หมายเหตุต้องว่างเสมอ ไม่นำข้อมูลจากไฟล์ต้นทางมาเติม
    const note = '';

    if (skipIncomplete && receiveNo === '' && subject === '' && documentNo === '') {
      incompleteRows += 1;
      return;
    }

    const row = emptyRegisterRow(nextRowId());
    row.receiveNo = receiveNo;
    row.documentNo = documentNo;
    row.from = from;
    row.note = note;
    row.dateIssue = '';
    row.subject = subject;

    const rawDocumentDate = get(sourceRow, 'documentDate').trim();
    if (rawDocumentDate !== '') {
      const parsed = convertDate(rawDocumentDate, eraPolicy);
      if (parsed && parsed.precision !== 'unknown') {
        row.documentDateISO = parsed.iso;
        row.documentDateText = parsed.display;
        if (parsed.uncertain) {
          unclearEraCount += 1;
          const reason = parsed.note ?? `วันที่ "${rawDocumentDate}" ต้องตรวจสอบ พ.ศ./ค.ศ.`;
          if (issues.length < maxIssues) {
            issues.push({
              rowNumber,
              field: 'ลงวันที่',
              message: reason,
            });
          }
          row.dateIssue = appendNote(row.dateIssue, `วันที่ลงวันที่ "${rawDocumentDate}": ${reason}`);
        }
      } else {
        issueRows += 1;
        if (issues.length < maxIssues) {
          issues.push({
            rowNumber,
            field: 'ลงวันที่',
            message:
              parsed?.note ??
              `อ่านวันที่ "${rawDocumentDate}" ไม่สำเร็จ กรุณาตรวจสอบกับต้นฉบับ`,
          });
        }
        // อ่านวันที่ไม่ได้ -> เว้นว่างไว้ ไม่สร้างวันที่ขึ้นเอง และไม่แสดงรูปแบบ ISO ดิบ
        row.documentDateText = '';
        row.documentDateISO = '';
        row.dateIssue = appendNote(row.dateIssue, `วันที่ลงวันที่อ่านไม่ชัดเจน: ${rawDocumentDate}`);
      }
    }

    const rawReceivedDate = get(sourceRow, 'receivedDate').trim();
    if (rawReceivedDate !== '') {
      const parsed = convertDate(rawReceivedDate, eraPolicy);
      if (parsed && parsed.precision !== 'unknown') {
        row.receivedDateISO = parsed.iso;
        row.receivedDateText = parsed.display;
        if (parsed.uncertain) {
          unclearEraCount += 1;
          const reason = parsed.note ?? `วันที่ "${rawReceivedDate}" ต้องตรวจสอบ พ.ศ./ค.ศ.`;
          if (issues.length < maxIssues) {
            issues.push({
              rowNumber,
              field: 'วันที่รับ',
              message: reason,
            });
          }
          row.dateIssue = appendNote(row.dateIssue, `วันที่รับ "${rawReceivedDate}": ${reason}`);
        }
      } else {
        issueRows += 1;
        if (issues.length < maxIssues) {
          issues.push({
            rowNumber,
            field: 'วันที่รับ',
            message:
              parsed?.note ??
              `อ่านวันที่ "${rawReceivedDate}" ไม่สำเร็จ กรุณาตรวจสอบกับต้นฉบับ`,
          });
        }
        // อ่านวันที่ไม่ได้ -> เว้นว่างไว้ ไม่สร้างวันที่ขึ้นเอง และไม่แสดงรูปแบบ ISO ดิบ
        row.receivedDateText = '';
        row.receivedDateISO = '';
        row.dateIssue = appendNote(row.dateIssue, `วันที่รับอ่านไม่ชัดเจน: ${rawReceivedDate}`);
      }
    }

    rows.push(row);
  });

  return {
    rows,
    totalRows: sheet.rows.length,
    importedCount: rows.length,
    blankRowCount: sheet.blankRowCount,
    issueRows: issueRows + unclearEraCount,
    issues: issues.slice(0, maxIssues),
    incompleteRows,
    uncertainDates: issues.filter((issue) => issue.message.includes('พ.ศ.') || issue.message.includes('ค.ศ.')),
    unclearEraCount,
  };
}

function appendNote(existing: string, addition: string): string {
  if (existing === '') return addition;
  return `${existing} | ${addition}`;
}

export type DuplicateGroup = {
  fingerprint: string;
  /** ดัชนีในชุดข้อมูลเดิม */
  existingIndices: number[];
  /** ดัชนีในชุดข้อมูลใหม่ */
  incomingIndices: number[];
  sample: RegisterRow;
};

/** ตรวจรายการซ้ำระหว่างข้อมูลเดิมกับข้อมูลใหม่ (และภายในชุดใหม่เอง) */
export function findDuplicates(existing: RegisterRow[], incoming: RegisterRow[]): DuplicateGroup[] {
  const map = new Map<string, DuplicateGroup>();

  existing.forEach((row, index) => {
    const fingerprint = rowFingerprint(row);
    if (fingerprint.replace(/\u0001/g, '').trim() === '') return;
    const group = map.get(fingerprint) ?? {
      fingerprint,
      existingIndices: [],
      incomingIndices: [],
      sample: row,
    };
    group.existingIndices.push(index);
    map.set(fingerprint, group);
  });

  incoming.forEach((row, index) => {
    const fingerprint = rowFingerprint(row);
    if (fingerprint.replace(/\u0001/g, '').trim() === '') return;
    const group = map.get(fingerprint) ?? {
      fingerprint,
      existingIndices: [],
      incomingIndices: [],
      sample: row,
    };
    group.incomingIndices.push(index);
    map.set(fingerprint, group);
  });

  return [...map.values()].filter(
    (group) => group.incomingIndices.length > 0 && (group.existingIndices.length > 0 || group.incomingIndices.length > 1),
  );
}

export type MergeOptions = {
  mode: 'replace' | 'merge';
  /** true = ข้ามรายการซ้ำ, false = เพิ่มรายการซ้ำเข้าไปด้วย */
  skipDuplicates: boolean;
};

export function applyImport(
  existing: RegisterRow[],
  incoming: RegisterRow[],
  options: MergeOptions,
): { rows: RegisterRow[]; skippedDuplicates: number; addedCount: number } {
  if (options.mode === 'replace') {
    return { rows: incoming, skippedDuplicates: 0, addedCount: incoming.length };
  }

  const seen = new Set(existing.map((row) => rowFingerprint(row)));
  const added: RegisterRow[] = [];
  let skippedDuplicates = 0;

  for (const row of incoming) {
    const fingerprint = rowFingerprint(row);
    const isDuplicate = fingerprint.replace(/\u0001/g, '').trim() !== '' && seen.has(fingerprint);
    if (isDuplicate && options.skipDuplicates) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(fingerprint);
    added.push(row);
  }

  return {
    rows: [...existing, ...added],
    skippedDuplicates,
    addedCount: added.length,
  };
}
