/**
 * การอ่านไฟล์ Excel/CSV ด้วย SheetJS
 * - ตรวจจับแถวหัวตารางโดยไม่สมมติว่าอยู่แถวแรก
 * - รักษาเลขศูนย์นำหน้า (เลขหนังสือ) โดยอ่านเซลล์เป็นข้อความเมื่อจำเป็น
 * - คืนข้อมูลดิบเป็นตาราง string เพื่อให้ผู้ใช้จับคู่คอลัมน์เอง
 */
import * as XLSX from 'xlsx';
import { parseDateValue, type DateParseResult } from './dates';

export type SheetPreview = {
  /** ชื่อไฟล์ต้นทาง */
  fileName: string;
  /** ชื่อชีตทั้งหมดในไฟล์ */
  sheetNames: string[];
  /** ชื่อชีตที่เลือกอยู่ */
  activeSheet: string;
  /** แถวหัวตารางที่ตรวจพบ (index เริ่มจาก 0) หรือ -1 หากหาไม่พบ */
  headerRowIndex: number;
  /** ชื่อคอลัมน์จากแถวหัวตาราง */
  headers: string[];
  /** จำนวนแถวข้อมูลทั้งหมดที่อ่านจากชีต (ไม่รวมแถวหัวตาราง) */
  totalRows: number;
  /** แถวข้อมูลดิบ (ข้อความล้วน) */
  rows: string[][];
  /** แถวว่างที่ถูกข้ามไป */
  blankRowCount: number;
  /** ตำแหน่งแถว (1-based ในชีต) ที่อ่านได้ เรียงคู่กับ rows */
  rowNumbers: number[];
  /** เซลล์วันที่ที่ตรวจพบจากรูปแบบของเซลล์ Excel (ตำแหน่งคอลัมน์เรียงตามคอลัมน์) */
  dateColumns: number[];
};

export type WorkbookData = {
  fileName: string;
  fileSize: number;
  sheetNames: string[];
  workbooks: Record<string, SheetPreview>;
};

const HEADER_HINTS: Record<string, string[]> = {
  receiveNo: ['เลขรับ', 'เลขที่รับ', 'รับที่', 'ทะเบียนรับ', 'เลขทะเบียนรับ', 'รับเลขที่'],
  documentNo: ['ที่', 'เลขที่', 'เลขที่หนังสือ', 'ที่หนังสือ', 'เลขหนังสือ', 'ที่หนังสือออก', 'หนังสือที่'],
  documentDate: ['ลงวันที่', 'วันที่หนังสือ', 'วันที่ลง', 'วันที่ออกหนังสือ', 'วันที'],
  from: ['จาก', 'ผู้ส่ง', 'จากหน่วยงาน', 'หน่วยงานผู้ส่ง', 'ต้นทาง', 'จาก (หน่วยงาน)'],
  subject: ['เรื่อง', 'ชื่อเรื่อง', 'เนื้อเรื่อง', 'เรื่องที่', 'รายการ'],
  receivedDate: ['วันที่รับ', 'วันรับ', 'รับวันที่', 'วันที่รับหนังสือ'],
  note: ['หมายเหตุ', 'บันทึก', 'หมายเหตุอื่น', 'หมายเหตุเพิ่มเติม', 'remark', 'note'],
};

/** ทำความสะอาดหัวตาราง: ตัดช่องว่างซ้ำและอักขระแปลก */
export function cleanHeader(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').trim();
}

