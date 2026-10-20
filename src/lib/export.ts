/**
 * การส่งออกข้อมูลเป็น Excel (ทำในเบราว์เซอร์ ไม่มีการอัปโหลด)
 */
import * as XLSX from 'xlsx';
import { REPORT_COLUMNS, reportColumnValue, type RegisterRow } from './types';

export function exportRowsToExcel(rows: RegisterRow[], fileName: string, sheetName = 'ทะเบียนหนังสือ'): void {
  const header = REPORT_COLUMNS.map((column) => column.label);
  const body = rows.map((row) =>
    REPORT_COLUMNS.map((column) => reportColumnValue(row, column.key)),
  );

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);

  worksheet['!cols'] = REPORT_COLUMNS.map((column) => ({
    wch: column.key === 'subject' ? 50 : column.key === 'from' ? 28 : 18,
  }));

  // จัดรูปแบบหัวตาราง (ตัวหนา) และเปิดตัดบรรทัดในช่องเรื่อง
  const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = {
        font: { bold: true, name: 'Sarabun', sz: 12 },
        fill: { fgColor: { rgb: '1E3A8A' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    }
  }
  for (let r = 1; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = {
        font: { name: 'Sarabun', sz: 12 },
        alignment: { vertical: 'top', wrapText: true },
      };
      if (typeof cell.v === 'string' && /^\d{4,}$/.test(cell.v)) {
        // รักษาเลขหนังสือ/เลขรับให้เป็นข้อความ เพื่อไม่ให้สูญเสียศูนย์นำหน้าหรือถูกจัดรูปแบบเป็นตัวเลข
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  // แช่แข็งหัวตารางและเปิดตัวกรอง
  worksheet['!freeze'] = { xSplit: '0', ySplit: '1' };
  worksheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));

  const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(workbook, safeName, { bookType: 'xlsx', compression: true });
}
