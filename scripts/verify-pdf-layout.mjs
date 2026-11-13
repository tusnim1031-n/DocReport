/**
 * ตรวจเลย์เอาต์ไฟล์ PDF รายงานที่พิมพ์ออกมาจริง
 * - จำนวนหน้าจริงตรงกับข้อความ "หน้า X จาก Y" ที่แถบท้ายหรือไม่
 * - ทุกหน้ามีหัวตารางซ้ำหรือไม่ (หน้าแท้ที่เกิดจากการล้นจะไม่มีหัวตาราง)
 * - เลขลำดับ (คอลัมน์แรก) ต่อเนื่อง 1..N ครบทุกแถว ไม่ขาด ไม่ซ้ำ
 * - รายงานช่องว่างล่างหน้าที่มากผิดปกติ
 *
 * ใช้งาน:
 *   node scripts/verify-pdf-layout.mjs <file.pdf> [file2.pdf ...]
 * ต้องติดตั้ง pdfjs-dist (อยู่ใน devDependencies)
 */
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('ใช้งาน: node scripts/verify-pdf-layout.mjs <file.pdf> [...]');
  process.exit(2);
}

const pdfjsPath = resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs');
if (!existsSync(pdfjsPath)) {
  console.error('ไม่พบ pdfjs-dist — ติดตั้งก่อนด้วย: npm install');
  process.exit(2);
}
const pdfjs = await import(pathToFileURL(pdfjsPath).href);

const PT_PER_MM = 72 / 25.4;
const MARGIN_MM = 10;
/**
 * คอลัมน์ "ลำดับ" เริ่มที่ระยะขอบซ้าย 12 มม. กว้าง 11 มม. (1 มม. = 2.8346 pt)
 * ค้นเลขลำดับในช่วง x ถึง 24 มม. — กันเลขรับ (คอลัมน์ถัดไป เริ่มที่ 23 มม.)
 * ซึ่งจัดกึ่งกลางแล้วอยู่ที่ ~25 มม. ขึ้นไปหลุดเข้ามา
 */
const INDEX_X_MIN = 12 * PT_PER_MM - 1;
const INDEX_X_MAX = 22 * PT_PER_MM + 2;
/**
 * แถบท้ายหน้า (footer) — เลขหน้า "หน้า X จาก Y" อยู่ชิดขอบล่างกระดาษ
 * ค้นในช่วง y ต่ำกว่าขอบล่าง + ~20 มม. (ต่ำกว่าเนื้อตารางเสมอ ~20.5 มม.)
 */
const FOOTER_LABEL_MAX_Y = MARGIN_MM * PT_PER_MM + 27;

let failed = 0;

