/**
 * ตรวจสอบการพิมพ์รายงานด้วย Chrome headless (CDP ตรง ๆ ไม่ต้องติดตั้งไลบรารีเพิ่ม)
 * - นำเข้าไฟล์ Excel แต่ละขนาดผ่าน <input type=file> (DOM.setFileInputFiles)
 * - เปิดหน้ารายงาน แล้ววัดความสูงจริงของทุกหน้าเทียบพื้นที่พิมพ์ A4
 * - สั่ง Page.printToPDF แล้วนับจำนวนหน้าของ PDF จริง
 *
 * ใช้งาน: node scripts/verify-print-pdf.mjs [baseUrl] [file.xlsx]
 *   ถ้าไม่ระบุไฟล์ จะสร้างไฟล์ทดสอบขนาด 1/10/20/36/68/100 แถวให้อัตโนมัติ
 * ต้องเปิดเซิร์ฟเวอร์ไว้ก่อน เช่น npx vite preview --port 4199
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import * as XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const baseUrl = process.argv[2] ?? 'http://localhost:4199';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromePath) {
  console.error('ไม่พบ Chrome/Edge สำหรับทดสอบ');
  process.exit(1);
}

/**
 * ถ้ากำหนด FILE=/path/report.xlsx จะนำเข้าไฟล์นั้นแทนการสร้างไฟล์ทดสอบ
 * และใช้จำนวนแถวในไฟล์เป็นจำนวนที่ต้องตรวจ
 */
const FILE = (process.env.FILE ?? process.argv[3] ?? '').trim()
  ? resolve((process.env.FILE ?? process.argv[3]).trim())
  : null;
if (FILE && !existsSync(FILE)) {
  console.error(`ไม่พบไฟล์: ${FILE}`);
  process.exit(1);
}

/** นับแถวข้อมูลในไฟล์ (แถวใต้หัวตารางที่มีข้อมูลอย่างน้อยหนึ่งช่อง) */
function countWorkbookRows(filePath) {
  const book = XLSX.read(readFileSync(filePath), { type: 'buffer' });
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell).trim() === 'เลขรับ'));
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  return rows
    .slice(start)
    .filter((row) => row.some((cell) => String(cell).trim() !== '')).length;
}

const fileRows = FILE ? countWorkbookRows(FILE) : null;
const SIZES = (process.env.SIZES ?? (fileRows ? String(fileRows) : '1,10,20,36,68,100'))
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value >= 0);

/**
 * SCALES=100,90,80,70,60,85 — ทดสอบมาตราส่วนเอกสารหลายค่าต่อหนึ่งขนาดข้อมูล
 * (ถ้าไม่ระบุ จะทดสอบเฉพาะค่าเริ่มต้น 100% ตามเดิม)
 */
const SCALES = (process.env.SCALES ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => /^\d{2,3}$/.test(value) && Number(value) >= 50 && Number(value) <= 100);
/** ตัวเลือกที่มีในกล่องเลือกโดยตรง (นอกนั้นต้องใช้โหมดกำหนดเอง) */
const PRESET_SCALES = new Set(['100', '90', '80', '70', '60']);
const MM_PX = 96 / 25.4;
const CONTENT_LIMIT_PX = (297 - 10 - 10 - 4) * MM_PX; // ลบระยะขอบ + safety 4 มม.

const SUBJECTS = [
  'ขอเชิญประชุม',
  'ขอเชิญประชุมคณะกรรมการพิจารณางบประมาณประจำปี และขอความอนุเคราะห์ส่งผู้แทนเข้าร่วมประชุม',
  'ขอความอนุเคราะห์ข้อมูลสถิติขยะมูลฝอยเพื่อจัดทำรายงานประจำปี และขอความร่วมมือตอบแบบสอบถามความพึงพอใจการให้บริการภาครัฐ พร้อมทั้งแจ้งกำหนดการประชุมชี้แจงแนวทางการจัดทำคำขอตั้งงบประมาณรายจ่ายประจำปีงบประมาณ พ.ศ. 2569',
];
const SUBJECTS_LONG = process.env.REALISTIC
  ? SUBJECTS
  : [...SUBJECTS, `${SUBJECTS[2]} ${SUBJECTS[2]}`];

