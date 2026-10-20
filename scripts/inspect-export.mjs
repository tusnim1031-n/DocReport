/**
 * ตรวจไฟล์ Excel ที่ส่งออกจากแอป (ยืนยันว่าไม่มีเวลา/ไม่มีเครื่องหมายเตือน)
 * รัน: node scripts/inspect-export.mjs <path>
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('ต้องระบุพาธไฟล์');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(file), { type: 'buffer' });

const REPORT_HEADERS = ['เลขรับ', 'ที่', 'ลงวันที่', 'จาก', 'เรื่อง', 'วันที่รับ', 'หมายเหตุ'];

/** เลือกชีตที่เป็นตารางรายงานจริง (หัวตารางตรงกับ 7 คอลัมน์) ไม่ใช่ชีตที่มีแถวหัวเรื่อง */
function findReportSheet() {
  for (const name of wb.SheetNames) {
    const candidate = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false });
    const headerRow = candidate.find((row) => Array.isArray(row) && row.length >= 7);
    if (headerRow && REPORT_HEADERS.every((h, i) => String(headerRow[i] ?? '') === h)) {
      return { name, rows: candidate };
    }
  }
  return { name: wb.SheetNames[0], rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }) };
}

const { name: sheetName, rows: allRows } = findReportSheet();
const headerIndex = allRows.findIndex(
  (row) => Array.isArray(row) && REPORT_HEADERS.every((h, i) => String(row[i] ?? '') === h),
);
const rows = headerIndex >= 0 ? allRows.slice(headerIndex) : allRows;

console.log('ชีต:', sheetName, '(เลือกชีตที่มีหัวตารางรายงาน 7 คอลัมน์)');
console.log('หัวตาราง:', JSON.stringify(rows[0]));
for (const row of rows.slice(1)) {
  console.log(JSON.stringify(row));
}

const flat = rows.flat().map((v) => String(v ?? ''));
const hasTime = flat.some((v) => /\d{1,2}:\d{2}/.test(v));
const hasWarn = flat.some((v) => /⚠/.test(v));
const hasSystemWarning = flat.some((v) =>
  /(กรุณาตรวจสอบ|ไม่สามารถตีความ|ไม่ถูกต้องตามปฏิทิน|ไม่แน่ใจ|ตีความเป็น)/.test(v),
);
const noteIndex = REPORT_HEADERS.indexOf('หมายเหตุ');
const noteValues = rows.slice(1).map((row) => String(row?.[noteIndex] ?? ''));
const notesAllBlank = noteValues.every((v) => v.trim() === '');

console.log('---');
console.log('มีเวลาในไฟล์:', hasTime);
console.log('มีเครื่องหมาย ⚠:', hasWarn);
console.log('มีข้อความเตือนที่ระบบสร้าง:', hasSystemWarning);
console.log('จำนวนคอลัมน์หัวตาราง:', rows[0].length);
console.log('จำนวนแถวข้อมูล:', rows.length - 1);
console.log('คอลัมน์หมายเหตุว่างทุกแถว:', notesAllBlank, JSON.stringify(noteValues));