for (const file of files) {
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pages = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => typeof item.str === 'string' && item.str.trim() !== '')
      .map((item) => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
      }));

    const lines = new Map();
    for (const item of items) {
      const key = Math.round(item.y * 2) / 2;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push(item);
    }
    const rows = [...lines.entries()]
      .map(([y, cells]) => ({
        y,
        text: cells
          .sort((a, b) => a.x - b.x)
          .map((cell) => cell.text)
          .join(''),
      }))
      .sort((a, b) => b.y - a.y);

    // เลขหน้า "หน้า X จาก Y" อยู่ที่แถบท้ายทุกหน้า (footer ด้านล่าง)
    const footerText = items
      .filter((item) => item.y < FOOTER_LABEL_MAX_Y)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item) => item.text)
      .join('')
      .replace(/\s+/g, '');
    /*
     * ฟอนต์ TH Sarabun New มี glyph ซ้ำสำหรับ encoding ภาษาไทยแบบเก่า (PUA)
     * ตอน Chrome สร้าง PDF วรรณยุกต์/สระบางตัวจึงฝังเป็นรหัส PUA (เช่น U+F70B = ้)
     * แทน Unicode มาตรฐาน หรือหายไปจาก text layer ทั้งที่ "สายตา" แสดงถูกต้อง —
     * จึงยอมรับวรรณยุกต์ได้ทุกรูปแบบ (มาตรฐาน / PUA / ไม่มี) ตอนจับคู่
     */
    const THAI_MARK = '[\u0E47-\u0E4D\uF700-\uF8FF]?';
    const labelMatch = footerText.match(new RegExp(`หน${THAI_MARK}า(\\d+)จ${THAI_MARK}าก(\\d+)`));

    // เลขลำดับ: ข้อความตัวเลขล้วนในช่วง x ของคอลัมน์แรก
    const indices = items
      .filter((item) => item.x >= INDEX_X_MIN && item.x <= INDEX_X_MAX && /^\d+$/.test(item.text))
      .sort((a, b) => b.y - a.y)
      .map((item) => Number(item.text));

    const minY = Math.min(...items.map((item) => item.y));
    const bottomSpaceMm = (minY - MARGIN_MM * PT_PER_MM) / PT_PER_MM;

    pages.push({
      page: p,
      widthPt: Number(viewport.width.toFixed(1)),
      heightPt: Number(viewport.height.toFixed(1)),
      hasHeader: Boolean(labelMatch),
      label: labelMatch ? { current: Number(labelMatch[1]), total: Number(labelMatch[2]) } : null,
      hasTableHead: rows.some((row) => row.text.includes('เลขรับ')),
      indices,
      bottomSpaceMm: Number(bottomSpaceMm.toFixed(1)),
    });
  }

  const problems = [];
  const missingHeader = pages.filter((page) => !page.hasHeader).map((page) => page.page);
  if (missingHeader.length > 0) {
    problems.push(`ไม่พบเลขหน้าในหน้า ${missingHeader.join(', ')}`);
  }

  const wrongTotal = pages.filter((page) => page.label && page.label.total !== doc.numPages);
  if (wrongTotal.length > 0) {
    problems.push(
      `ข้อความ "หน้า X จาก Y" ไม่ตรงกับจำนวนหน้าจริง (PDF ${doc.numPages} หน้า แต่ระบุ Y=${
        wrongTotal[0].label.total
      })`,
    );
  }

  const wrongNumber = pages.filter((page) => page.label && page.label.current !== page.page);
  if (wrongNumber.length > 0) {
    problems.push(
      `เลขหน้าไม่เรียงตามลำดับ: ${wrongNumber
        .map((page) => `${page.page}→${page.label.current}`)
        .join(', ')}`,
    );
  }

  const labels = pages.map((page) => (page.label ? page.label.current : null));
  const duplicated = labels.filter((value, index) => value !== null && labels.indexOf(value) !== index);
  if (duplicated.length > 0) {
    problems.push(`เลขหน้าซ้ำ: ${[...new Set(duplicated)].join(', ')}`);
  }

  const allIndices = pages.flatMap((page) => page.indices);
  const expected = Array.from({ length: allIndices.length }, (_, index) => index + 1);
  const indicesContinuous = allIndices.every((value, index) => value === expected[index]);
  if (!indicesContinuous) {
    const firstBreak = allIndices.findIndex((value, index) => value !== expected[index]);
    problems.push(
      `เลขลำดับไม่ต่อเนื่องที่ตำแหน่ง ${firstBreak + 1} (พบ ${allIndices[firstBreak]}, ควรเป็น ${
        firstBreak + 1
      })`,
    );
  }

  const emptyPages = pages.filter((page) => page.indices.length === 0);
  if (emptyPages.length > 0) {
    problems.push(`หน้าไม่มีข้อมูล: ${emptyPages.map((page) => page.page).join(', ')}`);
  }

  const hugeGaps = pages
    .filter((page) => page.page !== doc.numPages && page.bottomSpaceMm > 100)
    .map((page) => `หน้า ${page.page} (${page.bottomSpaceMm} มม.)`);
  if (hugeGaps.length > 0) {
    problems.push(`ช่องว่างล่างหน้ามากผิดปกติ: ${hugeGaps.join(', ')}`);
  }

  const status = problems.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\n${status}  ${file}`);
  console.log(`      ${doc.numPages} หน้า | ${allIndices.length} แถว | เลขหน้าครบ ${
    pages.filter((page) => page.hasHeader).length
  }/${doc.numPages} | หัวตารางครบ ${pages.filter((page) => page.hasTableHead).length}/${doc.numPages}`);
  console.log(
    `      ช่องว่างล่างหน้าสูงสุด (ไม่รวมหน้าสุดท้าย) ${Math.max(
      ...pages.slice(0, -1).map((page) => page.bottomSpaceMm),
    ).toFixed(1)} มม.`,
  );
  for (const page of pages) {
    console.log(
      `      หน้า ${String(page.page).padStart(2)} | ${
        page.label ? `หน้า ${page.label.current} จาก ${page.label.total}` : 'ไม่พบเลขหน้า'
      } | ${page.indices.length} แถว | ล่างว่าง ${page.bottomSpaceMm} มม.`,
    );
  }
  for (const problem of problems) {
    console.log(`      ✗ ${problem}`);
  }

  if (problems.length > 0) failed += 1;
}

console.log(failed === 0 ? '\nผลรวม: ผ่านทั้งหมด' : `\nผลรวม: ไม่ผ่าน ${failed} ไฟล์`);
process.exitCode = failed === 0 ? 0 : 1;