function makeWorkbook(count) {
  const rows = [['เลขรับ', 'ที่', 'ลงวันที่', 'จาก', 'เรื่อง', 'วันที่รับ', 'หมายเหตุ']];
  for (let i = 0; i < count; i += 1) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String((i % 12) + 1).padStart(2, '0');
    rows.push([
      String(1001 + i),
      `ศธ ${101 + (i % 90)}/2569`,
      i % 4 === 0 ? `${day}/${month}/2026` : `${day}/${month}/2569`,
      i % 9 === 0
        ? 'สำนักงานปลัดกระทรวงการอุดมศึกษา วิทยาศาสตร์ วิจัยและนวัตกรรม กลุ่มภารกิจด้านบริหารจัดการ'
        : 'กรมการปกครอง',
      SUBJECTS_LONG[i % SUBJECTS_LONG.length],
      `${day}/${month}/2569`,
      '',
    ]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'ทะเบียน');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

/** นับหน้าของ PDF โดยอ่าน /Type /Page (รองรับ object stream ที่บีบอัด) */
function countPdfPages(buffer) {
  const text = buffer.toString('latin1');
  const countIn = (value) => (value.match(/\/Type\s*\/Page[^s]/g) || []).length;

  const direct = countIn(text);
  if (direct > 0) return direct;

  let counted = 0;
  const marker = /stream\r?\n/g;
  let match;
  while ((match = marker.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      counted += countIn(inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      // ข้ามสตรีมที่บีบอัดด้วยวิธีอื่น
    }
  }
  return counted;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function openCdp(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (response.ok) return await response.json();
    } catch {
      // ยังไม่พร้อม
    }
    await sleep(250);
  }
  throw new Error('เชื่อมต่อ Chrome DevTools ไม่ได้');
}

function createSession(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((done, fail) => {
    socket.addEventListener('open', () => done());
    socket.addEventListener('error', () => fail(new Error('WebSocket error')));
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolvePromise, rejectPromise } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectPromise(new Error(`${message.error.message} (${message.error.code})`));
      else resolvePromise(message.result);
    }
  });

  const send = async (method, params = {}) => {
    await ready;
    const id = nextId++;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      pending.set(id, { resolvePromise, rejectPromise });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return promise;
  };

  return { send, close: () => socket.close(), ready };
}

async function evaluate(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'evaluate error');
  }
  return result.result.value;
}

async function waitFor(session, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evaluate(session, expression);
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`หมดเวลา: ${expression}`);
}

const metricsScript = `(() => {
  const MM = 96 / 25.4;
  const limit = (297 - 10 - 10 - 4) * MM;
  const pages = Array.from(document.querySelectorAll('.a4-page'));
  const pageInfo = pages.map((page) => {
    const header = page.querySelector('.report-header');
    const table = page.querySelector('.report-table');
    const headerHeight =
      header.getBoundingClientRect().height +
      (parseFloat(getComputedStyle(header).marginBottom) || 0);
    const tableHeight = table.getBoundingClientRect().height;
    const footerHeight = Array.from(page.querySelectorAll('.report-footer-note')).reduce(
      (sum, node) => {
        const style = getComputedStyle(node);
        const margin = parseFloat(style.marginTop) || 0;
        return sum + node.getBoundingClientRect().height + margin;
      },
      0,
    );
    const cells = Array.from(table.querySelectorAll('tbody tr')).map((row) => row.getBoundingClientRect().height);
    return {
      rows: table.querySelectorAll('tbody tr').length,
      headerHeight,
      tableHeight,
      footerHeight,
      content: headerHeight + tableHeight + footerHeight,
      minRow: cells.length ? Math.min(...cells) : 0,
      maxRow: cells.length ? Math.max(...cells) : 0,
      filledWidth: table.getBoundingClientRect().width,
    };
  });
  const table = document.querySelector('.a4-page .report-table');
  const contentWidth = table ? table.getBoundingClientRect().width : 0;
  return {
    pageCount: pages.length,
    pageInfo,
    // ลำดับแถวทั้งรายงาน (ช่อง "ลำดับ") — ใช้ตรวจว่าครบทุกแถว ไม่ซ้ำ ไม่หาย
    seq: pages.flatMap((page) =>
      Array.from(page.querySelectorAll('tbody tr')).map((row) => Number(row.children[0].textContent)),
    ),
    limit,
    contentWidth,
    expectedContentWidth: 186 * MM,
    measureHidden: (() => {
      const node = document.querySelector('.report-measure');
      if (!node) return 'missing';
      const style = getComputedStyle(node);
      return style.visibility === 'hidden' || style.display === 'none' ? 'hidden' : 'visible';
    })(),
    meta: pages[0] ? pages[0].querySelector('.report-meta').innerText : '',
    url: location.href,
  };
})()`;