/** ให้คะแนนว่าแถวนี้เป็นหัวตารางหรือไม่ (ยิ่งมากยิ่งน่าจะเป็นหัวตาราง) */
function scoreHeaderRow(values: string[]): number {
  let score = 0;
  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length < 2) return 0;

  for (const raw of nonEmpty) {
    const value = raw.trim().toLowerCase();
    for (const hints of Object.values(HEADER_HINTS)) {
      if (hints.some((hint) => value === hint.toLowerCase())) {
        score += 6;
        break;
      }
      if (hints.some((hint) => value.includes(hint.toLowerCase()))) {
        score += 3;
        break;
      }
    }
    // หัวตารางมักเป็นข้อความสั้น ไม่ใช่ตัวเลขล้วน และไม่ใช่วันที่
    if (!/^\d+(\.\d+)?$/.test(value) && !parseDateValue(raw)) {
      score += 1;
    }
    if (/[ก-๙]/.test(raw)) score += 1;
    if (raw.length > 60) score -= 3;
  }

  // แถวที่อยู่ต้นไฟล์มีโอกาสเป็นหัวตารางมากกว่า
  return score;
}

/** ตรวจหาแถวหัวตารางจากข้อมูลดิบทั้งชีต */
export function detectHeaderRow(rawRows: string[][]): number {
  const limit = Math.min(rawRows.length, 30);
  let bestIndex = -1;
  let bestScore = 0;

  for (let i = 0; i < limit; i += 1) {
    const row = rawRows[i] ?? [];
    const nonEmpty = row.filter((v) => v.trim() !== '');
    if (nonEmpty.length === 0) continue;
    // แถวหัวตารางต้องมีอย่างน้อย 2 คอลัมน์ที่มีข้อมูล
    if (nonEmpty.length < 2) continue;
    // แถวหัวตารางไม่ควรเป็นแถวที่มีวันที่ส่วนใหญ่
    const dateLike = nonEmpty.filter((v) => parseDateValue(v) !== null).length;
    if (dateLike >= nonEmpty.length / 2) continue;

    const base = scoreHeaderRow(row);
    // หักคะแนนตามลำดับแถว เพื่อให้แถวบนสุดได้เปรียบเมื่อคะแนนเท่ากัน
    const adjusted = base - i * 0.5;
    if (adjusted > bestScore) {
      bestScore = adjusted;
      bestIndex = i;
    }
  }

  // ถ้าคะแนนต่ำเกินไป ให้สันนิษฐานว่าแถวแรกที่มีข้อมูลเป็นหัวตาราง
  if (bestIndex === -1 || bestScore < 3) {
    for (let i = 0; i < limit; i += 1) {
      const row = rawRows[i] ?? [];
      const nonEmpty = row.filter((v) => v.trim() !== '');
      if (nonEmpty.length >= 2) return i;
    }
    return rawRows.length > 0 ? 0 : -1;
  }

  return bestIndex;
}

/** แปลงค่าดิบจากชีตให้เป็นข้อความ โดยรักษาเลขศูนย์นำหน้าและข้อมูลว่าง */
export function rawCellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.v === null || cell.v === undefined) return '';

  // เซลล์วันที่ของ Excel
  if (cell.t === 'd' && cell.v instanceof Date) {
    const date = cell.v;
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return `${day}/${month}/${year}`;
  }

  if (cell.t === 'n') {
    if (typeof cell.v === 'number') {
      // ใช้รูปแบบที่ผู้ใช้ตั้งไว้ในไฟล์ (ถ้ามี) เพื่อรักษาเลขศูนย์นำหน้าและทศนิยม
      if (cell.w && cell.w.trim() !== '') {
        const formatted = cell.w.trim();
        // ถ้ารูปแบบ Excel แสดงเป็นวันที่ ให้คงรูปแบบวันที่ไว้ (แปลงภายหลัง)
        if (/[/-]/.test(formatted) && /\d/.test(formatted)) return formatted;
        if (/^\d{4,}$/.test(formatted)) return formatted; // เลขหนังสือ
      }
      if (!Number.isInteger(cell.v)) {
        return String(cell.v);
      }
      return String(Math.trunc(cell.v));
    }
    return String(cell.v);
  }

  if (cell.t === 'b') {
    return cell.v ? 'TRUE' : 'FALSE';
  }

  return String(cell.v).replace(/\r\n/g, '\n');
}

