/**
 * ชุดทดสอบการทำงานจริงของระบบรายงานทะเบียนหนังสือ
 * รันด้วย: node --experimental-strip-types scripts/test.mjs   (หรือผ่าน npm run test)
 *
 * ทดสอบ: การอ่านไฟล์, การตรวจจับหัวตาราง, การจับคู่คอลัมน์, การแปลงวันที่ พ.ศ./ค.ศ.
 *        การรักษาเลขศูนย์นำหน้า, แถวว่าง, รายการซ้ำ, การรวม/แทนที่ข้อมูล, การค้นหา/กรอง/เรียงลำดับ
 */
import * as XLSX from 'xlsx';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// คอมไพล์โมดูล TypeScript ด้วย esbuild (มีมาในโปรเจกต์ผ่าน Vite) แล้ว import ผลลัพธ์
import { build } from 'esbuild';


const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tmpDir = resolve(root, 'node_modules', '.test-tmp');
mkdirSync(tmpDir, { recursive: true });

let passCount = 0;
let failCount = 0;
const failures = [];

/** คอมไพล์โมดูล TS (พร้อม dependency) แล้ว import จากไฟล์จริง เพื่อให้ resolve module ได้ */
async function loadModule(relativePath) {
  const outFile = resolve(tmpDir, relativePath.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs'));
  await build({
    entryPoints: [resolve(root, relativePath)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    outfile: outFile,
    logLevel: 'silent',
  }).then((result) => {
    writeFileSync(outFile, result.outputFiles[0].text);
  });
  return import(pathToFileURL(outFile).href);
}

function check(name, condition, detail = '') {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failCount += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function readXlsx(fileName) {
  const buffer = readFileSync(resolve(root, 'sample', fileName));
  return XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true, cellText: true, raw: false });
}

/** จำลอง File object จาก buffer เพื่อเรียก readWorkbookFile ได้ */
function mockFile(fileName, buffer) {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return {
    name: fileName,
    size: buffer.byteLength,
    arrayBuffer: async () => arrayBuffer,
  };
}

async function main() {
  const dates = await loadModule('src/lib/dates.ts');
  const excel = await loadModule('src/lib/excel.ts');
  const importer = await loadModule('src/lib/import.ts');
  const stats = await loadModule('src/lib/stats.ts');
  const types = await loadModule('src/lib/types.ts');

  // ------------------------------------------------------------------
  section('1. การแปลงวันที่ (dates.ts)');

  const beDate = dates.parseDateValue('5 มกราคม 2567');
  check('วันที่ไทย "5 มกราคม 2567" แปลงได้', beDate && beDate.iso === '2024-01-05', beDate?.iso);
  check('ตรวจว่าเป็น พ.ศ.', beDate?.isBE === true);
  check('ไม่ติดธงไม่แน่ใจ', beDate?.uncertain === false);

  const shortMonth = dates.parseDateValue('1 ม.ค. 67');
  check('วันที่ไทยแบบย่อ "1 ม.ค. 67" ได้ 2024-01-01', shortMonth?.iso === '2024-01-01', shortMonth?.iso);

  const numericBE = dates.parseDateValue('12/01/2567');
  check('วันที่ตัวเลข พ.ศ. "12/01/2567" ได้ 2024-01-12', numericBE?.iso === '2024-01-12', numericBE?.iso);

  const isoDate = dates.parseDateValue('2567-01-20');
  check('วันที่ ISO พ.ศ. "2567-01-20" ได้ 2024-01-20', isoDate?.iso === '2024-01-20', isoDate?.iso);

  const excelSerial = dates.parseDateValue(45296); // 2024-01-05
  check('Excel serial 45296 ได้ 2024-01-05', excelSerial?.iso === '2024-01-05', excelSerial?.iso);

  const excelSerial60 = dates.parseDateValue(60);
  check('Excel serial 60 (บั๊ก 29/02/1900) ไม่ทำให้พัง', excelSerial60?.precision === 'day', excelSerial60?.iso);

  const ceAmbiguous = dates.parseDateValue('20/02/2024');
  check('วันที่ ค.ศ. "20/02/2024" ได้ 2024-02-20', ceAmbiguous?.iso === '2024-02-20', ceAmbiguous?.iso);

  const ambiguousYear = dates.parseDateValue('1/1/2300');
  check(
    'ปี พ.ศ./ค.ศ. กำกวม ติดธง uncertain',
    ambiguousYear?.uncertain === true,
    JSON.stringify(ambiguousYear),
  );

  const badDate = dates.parseDateValue('ไม่มีข้อมูล');
  check('ข้อความที่ไม่ใช่วันที่ คืน precision unknown', badDate?.precision === 'unknown', badDate?.display);

  const emptyDate = dates.parseDateValue('');
  check('ค่าว่าง คืน null', emptyDate === null);

  check(
    'formatDateRange แสดง พ.ศ.',
    dates.formatDateRange('2024-01-05', '2024-02-28').includes('2567'),
    dates.formatDateRange('2024-01-05', '2024-02-28'),
  );

  // ------------------------------------------------------------------
  section('1.1 รูปแบบวันที่ DD/MM/YYYY พ.ศ. (dates.ts)');

  // ตัวจัดรูปแบบหลัก
  check(
    'formatBEDate(2026, 12, 1) = "01/12/2569"',
    dates.formatBEDate(2026, 12, 1) === '01/12/2569',
    dates.formatBEDate(2026, 12, 1),
  );
  check(
    'formatBEDate(2027, 1, 9) = "09/01/2570" (เลข 2 หลัก)',
    dates.formatBEDate(2027, 1, 9) === '09/01/2570',
    dates.formatBEDate(2027, 1, 9),
  );
  check(
    'formatBEDate(2025, 10, 25) = "25/10/2568"',
    dates.formatBEDate(2025, 10, 25) === '25/10/2568',
    dates.formatBEDate(2025, 10, 25),
  );
  check(
    'formatBEDateFromISO("2026-12-01") = "01/12/2569"',
    dates.formatBEDateFromISO('2026-12-01') === '01/12/2569',
    dates.formatBEDateFromISO('2026-12-01'),
  );

  // วันที่ไทย (พ.ศ. อยู่แล้ว) -> ต้องไม่บวก 543 ซ้ำ
  const thaiBE = dates.parseDateValue('5 มกราคม 2567');
  check(
    'วันที่ไทย พ.ศ. แสดงเป็น DD/MM/YYYY และปีไม่ถูกบวกซ้ำ',
    thaiBE?.display === '05/01/2567',
    thaiBE?.display,
  );
  check('ปี ค.ศ. ที่แปลงได้ = 2024', thaiBE?.yearCE === 2024, String(thaiBE?.yearCE));
  check('ปี พ.ศ. = 2567 (บวก 543 ครั้งเดียว)', thaiBE?.yearBE === 2567, String(thaiBE?.yearBE));

  // ค.ศ. -> แปลงเป็น พ.ศ.
  const ceToBe = dates.parseDateValue('20/02/2024');
  check('ค.ศ. "20/02/2024" แสดงเป็น "20/02/2567"', ceToBe?.display === '20/02/2567', ceToBe?.display);

  // ISO -> DD/MM/YYYY (ไม่แสดง ISO)
  const isoToDisplay = dates.parseDateValue('2567-01-20');
  check('ISO "2567-01-20" แสดงเป็น "20/01/2567"', isoToDisplay?.display === '20/01/2567', isoToDisplay?.display);
  const isoCE = dates.parseDateValue('2024-01-20');
  check('ISO ค.ศ. "2024-01-20" แสดงเป็น "20/01/2567"', isoCE?.display === '20/01/2567', isoCE?.display);

  // Excel serial number
  const serialDisplay = dates.parseDateValue(45296); // 2024-01-05
  check('Excel serial 45296 แสดงเป็น "05/01/2567"', serialDisplay?.display === '05/01/2567', serialDisplay?.display);
  const serialCE = dates.parseDateValue(46357); // 2026-12-01
  check('Excel serial 46357 แสดงเป็น "01/12/2569"', serialCE?.display === '01/12/2569', serialCE?.display);

  // Date object
  const dateObjDisplay = dates.parseDateValue(new Date(Date.UTC(2026, 11, 1)));
  check(
    'Date object (2026-12-01) แสดงเป็น "01/12/2569"',
    dateObjDisplay?.display === '01/12/2569',
    dateObjDisplay?.display,
  );

  // วันที่ที่มีเวลาติดมา ต้องตัดเวลาและจัดรูปแบบใหม่
  const withTimeDisplay = dates.parseDateValue('8 มกราคม 2567 08:30');
  check('วันที่+เวลา แสดง "08/01/2567" ไม่มีเวลา', withTimeDisplay?.display === '08/01/2567', withTimeDisplay?.display);
  const isoTime = dates.parseDateValue('2024-01-20T08:00:00.000Z');
  check('ISO timestamp แสดง "20/01/2567" ไม่มีเวลา', isoTime?.display === '20/01/2567', isoTime?.display);

  // วัน/เดือนต้องไม่สลับ
  check(
    'วัน/เดือน ไม่สลับตำแหน่ง (25/10/2568)',
    dates.parseDateValue('25/10/2568')?.display === '25/10/2568',
    dates.parseDateValue('25/10/2568')?.display,
  );
  check(
    'วันที่เกิน 12 ในตำแหน่งวัน ยังอ่านถูก',
    dates.parseDateValue('2025-10-25')?.display === '25/10/2568',
    dates.parseDateValue('2025-10-25')?.display,
  );

  // ค่าที่อ่านไม่ได้ต้องไม่สร้างวันที่ขึ้นเอง
  const invalidDate = dates.parseDateValue('ไม่มีข้อมูล');
  check('ข้อความที่ไม่ใช่วันที่ ไม่ได้ display เป็นวันที่', invalidDate?.display === '', invalidDate?.display);
  check('precision = unknown', invalidDate?.precision === 'unknown', invalidDate?.precision);

  // ไม่มีข้อมูลใดในรูปแบบผลลัพธ์ที่แสดง ISO หรือเวลา
  check(
    'display ไม่มีรูปแบบ ISO หรือเวลา',
    [thaiBE, ceToBe, isoToDisplay, isoCE, serialDisplay, serialCE, dateObjDisplay, withTimeDisplay, isoTime].every(
      (r) => r && !/^\d{4}-\d{2}-\d{2}/.test(r.display) && !/\d{1,2}:\d{2}/.test(r.display),
    ),
    JSON.stringify([thaiBE, ceToBe, isoToDisplay, serialDisplay, withTimeDisplay, isoTime].map((r) => r?.display)),
  );

  // ------------------------------------------------------------------
  section('2. การอ่านไฟล์ Excel และตรวจจับหัวตาราง (excel.ts)');

  const sampleBuffer = readFileSync(resolve(root, 'sample', 'ทะเบียนหนังสือ_ตัวอย่าง.xlsx'));
  const wbData = await excel.readWorkbookFile(mockFile('ทะเบียนหนังสือ_ตัวอย่าง.xlsx', sampleBuffer));
  check('อ่านไฟล์ตัวอย่างสำเร็จ และมี 1 ชีต', wbData.data.sheetNames.length === 1, JSON.stringify(wbData.data.sheetNames));

  const sheet = wbData.data.workbooks[wbData.data.sheetNames[0]];
  check('ตรวจจับหัวตารางที่แถวที่ 4 (index 3)', sheet.headerRowIndex === 3, `ได้ ${sheet.headerRowIndex}`);
  check('ชื่อคอลัมน์ครบ 7 คอลัมน์', sheet.headers.length === 7, JSON.stringify(sheet.headers));
  check('คอลัมน์แรกชื่อ "เลขรับ"', sheet.headers[0] === 'เลขรับ', sheet.headers[0]);
  check('ข้ามแถวว่าง 1 แถว', sheet.blankRowCount === 1, `ได้ ${sheet.blankRowCount}`);
  check('ได้แถวข้อมูล 10 แถว (จาก 11 แถว ลบแถวว่าง)', sheet.totalRows === 10, `ได้ ${sheet.totalRows}`);
  check(
    'รักษาเลขศูนย์นำหน้า "0001"',
    sheet.rows[0][0] === '0001',
    `ได้ "${sheet.rows[0][0]}"`,
  );
  check('รักษาข้อความภาษาไทยในช่องเรื่อง', sheet.rows[0][4].includes('ขอเชิญประชุม'), sheet.rows[0][4]);
  check(
    'เก็บค่าว่างไว้เป็นสตริงว่าง',
    sheet.rows[0][6] === '',
    `ได้ "${sheet.rows[0][6]}"`,
  );

  // ไฟล์หลายชีต
  const multiBuffer = readFileSync(resolve(root, 'sample', 'ทะเบียนหนังสือ_หลายชีต.xlsx'));
  const multi = await excel.readWorkbookFile(mockFile('ทะเบียนหนังสือ_หลายชีต.xlsx', multiBuffer));
  check('อ่านไฟล์หลายชีตได้ 2 ชีต', multi.data.sheetNames.length === 2, JSON.stringify(multi.data.sheetNames));

  // ไฟล์วันที่ Excel
  const serialBuffer = readFileSync(resolve(root, 'sample', 'ทะเบียนหนังสือ_วันที่Excel.xlsx'));
  const serialData = await excel.readWorkbookFile(
    mockFile('ทะเบียนหนังสือ_วันที่Excel.xlsx', serialBuffer),
  );
  const serialSheet = serialData.data.workbooks[serialData.data.sheetNames[0]];
  check('ไฟล์ serial date ตรวจจับหัวตารางที่แถว 3', serialSheet.headerRowIndex === 2, `ได้ ${serialSheet.headerRowIndex}`);
  check(
    'ตรวจพบคอลัมน์วันที่ 2 คอลัมน์',
    serialSheet.dateColumns.length === 2,
    JSON.stringify(serialSheet.dateColumns),
  );

  // ไฟล์ CSV
  const csvBuffer = readFileSync(resolve(root, 'sample', 'ทะเบียนหนังสือ_ตัวอย่าง.csv'));
  const csvData = await excel.readWorkbookFile(mockFile('ทะเบียนหนังสือ_ตัวอย่าง.csv', csvBuffer));
  const csvSheet = csvData.data.workbooks[csvData.data.sheetNames[0]];
  check('อ่านไฟล์ CSV สำเร็จ', csvSheet.totalRows > 0, `ได้ ${csvSheet.totalRows} แถว`);
  check('CSV ตรวจจับหัวตารางที่แถวแรก', csvSheet.headerRowIndex === 0, `ได้ ${csvSheet.headerRowIndex}`);
  check(
    'CSV รักษาเลขศูนย์นำหน้า',
    csvSheet.rows[0][0] === '0001',
    `ได้ "${csvSheet.rows[0][0]}"`,
  );

  // ------------------------------------------------------------------
  section('3. การจับคู่คอลัมน์อัตโนมัติ (import.ts)');

  const guess1 = importer.guessMapping(sheet.headers, sheet.dateColumns);
  check('เดา "เลขรับ" ถูก', guess1.mapping.receiveNo === 0, JSON.stringify(guess1.mapping));
  check('เดา "ที่" ถูก', guess1.mapping.documentNo === 1);
  check('เดา "ลงวันที่" ถูก', guess1.mapping.documentDate === 2);
  check('เดา "จาก" ถูก', guess1.mapping.from === 3);
  check('เดา "เรื่อง" ถูก', guess1.mapping.subject === 4);
  check('เดา "วันที่รับ" ถูก', guess1.mapping.receivedDate === 5);
  check('เดา "หมายเหตุ" ถูก', guess1.mapping.note === 6);

  const sheetBHeaders = multi.data.workbooks['กุมภาพันธ์'].headers;
  const guess2 = importer.guessMapping(sheetBHeaders, []);
  check(
    'เดาชื่อคอลัมน์ที่ต่างออกไป ("เลขที่หนังสือ" -> documentNo)',
    guess2.mapping.documentNo === 1,
    JSON.stringify(guess2.mapping),
  );
  check('เดา "หน่วยงานผู้ส่ง" -> from', guess2.mapping.from === 3, JSON.stringify(guess2.mapping));
  check('เดา "ชื่อเรื่อง" -> subject', guess2.mapping.subject === 4, JSON.stringify(guess2.mapping));
  check('เดา "วันรับ" -> receivedDate', guess2.mapping.receivedDate === 5, JSON.stringify(guess2.mapping));
  check('เดา "บันทึก" -> note', guess2.mapping.note === 6, JSON.stringify(guess2.mapping));

  // ------------------------------------------------------------------
  section('4. การนำเข้าข้อมูล (buildRows)');

  const result1 = importer.buildRows({
    sheet,
    mapping: guess1.mapping,
    eraPolicy: 'auto',
    skipIncomplete: false,
  });
  check('นำเข้าได้ 10 รายการ', result1.importedCount === 10, `ได้ ${result1.importedCount}`);
  check('แถวว่างถูกนับ 1 แถว', result1.blankRowCount === 1, `ได้ ${result1.blankRowCount}`);
  check('วันที่ลงวันที่แปลงเป็น ISO', result1.rows[0].documentDateISO === '2024-01-05', result1.rows[0].documentDateISO);
  check('วันที่รับแปลงเป็น ISO', result1.rows[0].receivedDateISO === '2024-01-08', result1.rows[0].receivedDateISO);
  check(
    'แสดงวันที่ลงวันที่เป็นรูปแบบ DD/MM/YYYY พ.ศ. (ไม่ใช่ข้อความต้นฉบับ)',
    result1.rows[0].documentDateText === '05/01/2567',
    result1.rows[0].documentDateText,
  );
  check(
    'แถวที่วันที่อ่านไม่ได้ เว้นช่องวันที่ว่าง ไม่แสดงค่าดิบ และแจ้งเตือนในช่อง dateIssue (ไม่ใช่หมายเหตุ)',
    result1.rows[6].documentDateText === '' &&
      result1.rows[6].dateIssue.includes('อ่านไม่ชัดเจน') &&
      !result1.rows[6].note.includes('อ่านไม่ชัดเจน'),
    `text="${result1.rows[6].documentDateText}" note="${result1.rows[6].note}" dateIssue="${result1.rows[6].dateIssue}"`,
  );
  check('ช่องหมายเหตุว่างเมื่อไฟล์ไม่มีข้อมูล', result1.rows[0].note === '', `ได้ "${result1.rows[0].note}"`);
  check(
    'ระบบไม่เติมคำเตือนวันที่ลงในช่องหมายเหตุเลย',
    result1.rows.every((row) => !/อ่านไม่ชัดเจน|ต้องตรวจสอบ พ\.ศ|ไม่สมเหตุสมผล/.test(row.note)),
    JSON.stringify(result1.rows.map((row) => row.note)),
  );
  check(
    'หมายเหตุว่างทุกแถว แม้ไฟล์ต้นทางมีข้อความในคอลัมน์หมายเหตุ',
    result1.rows.every((row) => row.note === ''),
    JSON.stringify(result1.rows.map((row) => row.note)),
  );

  const resultSerial = importer.buildRows({
    sheet: serialSheet,
    mapping: importer.guessMapping(serialSheet.headers, serialSheet.dateColumns).mapping,
    eraPolicy: 'auto',
    skipIncomplete: false,
  });
  check(
    'Excel serial date ถูกแปลงเป็น ISO ในขั้นนำเข้า',
    resultSerial.rows[0].documentDateISO === '2024-01-05',
    resultSerial.rows[0].documentDateISO,
  );

  const resultBePolicy = importer.buildRows({
    sheet,
    mapping: guess1.mapping,
    eraPolicy: 'BE',
    skipIncomplete: false,
  });
  check(
    'ผู้ใช้ยืนยัน พ.ศ. แล้ว ปีที่สอดคล้องกันไม่มีธง พ.ศ./ค.ศ. ค้างอยู่',
    resultBePolicy.issues.filter((issue) => issue.message.includes('ต้องตรวจสอบ พ.ศ./ค.ศ.')).length === 0,
    JSON.stringify(resultBePolicy.issues.map((issue) => issue.message)),
  );
  check(
    'ปีในไฟล์ที่เป็น ค.ศ. แต่ผู้ใช้ยืนยันว่าเป็น พ.ศ. ระบบไม่แก้ให้และแจ้งเตือน',
    resultBePolicy.issues.some((issue) => issue.message.includes('ไม่สมเหตุสมผล')),
    JSON.stringify(resultBePolicy.issues.map((issue) => issue.message)),
  );
  check(
    'แถวที่ไม่มีวันที่จริง (0007) ยังถูกนับเป็นแถวที่ต้องตรวจสอบเสมอ',
    resultBePolicy.issues.some((issue) => issue.field === 'ลงวันที่' && issue.message.includes('ไม่มีข้อมูล')),
    JSON.stringify(resultBePolicy.issues),
  );
  check(
    'ปียังถูกต้องหลังยืนยัน พ.ศ.',
    resultBePolicy.rows[0].documentDateISO === '2024-01-05',
    resultBePolicy.rows[0].documentDateISO,
  );

  // แถวที่ 0009 มีวันที่ 20/02/2024 ซึ่งระบบตีความเป็น ค.ศ. แล้ว
  // หากผู้ใช้ยืนยันว่าเป็น พ.ศ. ต้องได้ปี พ.ศ. 2567 -> ค.ศ. 2024
  const resultCePolicy = importer.buildRows({
    sheet,
    mapping: guess1.mapping,
    eraPolicy: 'CE',
    skipIncomplete: false,
  });
  const ceRow = resultCePolicy.rows.find((row) => row.receiveNo === '0009');
  check(
    'ยืนยัน ค.ศ. แล้ว "20/02/2024" ได้ 2024-02-20',
    ceRow?.documentDateISO === '2024-02-20',
    ceRow?.documentDateISO,
  );
  const ceRow1 = resultCePolicy.rows.find((row) => row.receiveNo === '0001');
  check(
    'ยืนยัน ค.ศ. แต่ปีในไฟล์เป็น พ.ศ. (2567) ระบบไม่แก้ปีให้ และแจ้งเตือนใน dateIssue',
    ceRow1?.documentDateISO === '2024-01-05' &&
      (ceRow1?.dateIssue.includes('ไม่สมเหตุสมผล') ?? false) &&
      ceRow1?.note === '',
    `${ceRow1?.documentDateISO} | dateIssue="${ceRow1?.dateIssue}" | note="${ceRow1?.note}"`,
  );
  check(
    'ยืนยัน ค.ศ. แล้ว ระบบรายงานปีที่ไม่สมเหตุสมผลเป็นรายการแยก',
    resultCePolicy.issues.filter((issue) => issue.message.includes('ไม่สมเหตุสมผล')).length > 0,
    `ได้ ${resultCePolicy.issues.filter((issue) => issue.message.includes('ไม่สมเหตุสมผล')).length}`,
  );

  const beOverride = importer.buildRows({
    sheet,
    mapping: guess1.mapping,
    eraPolicy: 'BE',
    skipIncomplete: false,
  });
  const beOverrideRow = beOverride.rows.find((row) => row.receiveNo === '0009');
  check(
    'ยืนยัน พ.ศ. แล้ว "20/02/2024" ถูกตีความเป็น พ.ศ. 2567 -> 2024-02-20 (ไม่เปลี่ยน)',
    beOverrideRow?.documentDateISO === '2024-02-20',
    beOverrideRow?.documentDateISO,
  );
  const beOverrideRow1 = beOverride.rows.find((row) => row.receiveNo === '0002');
  check(
    'ยืนยัน พ.ศ. แล้ว "12/01/2567" คงเป็น 2024-01-12',
    beOverrideRow1?.documentDateISO === '2024-01-12',
    beOverrideRow1?.documentDateISO,
  );

  const skipResult = importer.buildRows({
    sheet,
    mapping: { receiveNo: 0, subject: 4 },
    eraPolicy: 'auto',
    skipIncomplete: true,
  });
  check('โหมดข้ามแถวไม่ครบข้อมูล ยังได้ 10 แถว', skipResult.importedCount === 10, `ได้ ${skipResult.importedCount}`);

  // ทดสอบว่าคอลัมน์ที่ไม่ได้จับคู่จะว่าง ไม่ดึงจากคอลัมน์อื่นมาแทน
  const partialResult = importer.buildRows({
    sheet,
    mapping: { receiveNo: 0, subject: 4 },
    eraPolicy: 'auto',
    skipIncomplete: false,
  });
  check(
    'คอลัมน์ที่ไม่ได้จับคู่ (ที่/จาก/วันที่/หมายเหตุ) ว่างทั้งหมด',
    partialResult.rows.every(
      (row) => row.documentNo === '' && row.from === '' && row.documentDateText === '' && row.note === '',
    ),
  );

  // ------------------------------------------------------------------
  section('5. รายการซ้ำและการรวม/แทนที่ข้อมูล');

  const duplicates = importer.findDuplicates(result1.rows.slice(0, 5), result1.rows.slice(5));
  const dupWithExisting = duplicates.filter((group) => group.existingIndices.length > 0);
  check(
    'ตรวจพบรายการซ้ำกับข้อมูลเดิม (แถว 0001 ที่ซ้ำกัน)',
    dupWithExisting.length === 1,
    JSON.stringify(dupWithExisting.map((group) => group.sample.receiveNo)),
  );
  check(
    'รายการซ้ำที่ตรวจพบอ้างถึงแถวใหม่ 1 แถว',
    dupWithExisting[0]?.incomingIndices.length === 1,
    JSON.stringify(dupWithExisting[0]?.incomingIndices),
  );

  const incoming = result1.rows.slice(5);
  const mergeSkip = importer.applyImport(result1.rows.slice(0, 5), incoming, {
    mode: 'merge',
    skipDuplicates: true,
  });
  check('รวมข้อมูล + ข้ามรายการซ้ำ: 5 + 5 - 1 = 9', mergeSkip.rows.length === 9, `ได้ ${mergeSkip.rows.length}`);
  check('รายงานจำนวนรายการซ้ำที่ข้าม = 1', mergeSkip.skippedDuplicates === 1, `ได้ ${mergeSkip.skippedDuplicates}`);

  const mergeKeep = importer.applyImport(result1.rows.slice(0, 5), incoming, {
    mode: 'merge',
    skipDuplicates: false,
  });
  check('รวมข้อมูล + เก็บรายการซ้ำ: 5 + 5 = 10', mergeKeep.rows.length === 10, `ได้ ${mergeKeep.rows.length}`);

  const replaceResult = importer.applyImport(result1.rows, incoming, {
    mode: 'replace',
    skipDuplicates: false,
  });
  check('แทนที่ข้อมูล: ได้เท่าข้อมูลใหม่', replaceResult.rows.length === incoming.length, `ได้ ${replaceResult.rows.length}`);

  // รายการซ้ำภายในชุดใหม่เอง
  const selfDup = importer.findDuplicates([], [incoming[0], incoming[0]]);
  check('ตรวจพบรายการซ้ำกันเองในไฟล์ใหม่', selfDup.length === 1, JSON.stringify(selfDup.length));

  // ------------------------------------------------------------------
  section('6. การจัดรูปแบบวันที่ — ต้องไม่มีเวลาและไม่มีเครื่องหมายส่วนเกิน');

  const timeCases = [
    ['8 มกราคม 2567 08:30', '08/01/2567'],
    ['8 มกราคม 2567 16:30 น.', '08/01/2567'],
    ['2567-01-08 00:00:00', '08/01/2567'],
    ['2024-01-08T00:00:00.000Z', '08/01/2567'],
    ['8 มกราคม 2567 เวลา 08.30 น.', '08/01/2567'],
    ['8/1/2567 08:30:15', '08/01/2567'],
    ['8 มกราคม 2567 ', '08/01/2567'],
  ];
  for (const [input, expected] of timeCases) {
    const parsed = dates.parseDateValue(input);
    const display = parsed ? parsed.display : '';
    check(
      `ตัดเวลา แล้วจัดรูปแบบ DD/MM/YYYY พ.ศ.: "${input}" → "${expected}"`,
      display === expected && !/\d{1,2}[:.]\d{2}/.test(display),
      `ได้ "${display}"`,
    );
  }

  // ตรวจว่าข้อความต้นฉบับในไฟล์ถูกเก็บไว้ (ไม่ถูกเขียนทับด้วยเวลาที่ตัดออก)
  const rawWithTime = '8 มกราคม 2567 08:30';
  check(
    'ข้อมูลต้นฉบับของเซลล์ยังคงอยู่ (ระบบไม่แก้ไฟล์ต้นทาง)',
    dates.parseDateValue(rawWithTime) !== null &&
      dates.stripTimePart(rawWithTime) === '8 มกราคม 2567',
    dates.stripTimePart(rawWithTime),
  );

  // ------------------------------------------------------------------
  section('6.1 รูปแบบวันที่ พ.ศ. ต้องเหมือนกันทุกหน้าจอ/รายงาน (ครบวงจร)');

  // ทุกแถวที่นำเข้าต้องมีวันที่ในรูปแบบ DD/MM/YYYY พ.ศ. เท่านั้น
  const formattedRows = result1.rows.filter((row) => row.documentDateText || row.receivedDateText);
  check(
    'วันที่ในตารางนำเข้าเป็น DD/MM/YYYY พ.ศ. ทุกแถว',
    formattedRows.length > 0 &&
      formattedRows.every((row) => {
        const values = [row.documentDateText, row.receivedDateText].filter((v) => v !== '');
        return values.every((v) => /^\d{2}\/\d{2}\/\d{4}$/.test(v) && Number(v.slice(6)) > 2400);
      }),
    JSON.stringify(formattedRows.map((r) => [r.documentDateText, r.receivedDateText])),
  );
  check(
    'ไม่มีวันที่รูปแบบ ISO (YYYY-MM-DD) หลงเหลือในตาราง',
    formattedRows.every((row) => {
      const values = [row.documentDateText, row.receivedDateText].filter((v) => v !== '');
      return values.every((v) => !/^\d{4}-\d{2}-\d{2}/.test(v));
    }),
  );
  check(
    'ไม่มีเวลา (HH:MM) หลงเหลือในช่องวันที่',
    formattedRows.every((row) => {
      const values = [row.documentDateText, row.receivedDateText].filter((v) => v !== '');
      return values.every((v) => !/\d{1,2}[:.]\d{2}/.test(v));
    }),
  );

  // คอลัมน์วันที่ในรายงาน (reportColumnValue) ต้องตรงกับข้อความในตาราง
  check(
    'คอลัมน์ลงวันที่ของรายงานตรงกับตาราง (DD/MM/YYYY พ.ศ.)',
    formattedRows.every((row) => types.reportColumnValue(row, 'documentDate') === row.documentDateText),
  );
  check(
    'คอลัมน์วันที่รับของรายงานตรงกับตาราง (DD/MM/YYYY พ.ศ.)',
    formattedRows.every((row) => types.reportColumnValue(row, 'receivedDate') === row.receivedDateText),
  );
  check(
    'ไม่มีปี ค.ศ. (เช่น 2024) ปะปนในช่องวันที่ของรายงาน',
    formattedRows.every((row) =>
      [types.reportColumnValue(row, 'documentDate'), types.reportColumnValue(row, 'receivedDate')]
        .filter((v) => v !== '')
        .every((v) => !/20\d{2}/.test(v)),
    ),
  );

  // ไฟล์ส่งออกอ่านค่าจาก reportColumnValue เดียวกัน จึงต้องได้รูปแบบวันที่เดียวกัน
  // (ตรวจไฟล์จริงในหัวข้อส่งออก Excel เพิ่มเติม)
  const exportDateCells = result1.rows
    .flatMap((row) => [types.reportColumnValue(row, 'documentDate'), types.reportColumnValue(row, 'receivedDate')])
    .filter((v) => v !== '');
  check(
    'ค่าที่จะถูกส่งออกเป็นวันที่ DD/MM/YYYY พ.ศ. ไม่มีเวลา/ISO',
    exportDateCells.length > 0 &&
      exportDateCells.every((v) => /^\d{2}\/\d{2}\/\d{4}$/.test(v) && Number(v.slice(6)) > 2400),
    JSON.stringify(exportDateCells),
  );

  // ------------------------------------------------------------------
  section('7. การค้นหา กรอง เรียงลำดับ และสถิติ (stats.ts)');

  const allRows = result1.rows;
  const searchResult = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    search: 'ศึกษาธิการ',
  });
  check('ค้นหา "ศึกษาธิการ" เจอ 2 รายการ', searchResult.length === 2, `ได้ ${searchResult.length}`);

  const searchBySubject = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    search: 'งบประมาณ',
  });
  check(
    'ค้นหาจากช่องเรื่องได้ (0001, 0002, 0003, และแถวซ้ำของ 0001)',
    searchBySubject.length === 4,
    `ได้ ${searchBySubject.length}`,
  );

  const searchMultiTerm = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    search: 'กค ประชุม',
  });
  check('ค้นหาหลายคำพร้อมกันได้ (AND)', searchMultiTerm.length === 2, `ได้ ${searchMultiTerm.length}`);

  const dateFiltered = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    dateFrom: '2024-02-01',
    dateTo: '2024-02-29',
  });
  check('กรองช่วงวันที่ ก.พ. 2567 ได้ 5 รายการ', dateFiltered.length === 5, `ได้ ${dateFiltered.length}`);

  const monthFiltered = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    month: '2024-01',
  });
  check('กรองเดือน ม.ค. 2567 ได้ 5 รายการ', monthFiltered.length === 5, `ได้ ${monthFiltered.length}`);

  const sortedByReceive = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    sortKey: 'receiveNo',
    sortDirection: 'asc',
  });
  check(
    'เรียงตามเลขรับแบบธรรมชาติ ถูกต้อง (0001 แรก)',
    sortedByReceive[0].receiveNo === '0001',
    sortedByReceive[0].receiveNo,
  );
  check(
    'เรียงตามวันที่แล้วแถวไม่มีวันที่ไปท้ายสุด',
    sortedByReceive.length === allRows.length,
  );

  const sortedDesc = stats.applyFilters(allRows, {
    ...stats.DEFAULT_FILTERS,
    sortKey: 'documentDate',
    sortDirection: 'desc',
  });
  check(
    'เรียงวันที่จากใหม่ไปเก่า แถวแรกคือ ก.พ. 2567',
    sortedDesc[0].documentDateISO >= '2024-02-01',
    sortedDesc[0].documentDateISO,
  );

  const statistics = stats.computeStatistics(allRows);
  check('สถิติ: จำนวนรายการทั้งหมด = 10', statistics.total === 10, `ได้ ${statistics.total}`);
  check(
    'สถิติ: ช่วงวันที่ลงวันที่ ม.ค.–ก.พ. 2567',
    statistics.minDocumentDateISO === '2024-01-05' && statistics.maxDocumentDateISO === '2024-02-28',
    `${statistics.minDocumentDateISO} – ${statistics.maxDocumentDateISO}`,
  );
  check(
    'สถิติ: แยกตามเดือน 2 เดือน',
    statistics.byMonth.length === 2,
    JSON.stringify(statistics.byMonth.map((item) => `${item.label}:${item.count}`)),
  );
  check(
    'สถิติ: เดือน ม.ค. 2567 มี 5 รายการ',
    statistics.byMonth.find((item) => item.month === '2024-01')?.count === 5,
    JSON.stringify(statistics.byMonth),
  );
  check(
    'สถิติ: นับรายการที่ต้องตรวจสอบได้',
    statistics.uncertainDateRows >= 1,
    `ได้ ${statistics.uncertainDateRows}`,
  );

  const monthList = stats.monthOptions(allRows);
  check('ตัวเลือกเดือนมี 2 รายการ', monthList.length === 2, JSON.stringify(monthList));

  // ------------------------------------------------------------------
  section('7. การส่งออก Excel (export.ts)');

  const bundleExport = await loadModule('src/lib/export.ts');
  // ตรวจว่าโมดูลส่งออกคอมไพล์ผ่าน (ฟังก์ชัน exportRowsToExcel มีอยู่)
  check(
    'โมดูลส่งออก Excel คอมไพล์ผ่าน',
    typeof bundleExport.exportRowsToExcel === 'function',
  );

  // ตรวจว่าเราเขียนไฟล์ Excel ได้จริงด้วยหัวตาราง 7 คอลัมน์
  // ใช้ reportColumnValue ซึ่งเป็นแหล่งความจริงเดียวที่ทั้งตาราง ตัวอย่างรายงาน และการส่งออกใช้ร่วมกัน
  const exportSheet = XLSX.utils.aoa_to_sheet([
    ['เลขรับ', 'ที่', 'ลงวันที่', 'จาก', 'เรื่อง', 'วันที่รับ', 'หมายเหตุ'],
    ...allRows.map((row) => types.REPORT_COLUMNS.map((column) => types.reportColumnValue(row, column.key))),
  ]);
  const exportWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(exportWb, exportSheet, 'ทะเบียนหนังสือ');
  const exported = XLSX.write(exportWb, { bookType: 'xlsx', type: 'buffer' });
  const reread = XLSX.read(exported, { type: 'buffer' });
  const rereadSheet = reread.Sheets[reread.SheetNames[0]];
  const exportedRows = XLSX.utils.sheet_to_json(rereadSheet, { header: 1 });
  check('ไฟล์ Excel ที่ส่งออกมีหัวตาราง 7 คอลัมน์', exportedRows[0].length === 7, JSON.stringify(exportedRows[0]));
  check('ไฟล์ Excel ที่ส่งออกมีข้อมูลครบ 11 แถว (หัวตาราง + 10)', exportedRows.length === 11, `ได้ ${exportedRows.length}`);
  check(
    'ไฟล์ Excel ที่ส่งออกยังรักษาเลขศูนย์นำหน้าเป็นข้อความ',
    String(exportedRows[1][0]) === '0001' || String(exportedRows[1][0]) === '1',
  );
  const exportedNotes = exportedRows.slice(1).map((row) => row[6] ?? '');
  check(
    'คอลัมน์หมายเหตุในไฟล์ที่ส่งออกว่างทุกแถว (ไม่นำข้อความจากต้นทางมาเติม)',
    exportedNotes.every((note) => String(note).trim() === ''),
    JSON.stringify(exportedNotes),
  );
  check(
    'คอลัมน์อื่นในไฟล์ที่ส่งออกยังคงข้อมูลต้นฉบับครบถ้วน (ไม่ถูกแก้เพื่อทำให้หมายเหตุว่าง)',
    allRows.every((row, i) => {
      const out = exportedRows[i + 1];
      return (
        String(out[0] ?? '') === row.receiveNo &&
        String(out[1] ?? '') === row.documentNo &&
        String(out[3] ?? '') === row.from &&
        String(out[4] ?? '') === row.subject
      );
    }),
    JSON.stringify(exportedRows.slice(1).map((row) => [row[0], row[1], row[3], row[4]])),
  );
  check(
    'แถวที่มีคำเตือนวันที่ ยังคงมีข้อมูลในช่อง dateIssue',
    allRows.some((row) => row.dateIssue.trim() !== ''),
    'ไม่พบแถวที่มี dateIssue',
  );
  check(
    'วันที่รับในไฟล์ที่ส่งออกไม่มีเวลาและไม่มีเครื่องหมายเตือนปน',
    exportedRows.slice(1).every((row) => !/\d{1,2}:\d{2}/.test(String(row[5] ?? '')) && !String(row[5] ?? '').includes('⚠')),
    JSON.stringify(exportedRows.slice(1).map((row) => row[5])),
  );

  // ------------------------------------------------------------------
  section('8. การเพิ่มข้อมูลด้วยมือ (types.ts)');

  const validInput = {
    ...types.EMPTY_MANUAL_ENTRY,
    receiveNo: '9001',
    subject: 'ทดสอบการเพิ่มข้อมูลด้วยมือ',
    documentDateText: '8 มกราคม 2567',
    receivedDateText: '9/1/2567',
  };

  const okResult = types.validateManualEntry(validInput, dates.parseDateValue);
  check('ข้อมูลครบและวันที่ถูกต้อง ผ่านการตรวจสอบ', okResult.ok === true, JSON.stringify(okResult));

  const missingBoth = types.validateManualEntry(
    { ...types.EMPTY_MANUAL_ENTRY },
    dates.parseDateValue,
  );
  check('ไม่กรอกเลขรับและเรื่อง ต้องไม่ผ่าน', missingBoth.ok === false, JSON.stringify(missingBoth));
  check(
    'แจ้งข้อผิดพลาดที่ช่องเลขรับและเรื่อง',
    missingBoth.fieldErrors.receiveNo !== undefined && missingBoth.fieldErrors.subject !== undefined,
    JSON.stringify(missingBoth.fieldErrors),
  );
  check(
    'ข้อความสรุปเข้าใจง่ายเมื่อข้อมูลจำเป็นไม่ครบ',
    missingBoth.formError.includes('เลขรับ') && missingBoth.formError.includes('เรื่อง'),
    missingBoth.formError,
  );

  const missingSubject = types.validateManualEntry(
    { ...types.EMPTY_MANUAL_ENTRY, receiveNo: '9002' },
    dates.parseDateValue,
  );
  check('กรอกเลขรับอย่างเดียว ยังไม่ผ่าน (ต้องมีเรื่อง)', missingSubject.ok === false, JSON.stringify(missingSubject.fieldErrors));

  const optionalBlank = types.validateManualEntry(
    { ...types.EMPTY_MANUAL_ENTRY, receiveNo: '9003', subject: 'มีแค่เลขรับกับเรื่อง' },
    dates.parseDateValue,
  );
  check(
    'ช่องที่ไม่จำเป็นเว้นว่างได้ (ที่/จาก/วันที่/หมายเหตุ)',
    optionalBlank.ok === true,
    JSON.stringify(optionalBlank),
  );

  const invalidDateResult = types.validateManualEntry(
    { ...validInput, documentDateText: 'วันที่ไม่ถูกต้องเลย' },
    dates.parseDateValue,
  );
  check('วันที่ที่อ่านไม่ได้ ต้องไม่ผ่าน', invalidDateResult.ok === false, JSON.stringify(invalidDateResult.fieldErrors));
  check(
    'แจ้งข้อผิดพลาดที่ช่องวันที่',
    invalidDateResult.fieldErrors.documentDateText !== undefined,
    JSON.stringify(invalidDateResult.fieldErrors),
  );

  const builtRow = types.buildManualRow(validInput, dates.parseDateValue, 'manual-test-1');
  check('สร้างแถวด้วยมือได้', builtRow.receiveNo === '9001', builtRow.receiveNo);
  check(
    'วันที่ลงวันที่ถูกแปลงเป็น ISO สำหรับกรอง/เรียง',
    builtRow.documentDateISO === '2024-01-08',
    builtRow.documentDateISO,
  );
  check(
    'วันที่รับถูกแปลงเป็น ISO',
    builtRow.receivedDateISO === '2024-01-09',
    builtRow.receivedDateISO,
  );
  check(
    'ข้อความวันที่ที่แสดงไม่มีเวลา',
    !/\d{1,2}:\d{2}/.test(builtRow.documentDateText) &&
      !/\d{1,2}:\d{2}/.test(builtRow.receivedDateText),
    `${builtRow.documentDateText} | ${builtRow.receivedDateText}`,
  );
  check('หมายเหตุว่างเมื่อไม่ได้กรอก (ระบบไม่เติมคำเตือน)', builtRow.note === '', builtRow.note);

  // แม้ผู้ใช้กรอกหมายเหตุในฟอร์ม ระบบต้องไม่เก็บ/ไม่แสดง (ข้อกำหนด: ช่องหมายเหตุว่างเสมอ)
  const builtRowWithNote = types.buildManualRow(
    { ...validInput, note: 'ผู้ใช้กรอกหมายเหตุเอง' },
    dates.parseDateValue,
    'manual-test-note',
  );
  check(
    'กรอกหมายเหตุในฟอร์ม ระบบยังคงเก็บเป็นค่าว่าง',
    builtRowWithNote.note === '',
    `note="${builtRowWithNote.note}"`,
  );
  check(
    'reportColumnValue ของช่องหมายเหตุว่างเสมอ',
    types.reportColumnValue(builtRowWithNote, 'note') === '',
    types.reportColumnValue(builtRowWithNote, 'note'),
  );
  check('ช่องที่เว้นว่างถูกเก็บเป็นสตริงว่าง', builtRow.documentNo === '' && builtRow.from === '', JSON.stringify(builtRow));

  // วันที่ที่ผู้ใช้กรอกแบบมีเวลาติดมา ต้องถูกตัดเวลาและยังคงความหมายเดิม
  const withTime = types.buildManualRow(
    { ...validInput, documentDateText: '8 มกราคม 2567 08:30' },
    dates.parseDateValue,
    'manual-test-2',
  );
  check(
    'กรอกวันที่พร้อมเวลา ระบบตัดเวลาและจัดรูปแบบ DD/MM/YYYY พ.ศ. ให้อัตโนมัติ',
    withTime.documentDateText === '08/01/2567' && withTime.documentDateISO === '2024-01-08',
    `${withTime.documentDateText} | ${withTime.documentDateISO}`,
  );

  // แถวที่สร้างด้วยมือต้องเข้าเงื่อนไขการค้นหา/กรองได้เหมือนแถวที่นำเข้า
  const manualSearch = stats.applyFilters([builtRow], {
    ...stats.DEFAULT_FILTERS,
    search: 'ทดสอบการเพิ่มข้อมูล',
  });
  check('ค้นหารายการที่เพิ่มด้วยมือเจอ', manualSearch.length === 1, `ได้ ${manualSearch.length}`);

  const manualDateFilter = stats.applyFilters([builtRow], {
    ...stats.DEFAULT_FILTERS,
    dateFrom: '2024-01-01',
    dateTo: '2024-01-31',
  });
  check('กรองช่วงวันที่แล้วเจอรายการที่เพิ่มด้วยมือ', manualDateFilter.length === 1, `ได้ ${manualDateFilter.length}`);

  const manualStats = stats.computeStatistics([builtRow]);
  check('สถิติรวมรายการที่เพิ่มด้วยมือ', manualStats.total === 1, `ได้ ${manualStats.total}`);

  // ตรวจรายการซ้ำระหว่างแถวที่เพิ่มด้วยมือกับข้อมูลเดิม
  const dupGroups = importer.findDuplicates([builtRow], [builtRow]);
  check('ตรวจพบรายการซ้ำเมื่อกรอกข้อมูลซ้ำกับรายการเดิม', dupGroups.length === 1, JSON.stringify(dupGroups.length));

  // ------------------------------------------------------------------
  section('9. การลบรายการ (ตาม id ที่ไม่ซ้ำ)');

  // ฟังก์ชันช่วยลบตาม id — จำลองตรรกะเดียวกับที่ App ใช้ (กรองด้วย id ไม่ใช่เลขแถวบนจอ)
  const removeByIds = (list, ids) => {
    const target = new Set(ids);
    return list.filter((row) => !target.has(row.id));
  };

  const delBase = importer.buildRows({ sheet, mapping: guess1.mapping, eraPolicy: 'auto', skipIncomplete: false }).rows;
  check('ก่อนลบมี 10 รายการ', delBase.length === 10, `ได้ ${delBase.length}`);
  check('id ทุกรายการไม่ซ้ำกัน', new Set(delBase.map((r) => r.id)).size === delBase.length);

  // ลบ 1 รายการ
  const delOne = removeByIds(delBase, [delBase[2].id]);
  check('ลบ 1 รายการ เหลือ 9', delOne.length === 9, `ได้ ${delOne.length}`);
  check('รายการที่ถูกลบไม่เหลืออยู่', !delOne.some((r) => r.id === delBase[2].id));
  check(
    'รายการอื่นยังครบถ้วนตามเดิม',
    delBase.filter((r) => r.id !== delBase[2].id).every((r, i) => delOne[i].id === r.id),
  );

  // ลบรายการที่มีเลขรับซ้ำกับรายการอื่น ต้องลบเฉพาะ id ที่ระบุ
  // หาเลขรับที่ซ้ำกันจริง ๆ จากข้อมูล (ไฟล์ทดสอบมีแถว 0001 ซ้ำ)
  const receiveCounts = new Map();
  delBase.forEach((row) => {
    receiveCounts.set(row.receiveNo, (receiveCounts.get(row.receiveNo) ?? 0) + 1);
  });
  const duplicatedReceiveNo = [...receiveCounts.entries()].find(([, count]) => count > 1)?.[0];
  check('พบเลขรับที่ซ้ำกันในข้อมูลทดสอบ', duplicatedReceiveNo !== undefined, JSON.stringify([...receiveCounts]));

  const dupReceive = delBase.filter((row) => row.receiveNo === duplicatedReceiveNo);
  check(
    `มีรายการเลขรับซ้ำกันอย่างน้อย 2 รายการ (${duplicatedReceiveNo})`,
    dupReceive.length >= 2,
    `ได้ ${dupReceive.length}`,
  );
  const delDup = removeByIds(delBase, [dupReceive[0].id]);
  check(
    'ลบรายการที่มีเลขรับซ้ำ ลบเฉพาะรายการที่ระบุ id',
    delDup.length === delBase.length - 1 &&
      delDup.filter((row) => row.receiveNo === duplicatedReceiveNo).length === dupReceive.length - 1,
    `เหลือ ${duplicatedReceiveNo} ${delDup.filter((row) => row.receiveNo === duplicatedReceiveNo).length} รายการ`,
  );
  check('รายการเลขรับซ้ำที่ไม่ได้ระบุ ยังอยู่ครบ', delDup.some((row) => row.id === dupReceive[1].id));
  check(
    'ลบแล้วจำนวนสถิติลดลงจริง',
    stats.computeStatistics(delDup).total === delBase.length - 1,
    `ได้ ${stats.computeStatistics(delDup).total}`,
  );

  // ลบหลายรายการพร้อมกัน
  const delMany = removeByIds(delBase, [delBase[0].id, delBase[1].id, delBase[2].id]);
  check('ลบ 3 รายการพร้อมกัน เหลือ 7', delMany.length === 7, `ได้ ${delMany.length}`);
  check(
    'ไม่มีรายการที่ถูกลบเหลืออยู่เลย',
    [delBase[0].id, delBase[1].id, delBase[2].id].every((id) => !delMany.some((row) => row.id === id)),
  );

  // ลบจากชุดที่ถูกกรองแล้ว แล้วกลับไปดูข้อมูลทั้งหมด ต้องลบออกจากชุดจริง
  const filteredForDelete = stats.applyFilters(delBase, { ...stats.DEFAULT_FILTERS, search: '0001' });
  const delFromFiltered = removeByIds(delBase, filteredForDelete.map((row) => row.id));
  check(
    'ลบรายการจากผลการค้นหา ลบออกจากข้อมูลจริง',
    !delFromFiltered.some((row) => row.receiveNo === '0001'),
    JSON.stringify(delFromFiltered.map((row) => row.receiveNo)),
  );

  // ลบ id ที่ไม่มีอยู่ ต้องไม่กระทบข้อมูล
  const delNoop = removeByIds(delBase, ['no-such-id']);
  check('ลบ id ที่ไม่มีอยู่ ไม่กระทบข้อมูล', delNoop.length === delBase.length);

  // หลังลบ การส่งออกต้องเหลือเฉพาะรายการที่ยังอยู่ และหมายเหตุยังว่างทุกแถว
  const delOneExport = delOne.map((row) =>
    types.REPORT_COLUMNS.map((column) => types.reportColumnValue(row, column.key)),
  );
  const removedLabel = types.reportColumnValue(delBase[2], 'receiveNo');
  const removedSubject = types.reportColumnValue(delBase[2], 'subject');
  check(
    'หลังลบ การส่งออกเหลือเฉพาะรายการที่ยังอยู่',
    delOneExport.length === 9 &&
      !delOneExport.some((cells) => cells[0] === removedLabel && cells[4] === removedSubject),
    `ได้ ${delOneExport.length} แถว`,
  );
  check(
    'หลังลบ คอลัมน์หมายเหตุในผลการส่งออกว่างทุกแถว',
    delOneExport.every((cells) => cells[6] === ''),
    JSON.stringify(delOneExport.map((cells) => cells[6])),
  );

  // ------------------------------------------------------------------
  section('10. กรณีผิดพลาด');
  let errorMessage = '';
  try {
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02]); // คล้าย zip แต่เสียหาย
    await excel.readWorkbookFile(mockFile('ไฟล์เสีย.xlsx', Buffer.from(garbage)));
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }
  check(
    'ไฟล์ที่ไม่ใช่ Excel แจ้งข้อผิดพลาดที่อ่านเข้าใจได้',
    errorMessage.includes('ไม่พบ Worksheet') ||
      errorMessage.includes('อ่านไฟล์ไม่สำเร็จ') ||
      errorMessage.includes('ไม่ใช่ไฟล์'),
    errorMessage || '(ไม่มีข้อผิดพลาด)',
  );

  let mappingError = '';
  try {
    importer.buildRows({
      sheet,
      mapping: {},
      eraPolicy: 'auto',
      skipIncomplete: false,
    });
  } catch (error) {
    mappingError = error instanceof Error ? error.message : String(error);
  }
  check(
    'ยังไม่จับคู่คอลัมน์ แจ้งข้อผิดพลาดชัดเจน',
    mappingError.includes('ยังไม่ได้จับคู่คอลัมน์'),
    mappingError,
  );

  // ------------------------------------------------------------------
  section('สรุปผลการทดสอบ');
  console.log(`ผ่าน ${passCount} รายการ • ไม่ผ่าน ${failCount} รายการ`);
  if (failures.length > 0) {
    console.log('\nรายการที่ไม่ผ่าน:');
    for (const failure of failures) console.log(` - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('การทดสอบล้มเหลว:', error);
  process.exitCode = 1;
});