async function importFile(session, filePath) {
  await waitFor(session, `!!document.querySelector('input[type=file]')`);

  const { root: documentNode } = await session.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await session.send('DOM.querySelector', {
    nodeId: documentNode.nodeId,
    selector: 'input[type=file]',
  });
  if (!nodeId) throw new Error('ไม่พบ input ไฟล์');

  await session.send('DOM.setFileInputFiles', { nodeId, files: [filePath] });

  // ขั้นตอนจับคู่คอลัมน์
  await waitFor(
    session,
    `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) =>
        node.textContent.includes('เดาจับคู่ให้อัตโนมัติ'),
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`,
  );

  await waitFor(
    session,
    `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) =>
        /^นำเข้าข้อมูล/.test(node.textContent.trim()),
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`,
  );

  await waitFor(
    session,
    `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) =>
        node.textContent.includes('ยืนยันการนำเข้าข้อมูล') || node.textContent.includes('ยืนยัน'),
      );
      const dialog = document.querySelector('.modal');
      if (!dialog) return false;
      const confirm = Array.from(dialog.querySelectorAll('button')).find((node) =>
        /ยืนยัน/.test(node.textContent),
      );
      if (!confirm) return false;
      confirm.click();
      return true;
    })()`,
  );

  await waitFor(
    session,
    `(() => {
      const nav = Array.from(document.querySelectorAll('button.nav-item')).find((node) =>
        node.textContent.includes('สร้างรายงาน'),
      );
      if (!nav) return false;
      nav.click();
      return true;
    })()`,
  );

  await waitFor(session, `document.querySelectorAll('.a4-page').length > 0`, 20000);
  // รอให้การวัด/แบ่งหน้าและฟอนต์เสร็จ (วัดซ้ำอย่างน้อย 2 เฟรม)
  await sleep(600);
}

/**
 * เปลี่ยน "ขนาดเอกสาร" ผ่าน UI จริง (กล่องเลือก + ช่องกรอกกำหนดเอง)
 * แล้วรอให้ระบบวัดความสูง/แบ่งหน้าใหม่เสร็จ — ใช้ native value setter + event
 * แบบเดียวกับที่ React ฟัง (onChange ของ select = 'change', ของ input = 'input')
 */