function sheetToRawRows(sheet: XLSX.WorkSheet, rangeRef?: string): string[][] {
  const ref = rangeRef ?? sheet['!ref'];
  if (!ref) return [];
  const parsed = XLSX.utils.decode_range(ref);
  const rows: string[][] = [];
  for (let r = parsed.s.r; r <= parsed.e.r; r += 1) {
    const row: string[] = [];
    for (let c = parsed.s.c; c <= parsed.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      row.push(rawCellToString(sheet[address] as XLSX.CellObject | undefined));
    }
    rows.push(row);
  }
  return rows;
}

/** หาคอลัมน์ที่มีข้อมูลจริงสิ้นสุด เพื่อไม่ให้ได้คอลัมน์ว่างเกินจำเป็น */
function trimTrailingEmptyColumns(rows: string[][]): string[][] {
  let lastUsed = -1;
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i -= 1) {
      if (row[i] && row[i].trim() !== '') {
        lastUsed = Math.max(lastUsed, i);
        break;
      }
    }
  }
  if (lastUsed < 0) return rows;
  return rows.map((row) => {
    const copy = row.slice(0, lastUsed + 1);
    while (copy.length < lastUsed + 1) copy.push('');
    return copy;
  });
}

/** ตรวจคอลัมน์ที่เป็นวันที่จากรูปแบบของเซลล์ (ใช้เป็นคำใบ้ ไม่ใช่การยืนยัน) */
function detectDateColumns(sheet: XLSX.WorkSheet, headers: string[]): number[] {
  const ref = sheet['!ref'];
  if (!ref) return [];
  const parsed = XLSX.utils.decode_range(ref);
  const dateColumnCounts = new Map<number, number>();
  const textColumnCounts = new Map<number, number>();

  const isDateFormatted = (cell: XLSX.CellObject): boolean => {
    if (cell.t === 'd') return true;
    const format = typeof cell.z === 'string' ? cell.z : '';
    if (format === '' || format === 'General') return false;
    try {
      return XLSX.SSF.is_date(format);
    } catch {
      return false;
    }
  };

  for (let r = parsed.s.r; r <= parsed.e.r; r += 1) {
    for (let c = parsed.s.c; c <= parsed.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell || cell.v === null || cell.v === undefined) continue;

      if (isDateFormatted(cell)) {
        dateColumnCounts.set(c - parsed.s.c, (dateColumnCounts.get(c - parsed.s.c) ?? 0) + 1);
        continue;
      }

      if (cell.t === 's') {
        const text = String(cell.v);
        // ต้องเป็นข้อความที่มีลักษณะวันที่ชัดเจน (มีตัวคั่นหรือชื่อเดือน) ไม่ใช่เลขล้วน
        // เพราะเลขล้วนอาจเป็นเลขรับ/เลขที่หนังสือที่บังเอิญอยู่ในช่วง serial date
        const hasDateShape = /[/\-.]/.test(text) || /[ก-๙a-zA-Z]/.test(text);
        if (hasDateShape && parseDateValue(text)?.precision === 'day') {
          textColumnCounts.set(c - parsed.s.c, (textColumnCounts.get(c - parsed.s.c) ?? 0) + 1);
        }
        continue;
      }

      // เซลล์ตัวเลขที่ไม่มีรูปแบบวันที่: นับเป็นคำใบ้เฉพาะเมื่อชื่อคอลัมน์สื่อว่าเป็นวันที่
      // (เช่น "ลงวันที่", "วันที่รับ") และค่าอยู่ในช่วงปี 1990-2040 เท่านั้น
      if (cell.t === 'n' && typeof cell.v === 'number') {
        const header = headers[c - parsed.s.c] ?? '';
        if (!/วันที่|วันรับ|date/i.test(header)) continue;
        if (!Number.isInteger(cell.v)) continue;
        if (cell.v < 32874 || cell.v > 51135) continue; // 1990-01-01 ถึง 2040-01-01
        dateColumnCounts.set(c - parsed.s.c, (dateColumnCounts.get(c - parsed.s.c) ?? 0) + 1);
      }
    }
  }

  const result = new Set<number>();
  for (const [col, count] of dateColumnCounts) {
    if (count >= 2) result.add(col);
  }
  for (const [col, count] of textColumnCounts) {
    if (count >= 2) result.add(col);
  }
  return [...result].sort((a, b) => a - b);
}

