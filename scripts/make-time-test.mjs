/**
 * สร้างไฟล์ทดสอบที่มีวันที่+เวลา เพื่อตรวจว่าระบบแสดงเฉพาะวันที่
 * รัน: node scripts/make-time-test.mjs
 */
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const rows = [
  ['ทะเบียนรับหนังสือ (ทดสอบวันที่+เวลา)'],
  [],
  ['เลขรับ', 'ที่', 'ลงวันที่', 'จาก', 'เรื่อง', 'วันที่รับ', 'หมายเหตุ'],
  ['1001', 'สธ 001/2567', '8 มกราคม 2567 08:30', 'สำนักปลัดกระทรวงสาธารณสุข', 'ขอเชิญประชุม', '9/1/2567 16:30 น.', 'รับผ่านระบบ'],
  ['1002', 'สธ 002/2567', '2567-01-15 00:00:00', 'กรมบัญชีกลาง', 'ส่งรายงานการเงินประจำเดือน', '2567-01-15 14:05:00', ''],
  ['1003', 'สธ 003/2567', '2024-01-20T08:00:00.000Z', 'สำนักงานศึกษาธิการจังหวัด', 'แจ้งกำหนดการอบรม', '2024-01-20T09:30:00.000Z', 'มีเอกสารแนบ'],
  ['1004', 'สธ 004/2567', '1 มีนาคม 2567 เวลา 10.15 น.', 'กรมการปกครอง', 'ขอความอนุเคราะห์ข้อมูล', '1/3/2567 11:00', ''],
  ['1005', 'สธ 005/2567', '12/02/2567', 'เทศบาลนครเชียงใหม่', 'ประสานงานจัดกิจกรรม', '12/02/2567 16:45:30', ''],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'ทะเบียนรับ');
const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
const outPath = resolve(root, 'sample/ทดสอบ_วันที่และเวลา.xlsx');
writeFileSync(outPath, out);
console.log('สร้าง sample/ทดสอบ_วันที่และเวลา.xlsx เรียบร้อย (%d bytes)', out.length);