async function setReportScale(session, scale) {
  const preset = PRESET_SCALES.has(scale);
  const selectOk = await evaluate(
    session,
    `(() => {
      const select = document.querySelector('#report-scale-select');
      if (!select) return false;
      const setSelect = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setSelect.call(select, ${JSON.stringify(preset ? scale : 'custom')});
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  if (!selectOk) throw new Error('ไม่พบกล่องเลือกขนาดเอกสาร #report-scale-select');

  if (!preset) {
    // รอ React แสดงช่องกรอกกำหนดเองก่อน (แสดงหลังเลือกโหมด "กำหนดเอง")
    await sleep(300);
    const inputOk = await evaluate(
      session,
      `(() => {
        const input = document.querySelector('#report-scale-custom');
        if (!input) return false;
        const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setInput.call(input, ${JSON.stringify(scale)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
    );
    if (!inputOk) throw new Error('ไม่พบช่องกรอกกำหนดเอง #report-scale-custom');
  }

  // รอให้ useLayoutEffect วัดความสูงใหม่และ React จัดหน้าเสร็จ
  await sleep(700);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'docreport-cdp-'));
  const tempRoot = mkdtempSync(join(tmpdir(), 'docreport-pdf-'));
  const port = 9333 + Math.floor(Math.random() * 200);
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let failed = 0;
  const results = [];

  try {
    const target = await openCdp(port);
    const session = createSession(target.webSocketDebuggerUrl);
    await session.ready;
    await session.send('Page.enable');
    await session.send('Runtime.enable');

    for (const size of SIZES) {
      const expectedRows = fileRows ?? size;
      const filePath = FILE ?? join(tempRoot, `pagination-${size}.xlsx`);
      if (!FILE) writeFileSync(filePath, makeWorkbook(size));

      await session.send('Page.navigate', { url: baseUrl });
      await sleep(900);
      await waitFor(session, `document.readyState === 'complete'`);
      await sleep(400);

      await importFile(session, filePath);

      if (process.env.SIGNATURE) {
        await waitFor(
          session,
          `(() => {
            const box = document.querySelector('#include-signature');
            if (!box) return false;
            if (!box.checked) box.click();
            return box.checked;
          })()`,
        );
        await sleep(700);
      }

      /*
       * ค่าเริ่มต้น = 100% (ก่อนปรับ Scale) — ใช้เทียบว่าหลังย่อ Scale แล้ว
       * จำนวนหน้าต้องไม่เพิ่มขึ้น และเมื่อกลับ 100% ต้องได้จำนวนหน้าเท่าเดิม
       */
      const baselinePages = (await evaluate(session, metricsScript)).pageCount;
      const scaleSteps = SCALES.length > 0 ? SCALES : [null];

      // วนตรวจทุก Scale (ไม่ได้ตั้ง SCALES = ตรวจเฉพาะค่าเริ่มต้น 100% เหมือนเดิม)
      for (const scale of scaleSteps) {
        if (scale !== null) {
          await setReportScale(session, scale);
        }

        const metrics = await evaluate(session, metricsScript);

        // --- ตรวจเงื่อนไขการพิมพ์ภายใต้สื่อ "print" จริง ---
        await session.send('Emulation.setEmulatedMedia', { media: 'print' });
        await sleep(250);
        const printChecks = await evaluate(
          session,
          `(() => {
            const pages = Array.from(document.querySelectorAll('.a4-page'));
            const visible = (node) => {
              if (!node) return false;
              const style = getComputedStyle(node);
              return style.display !== 'none' && style.visibility !== 'hidden';
            };
            const dateCells = pages.flatMap((page) =>
              Array.from(page.querySelectorAll('tbody tr')).map((row) => {
                const cells = Array.from(row.children).map((cell) => cell.textContent.trim());
                return { documentDate: cells[3], receivedDate: cells[6], note: cells[7] };
              }),
            );
            const badDates = dateCells.filter(
              (cell) =>
                (cell.documentDate && !/^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(cell.documentDate)) ||
                (cell.receivedDate && !/^\\d{2}\\/\\d{2}\\/\\d{4}$/.test(cell.receivedDate)),
            );
            const years = dateCells
              .flatMap((cell) => [cell.documentDate, cell.receivedDate])
              .filter(Boolean)
              .map((value) => Number(value.slice(-4)));
            return {
              alertCount: document.querySelectorAll('.alert').length,
              visibleAlerts: Array.from(document.querySelectorAll('.alert')).filter(visible).length,
              measureVisible: visible(document.querySelector('.report-measure')),
              bodyText: pages.map((page) => page.innerText).join('\\n'),
              pages: pages.length,
              headersPerPage: pages.filter((page) => page.querySelector('.report-header')).length,
              tableHeadsPerPage: pages.filter((page) => page.querySelector('thead th')).length,
              metaPerPage: pages.map((page) => page.querySelector('.report-meta').innerText.replace(/\\s+/g, ' ')),
              emptyNoteCells: dateCells.filter((cell) => cell.note === '').length,
              totalCells: dateCells.length,
              badDates: badDates.slice(0, 3),
              badYearCount: years.filter((year) => year < 2400 || year > 2700).length,
              summaryVisible: /แทนที่ข้อมูลสำเร็จ|ก่อนนำเข้า|หลังนำเข้า/.test(
                Array.from(document.querySelectorAll('.alert'))
                  .filter(visible)
                  .map((node) => node.innerText)
                  .join(' '),
              ),
              signaturePages: pages
                .map((page, index) => (page.innerText.includes('ลงชื่อ') ? index : -1))
                .filter((index) => index >= 0),
            };
          })()`,
        );
        await session.send('Emulation.setEmulatedMedia', { media: '' });
        await sleep(150);

        const metaOk = printChecks.metaPerPage.every((text, index) =>
          text.includes(`หน้า ${index + 1} จาก ${printChecks.pages}`),
        );
        const signatureOk = process.env.SIGNATURE
          ? printChecks.signaturePages.length === 1 &&
            printChecks.signaturePages[0] === printChecks.pages - 1
          : printChecks.signaturePages.length === 0;
        const printOk =
          printChecks.visibleAlerts === 0 &&
          !printChecks.measureVisible &&
          !printChecks.summaryVisible &&
          !/⚠/.test(printChecks.bodyText) &&
          !/\\d{1,2}:\\d{2}/.test(printChecks.bodyText) &&
          printChecks.headersPerPage === printChecks.pages &&
          printChecks.tableHeadsPerPage === printChecks.pages &&
          metaOk &&
          signatureOk &&
          printChecks.emptyNoteCells === printChecks.totalCells &&
          printChecks.badDates.length === 0 &&
          printChecks.badYearCount === 0;
        if (!printOk) failed += 1;

        const overflowPages = metrics.pageInfo.filter((page) => page.content > metrics.limit + 0.5);
        const emptyPages = metrics.pageInfo.filter((page) => page.rows === 0);
        const totalRows = metrics.pageInfo.reduce((sum, page) => sum + page.rows, 0);
        const underFilled = metrics.pageInfo
          .slice(0, -1)
          .filter((page) => page.content < metrics.limit * 0.6);

        const pdf = await session.send('Page.printToPDF', {
          printBackground: true,
          preferCSSPageSize: true,
          marginTop: 0,
          marginBottom: 0,
          marginLeft: 0,
          marginRight: 0,
        });
        const pdfBuffer = Buffer.from(pdf.data, 'base64');
        const pdfPath = join(
          tempRoot,
          scale === null ? `report-${size}.pdf` : `report-${size}@${scale}.pdf`,
        );
        writeFileSync(pdfPath, pdfBuffer);
        const pdfPages = countPdfPages(pdfBuffer);

        const rowCounts = metrics.pageInfo.map((page) => page.rows);
        // ลำดับ 1..N ต่อเนื่องทั้งรายงาน — ไม่มีรายการซ้ำ/หายจากการแบ่งหน้า
        const seqOk =
          metrics.seq.length === expectedRows &&
          metrics.seq.every((value, index) => value === index + 1);
        // Scale ที่ย่อลงจริง (≤80% สำหรับข้อมูล ≥36 แถว) ต้องทำให้จำนวนหน้าน้อยกว่าตอน 100%
        const strictTrend = scale !== null && Number(scale) <= 80 && expectedRows >= 36;
        const pageTrendOk =
          scale === null ||
          (strictTrend ? metrics.pageCount < baselinePages : metrics.pageCount <= baselinePages);
        const ok =
          totalRows === expectedRows &&
          overflowPages.length === 0 &&
          emptyPages.length === 0 &&
          pdfPages === metrics.pageCount &&
          seqOk &&
          pageTrendOk &&
          printOk;

        if (!ok) failed += 1;

        results.push({
          size: expectedRows,
          scale,
          pages: metrics.pageCount,
          pdfPages,
          totalRows,
          rowCounts,
          overflow: overflowPages.length,
          emptyPages: emptyPages.length,
          underFilled: underFilled.length,
          maxContentMm: (Math.max(...metrics.pageInfo.map((page) => page.content)) / MM_PX).toFixed(1),
          limitMm: (metrics.limit / MM_PX).toFixed(1),
          printOk,
          printChecks,
          ok,
          pdfPath,
        });

        const scaleLabel = scale === null ? '100%' : `${scale}%`;
        console.log(
          `n=${String(expectedRows).padStart(3)} | scale ${scaleLabel} | UI ${String(metrics.pageCount).padStart(2)} หน้า | PDF ${String(
            pdfPages,
          ).padStart(2)} หน้า | แถว ${String(totalRows).padStart(3)}/${String(expectedRows).padEnd(3)} | สูงสุด ${(
            Math.max(...metrics.pageInfo.map((page) => page.content)) / MM_PX
          ).toFixed(1)}/${(metrics.limit / MM_PX).toFixed(0)} มม. | ล้น ${overflowPages.length} | หน้าว่าง ${
            emptyPages.length
          } | ${ok ? 'PASS' : 'FAIL'}`,
        );
        console.log(`        แถวต่อหน้า: ${rowCounts.join(', ')}`);
        console.log(
          `        ตรวจการพิมพ์: ซ่อน alert ${printChecks.visibleAlerts === 0 ? 'PASS' : 'FAIL'} | ซ่อนตัววัด ${
            printChecks.measureVisible ? 'FAIL' : 'PASS'
          } | หัวตารางซ้ำ ${printChecks.tableHeadsPerPage}/${printChecks.pages} | เลขหน้า ${
            metaOk ? 'PASS' : 'FAIL'
          } | หมายเหตุว่าง ${printChecks.emptyNoteCells}/${printChecks.totalCells} | วันที่ ${
            printChecks.badDates.length === 0 && printChecks.badYearCount === 0 ? 'PASS' : 'FAIL'
          }`,
        );
      } // end for (const scale ...)

      // ทดสอบการคืนค่า: หลังลองทุก Scale ต้องกลับมาเป็น 100% แล้วได้จำนวนหน้าเท่าเดิม
      if (SCALES.length > 0) {
        await setReportScale(session, '100');
        const resetMetrics = await evaluate(session, metricsScript);
        const resetOk = resetMetrics.pageCount === baselinePages;
        if (!resetOk) failed += 1;
        console.log(
          `        คืน 100%: ${baselinePages} → ${resetMetrics.pageCount} หน้า | ${resetOk ? 'PASS' : 'FAIL'}`,
        );
      }
    }

    // ตรวจ CSS: ความกว้างตารางต้องเท่ากับ 186 มม. และตัววัดต้องถูกซ่อน
    const lastMetrics = await evaluate(session, metricsScript);
    const widthOk = Math.abs(lastMetrics.contentWidth - lastMetrics.expectedContentWidth) < 1.5;
    const measuredHidden = lastMetrics.measureHidden !== 'visible';
    if (!widthOk || !measuredHidden) failed += 1;
    console.log(
      `ความกว้างตาราง ${lastMetrics.contentWidth.toFixed(1)}px (คาดหวัง ${lastMetrics.expectedContentWidth.toFixed(
        1,
      )}px) → ${widthOk ? 'PASS' : 'FAIL'} | ตัววัดซ่อน: ${measuredHidden ? 'PASS' : 'FAIL'}`,
    );
    console.log(`ตัวอย่าง PDF: ${results[results.length - 1].pdfPath}`);

    session.close();
  } finally {
    chrome.kill();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ไม่เป็นไร
    }
  }

  console.log(failed === 0 ? '\nผลรวม: ผ่านทั้งหมด' : `\nผลรวม: ไม่ผ่าน ${failed} รายการ`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
