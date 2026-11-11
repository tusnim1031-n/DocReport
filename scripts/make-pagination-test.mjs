/**
 * สร้างไฟล์ทดสอบการแบ่งหน้ารายงาน
 * แต่ละชีตมีจำนวนแถว 1 / 10 / 20 / 36 / 68 / 100 และมี "เรื่อง" ยาวสั้นคละกัน
 * เพื่อทดสอบว่าหน้าที่แบ่งตามความสูงจริงไม่ล้นกระดาษ
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const SHORT = 'ขอเชิญประชุม';
const MEDIUM =
  'ขอเชิญประชุมคณะกรรมการพิจารณางบประมาณประจำปี และขอความอนุเคราะห์ส่งผู้แทนเข้าร่วมประชุม';
const LONG =
  'ขอความอนุเคราะห์ข้อมูลสถิติขยะมูลฝอยเพื่อจัดทำรายงานประจำปี และขอความร่วมมือตอบแบบสอบถามความพึงพอใจการให้บริการภาครัฐ พร้อมทั้งแจ้งกำหนดการประชุมชี้แจงแนวทางการจัดทำคำขอตั้งงบประมาณรายจ่ายประจำปีงบประมาณ พ.ศ. 2569';
const VERY_LONG = `${LONG} ${LONG}`;
const AGENCIES = [
  'สำนักงานปลัดกระทรวงศึกษาธิการ',
  'กรมการปกครอง',
  'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน',
  'กรมส่งเสริมคุณภาพสิ่งแวดล้อม',
  'สำนักงานคณะกรรมการข้าราชการพลเรือน',
];
const LONG_AGENCY =
  'สำนักงานปลัดกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม กลุ่มภารกิจด้านบริหารจัดการ';

const SUBJECTS = [SHORT, MEDIUM, LONG, VERY_LONG];
const SIZES = [1, 10, 20, 36, 68, 100];

function buildRows(count) {
  const rows = [
    ['เลขรับ', 'ที่', 'ลงวันที่', 'จาก', 'เรื่อง', 'วันที่รับ', 'หมายเหตุ'],
  ];
  for (let i = 0; i < count; i += 1) {
    const subject = SUBJECTS[i % SUBJECTS.length];
    const from = i % 9 === 0 ? LONG_AGENCY : AGENCIES[i % AGENCIES.length];
    const day = (i % 28) + 1;
    const month = String((i % 12) + 1).padStart(2, '0');
    // คละรูปแบบวันที่: ข้อความไทย / ISO / ค.ศ. / ว่าง
    const docDate =
      i % 5 === 0
        ? `${day}/01/2569`
        : i % 5 === 1
          ? `2569-${month}-${String(day).padStart(2, '0')}`
          : i % 5 === 2
            ? `${String(day).padStart(2, '0')}/${month}/2026`
            : i % 5 === 3
              ? `${day} กุมภาพันธ์ 2569`
              : '';
    const recvDate = i % 7 === 0 ? '' : `${String(day).padStart(2, '0')}/${month}/2569`;
    rows.push([
      String(1001 + i),
      `ศธ ${String(101 + (i % 90))}/2569`,
      docDate,
      from,
      subject,
      recvDate,
      i % 4 === 0 ? 'รับผ่านระบบสารบรรณ' : '',
    ]);
  }
  return rows;
}

const workbook = XLSX.utils.book_new();
for (const size of SIZES) {
  const sheet = XLSX.utils.aoa_to_sheet(buildRows(size));
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
    { wch: 40 },
    { wch: 60 },
    { wch: 14 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, `n${size}`);
}

const outDir = resolve(root, 'sample');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'ทดสอบ_หลายขนาด.xlsx');
const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(outFile, buffer);

console.log(`สร้างไฟล์ทดสอบแล้ว: ${outFile}`);
console.log(`ชีต: ${SIZES.map((size) => `n${size}`).join(', ')}`);