/** อ่านชีตหนึ่ง ๆ จาก workbook */
export function parseSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fileName: string,
): SheetPreview {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      fileName,
      sheetNames: workbook.SheetNames,
      activeSheet: sheetName,
      headerRowIndex: -1,
      headers: [],
      totalRows: 0,
      rows: [],
      blankRowCount: 0,
      rowNumbers: [],
      dateColumns: [],
    };
  }

  const raw = trimTrailingEmptyColumns(sheetToRawRows(sheet));
  const headerRowIndex = detectHeaderRow(raw);
  const headers =
    headerRowIndex >= 0 && raw[headerRowIndex]
      ? raw[headerRowIndex].map((value, index) => {
          const cleaned = cleanHeader(value);
          return cleaned === '' ? `คอลัมน์ ${index + 1}` : cleaned;
        })
      : [];

  const width = headers.length > 0 ? headers.length : raw.reduce((max, row) => Math.max(max, row.length), 0);

  const dataRows: string[][] = [];
  const rowNumbers: number[] = [];
  let blankRowCount = 0;

  const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  for (let i = startIndex; i < raw.length; i += 1) {
    const source = raw[i] ?? [];
    const row: string[] = [];
    for (let c = 0; c < width; c += 1) {
      row.push(source[c] ?? '');
    }
    const hasContent = row.some((value) => value.trim() !== '');
    if (!hasContent) {
      blankRowCount += 1;
      continue;
    }
    dataRows.push(row);
    rowNumbers.push(i + 1); // เลขแถวแบบ 1-based ในชีต
  }

  const dateColumns = headerRowIndex >= 0 ? detectDateColumns(sheet, headers) : [];

  return {
    fileName,
    sheetNames: workbook.SheetNames,
    activeSheet: sheetName,
    headerRowIndex,
    headers,
    totalRows: dataRows.length,
    rows: dataRows,
    blankRowCount,
    rowNumbers,
    dateColumns,
  };
}

/** อ่านไฟล์ทั้งหมด (ทุกชีต) */
export async function readWorkbookFile(file: File): Promise<{ workbook: XLSX.WorkBook; data: WorkbookData }> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellDates: false, // ให้อ่านวันที่เป็น serial number แล้วแปลงเองอย่างควบคุมได้
      cellNF: true, // เก็บรูปแบบตัวเลข (เพื่อรักษาเลขศูนย์นำหน้า/รูปแบบวันที่)
      cellText: true,
      raw: false,
    });
  } catch (error) {
    throw new Error(
      `อ่านไฟล์ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)} — ตรวจสอบว่าเป็นไฟล์ .xlsx, .xls หรือ .csv ที่ไม่เสียหาย`,
    );
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(
      'ไม่พบ Worksheet ในไฟล์นี้ — ไฟล์อาจเสียหาย ไม่ใช่ไฟล์ Excel/CSV จริง หรือบันทึกมาในรูปแบบที่ระบบอ่านไม่ได้ กรุณาตรวจสอบไฟล์ต้นทาง',
    );
  }

  const workbooks: Record<string, SheetPreview> = {};
  for (const name of workbook.SheetNames) {
    workbooks[name] = parseSheet(workbook, name, file.name);
  }

  return {
    workbook,
    data: {
      fileName: file.name,
      fileSize: file.size,
      sheetNames: workbook.SheetNames,
      workbooks,
    },
  };
}

/** แปลงค่าหนึ่งช่องเป็นวันที่ (ใช้ตอนจับคู่คอลัมน์) */
export function toDateValue(value: string): DateParseResult | null {
  return parseDateValue(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ไบต์`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} กิโลไบต์`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} เมกะไบต์`;
}
