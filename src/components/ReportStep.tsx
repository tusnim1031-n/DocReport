/**
 * หน้าสร้างรายงาน — ตั้งค่า ดูตัวอย่าง และพิมพ์ A4 แนวตั้ง / บันทึกเป็น PDF
 * - คอลัมน์ 7 ช่องตามลำดับบังคับ
 * - แสดงเฉพาะวันที่ ไม่แสดงเวลา และไม่มีเครื่องหมายเตือน ⚠
 * - องค์ประกอบของเว็บไซต์ (Sidebar/ปุ่ม/Dashboard) ถูกซ่อนด้วย .no-print
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Alert, Badge, EmptyState } from './ui';
import {
  IconDownload,
  IconFileText,
  IconPrinter,
} from './icons';
import { formatDateRange, formatBEDate } from '../lib/dates';
import { exportRowsToExcel } from '../lib/export';
import { REPORT_COLUMNS, reportColumnValue } from '../lib/types';
import type { RegisterRow } from '../lib/types';
import {
  computeJustifiedExtraPadPx,
  computeRowCapacityPx,
  paginateRowsByHeight,
  REPORT_INDEX_WIDTH_MM,
  sumHeights,
} from '../lib/reportLayout';
import {
  applyFilters,
  computeStatistics,
  DEFAULT_FILTERS,
  monthOptions,
  type FilterState,
} from '../lib/stats';

type ReportStepProps = {
  rows: RegisterRow[];
  sourceFileLabel: string | null;
  onGoToRegister: () => void;
  onGoToUpload: () => void;
};

type MeasuredLayout = {
  /** ลายนิ้วมือของชุดข้อมูลที่วัด — กันการใช้ความสูงเก่ากับข้อมูลชุดใหม่ */
  signature: string;
  rowHeights: number[];
  capacityPx: number;
  /** ความสูงที่ต้องกันไว้ท้ายหน้าสุดท้าย (เช่น ช่องลงนาม) */
  trailingHeight: number;
};

function sameHeights(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i] - b[i]) > 0.5) return false;
  }
  return true;
}

export function ReportStep({ rows, sourceFileLabel, onGoToRegister, onGoToUpload }: ReportStepProps) {
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    sortKey: 'receiveNo',
    sortDirection: 'asc',
  });
  const [orgName, setOrgName] = useState('');
  const [reportTitle, setReportTitle] = useState('ทะเบียนหนังสือรับ');
  const [signerName, setSignerName] = useState('');
  const [signerPosition, setSignerPosition] = useState('');
  const [includeSignature, setIncludeSignature] = useState(false);

  const statistics = useMemo(() => computeStatistics(rows), [rows]);
  const months = useMemo(() => monthOptions(rows), [rows]);
  const reportRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const rangeLabel = useMemo(() => {
    if (filters.dateFrom && filters.dateTo) {
      return `ระหว่างวันที่ ${formatThaiDateInput(filters.dateFrom)} ถึง ${formatThaiDateInput(filters.dateTo)}`;
    }
    if (filters.dateFrom) return `ตั้งแต่วันที่ ${formatThaiDateInput(filters.dateFrom)} เป็นต้นไป`;
    if (filters.dateTo) return `ถึงวันที่ ${formatThaiDateInput(filters.dateTo)}`;
    if (filters.month !== 'all') {
      const option = months.find((item) => item.value === filters.month);
      return `ประจำเดือน${option?.label ?? filters.month}`;
    }
    if (statistics.minDocumentDateISO && statistics.maxDocumentDateISO) {
      return `ข้อมูลช่วงวันที่ ${formatDateRange(statistics.minDocumentDateISO, statistics.maxDocumentDateISO)}`;
    }
    return 'ข้อมูลทั้งหมดที่นำเข้า';
  }, [filters, months, statistics]);

  // --- การแบ่งหน้าจากความสูงจริงของเนื้อหา (ไม่ใช้จำนวนแถวตายตัว) ---
  const measureRef = useRef<HTMLDivElement>(null);
  const measureHeaderRef = useRef<HTMLDivElement>(null);
  const measureTableRef = useRef<HTMLTableElement>(null);
  const measureFooterRef = useRef<HTMLDivElement>(null);
  const measureSignRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<MeasuredLayout | null>(null);

  const rowsSignature = useMemo(
    () =>
      reportRows
        .map((row) =>
          [
            row.id,
            row.receiveNo,
            row.documentNo,
            row.documentDateText,
            row.from,
            row.subject,
            row.receivedDateText,
          ].join('\u0001'),
        )
        .join('\u0002'),
    [reportRows],
  );

  const printedAtLabel = useMemo(
    () =>
      new Date().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  const signatureLabel = includeSignature ? `${signerName}|${signerPosition}` : '';

  useLayoutEffect(() => {
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const header = measureHeaderRef.current;
      const table = measureTableRef.current;
      const footer = measureFooterRef.current;
      if (!header || !table) return;

      const headerStyle = window.getComputedStyle(header);
      const headerHeight =
        header.getBoundingClientRect().height + (Number.parseFloat(headerStyle.marginBottom) || 0);
      const tableHeadHeight = table.tHead ? table.tHead.getBoundingClientRect().height : 0;
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      // ต้องรวม margin-top ของช่องลงนามด้วย (12 มม.) ไม่ใช่แค่ความสูงกล่อง
      const signNode = measureSignRef.current;
      const trailingHeight = signNode
        ? signNode.getBoundingClientRect().height +
          (Number.parseFloat(window.getComputedStyle(signNode).marginTop) || 0)
        : 0;

      const body = table.tBodies[0];
      const rowHeights = body
        ? Array.from(body.rows).map((row) => row.getBoundingClientRect().height)
        : [];

      const capacityPx = computeRowCapacityPx({
        headerHeight,
        tableHeadHeight,
        footerHeight,
      });

      setLayout((previous) => {
        if (
          previous &&
          previous.signature === rowsSignature &&
          Math.abs(previous.capacityPx - capacityPx) <= 0.5 &&
          Math.abs(previous.trailingHeight - trailingHeight) <= 0.5 &&
          sameHeights(previous.rowHeights, rowHeights)
        ) {
          return previous;
        }
        return { signature: rowsSignature, rowHeights, capacityPx, trailingHeight };
      });
    };

    measure();

    // ฟอนต์ Sarabun โหลดแบบ async — วัดซ้ำเมื่อโหลดเสร็จเพื่อไม่ให้ความสูงคลาดเคลื่อน
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      void fonts.ready.then(() => measure()).catch(() => undefined);
    }

    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [rowsSignature, orgName, reportTitle, rangeLabel, includeSignature, signatureLabel, printedAtLabel]);

  /** ใช้เฉพาะผลวัดที่ตรงกับข้อมูลชุดปัจจุบัน — กันหน้าเพี้ยนระหว่างที่ยังวัดไม่เสร็จ */
  const activeLayout = layout && layout.signature === rowsSignature ? layout : null;

  const slices = useMemo(() => {
    if (!activeLayout || reportRows.length === 0) return [];
    return paginateRowsByHeight(activeLayout.rowHeights, activeLayout.capacityPx, {
      trailingHeight: activeLayout.trailingHeight,
    });
  }, [activeLayout, reportRows]);

  const pages = useMemo(
    () => slices.map((slice) => reportRows.slice(slice.start, slice.end)),
    [slices, reportRows],
  );

  /**
   * ระยะ padding เพิ่มของแถวในแต่ละหน้า — ยืดตารางให้เต็มพื้นที่พิมพ์
   * เพื่อไม่ให้เหลือช่องว่างท้ายหน้า (หน้าสุดท้ายปล่อยตามเนื้อหาจริง)
   */
  const pageExtraPadPx = useMemo(() => {
    if (!activeLayout) return [] as number[];
    return slices.map((slice, index) =>
      computeJustifiedExtraPadPx({
        capacityPx: activeLayout.capacityPx,
        usedPx: sumHeights(activeLayout.rowHeights, slice.start, slice.end),
        rowCount: slice.end - slice.start,
        isLastPage: index === slices.length - 1,
      }),
    );
  }, [activeLayout, slices]);

  /** ลำดับเริ่มต้นของแต่ละหน้า ใช้คำนวณเลขลำดับต่อเนื่อง (1..N) ข้ามหน้า */
  const pageStarts = useMemo(() => {
    const starts: number[] = [];
    let running = 0;
    for (const page of pages) {
      starts.push(running);
      running += page.length;
    }
    return starts;
  }, [pages]);

  if (rows.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={<IconFileText size={30} />}
          title="ยังไม่มีข้อมูลสำหรับออกรายงาน"
          description={
            <>
              กรุณานำเข้าข้อมูลทะเบียนหนังสือก่อน จึงจะสร้างรายงานและพิมพ์เป็น PDF ได้
              <div className="btn-row center" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-primary" onClick={onGoToUpload}>
                  นำเข้าไฟล์ Excel
                </button>
              </div>
            </>
          }
        />
      </section>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    const today = new Date();
    const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(
      today.getDate(),
    ).padStart(2, '0')}`;
    exportRowsToExcel(reportRows, `ทะเบียนหนังสือ_${stamp}.xlsx`);
  };

  const clearReportFilters = () => {
    setFilters({ ...DEFAULT_FILTERS, sortKey: 'receiveNo', sortDirection: 'asc' });
  };

  return (
    <div className="stack">
      <section className="card no-print">
        <div className="card-head">
          <div>
            <h2 className="card-title">ตั้งค่ารายงาน</h2>
            <p className="card-hint tight">
              เลือกช่วงข้อมูลที่จะออกรายงาน แล้วกด “พิมพ์รายงาน / บันทึกเป็น PDF”
              เบราว์เซอร์จะเปิดหน้าต่างพิมพ์ ซึ่งเลือกเครื่องพิมพ์ปลายทางเป็น “Save as PDF” ได้
            </p>
          </div>
          <Badge variant="navy">
            {reportRows.length.toLocaleString('th-TH')} รายการ • {pages.length} หน้า
          </Badge>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="report-month">เดือนที่ออกรายงาน</label>
            <select
              id="report-month"
              value={filters.month}
              onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
            >
              <option value="all">ทุกเดือน</option>
              {months.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-from">ตั้งแต่วันที่</label>
            <input
              id="report-from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="report-to">ถึงวันที่</label>
            <input
              id="report-to"
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="report-date-field">ใช้คอลัมน์วันที่</label>
            <select
              id="report-date-field"
              value={filters.dateField}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  dateField: event.target.value as FilterState['dateField'],
                }))
              }
            >
              <option value="documentDate">ลงวันที่</option>
              <option value="receivedDate">วันที่รับ</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-sort">เรียงลำดับตาม</label>
            <select
              id="report-sort"
              value={filters.sortKey}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sortKey: event.target.value as FilterState['sortKey'],
                }))
              }
            >
              <option value="receiveNo">เลขรับ</option>
              <option value="documentDate">ลงวันที่</option>
              <option value="receivedDate">วันที่รับ</option>
              <option value="documentNo">ที่ (เลขที่หนังสือ)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-search">ค้นหาในรายงาน</label>
            <input
              id="report-search"
              type="search"
              placeholder="เช่น เลขรับ, หน่วยงาน, เรื่อง"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="org-name">ชื่อหน่วยงาน (หัวรายงาน)</label>
            <input
              id="org-name"
              type="text"
              placeholder="เช่น สำนักงานปลัดกระทรวง ..."
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="report-title-input">ชื่อรายงาน</label>
            <input
              id="report-title-input"
              type="text"
              value={reportTitle}
              onChange={(event) => setReportTitle(event.target.value)}
            />
          </div>
        </div>

        <div className="checkbox-row" style={{ marginTop: 14 }}>
          <input
            id="include-signature"
            type="checkbox"
            checked={includeSignature}
            onChange={(event) => setIncludeSignature(event.target.checked)}
          />
          <label htmlFor="include-signature">แสดงช่องลงนามท้ายรายงาน</label>
        </div>

        {includeSignature ? (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="signer-name">ชื่อผู้ลงนาม</label>
              <input
                id="signer-name"
                type="text"
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="signer-position">ตำแหน่ง</label>
              <input
                id="signer-position"
                type="text"
                value={signerPosition}
                onChange={(event) => setSignerPosition(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearReportFilters}>
            ล้างเงื่อนไขรายงาน
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onGoToRegister}>
            กลับไปหน้าทะเบียนหนังสือ
          </button>
          {sourceFileLabel ? <Badge variant="neutral">ไฟล์ {sourceFileLabel}</Badge> : null}
        </div>
      </section>

      <div className="report-toolbar no-print">
        <button type="button" className="btn btn-primary" onClick={handlePrint} disabled={reportRows.length === 0}>
          <IconPrinter size={16} />
          พิมพ์รายงาน / บันทึกเป็น PDF
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={reportRows.length === 0}>
          <IconDownload size={16} />
          ส่งออกข้อมูลเป็น Excel
        </button>
        <span className="text-muted report-toolbar-hint">
          กำหนดกระดาษ A4 แนวตั้ง มาตราส่วน 100% ระยะขอบ 10–12 มม.
          (อย่าเลือก “Fit to page” เพราะจะทำให้จำนวนหน้าไม่ตรง — รายงานเป็นขาวดำล้วน
          จึงพิมพ์ได้ถูกต้องแม้ปิด “Background graphics”)
        </span>
      </div>

      {reportRows.length === 0 ? (
        <section className="card no-print">
          <Alert variant="warning" title="ไม่พบรายการตามเงื่อนไขที่เลือก">
            <p>กรุณาปรับเดือนหรือช่วงวันที่ให้ตรงกับข้อมูล หรือกดปุ่ม “ล้างเงื่อนไขรายงาน”</p>
          </Alert>
        </section>
      ) : null}

      {statistics.uncertainDateRows > 0 ? (
        <section className="card no-print">
          <Alert variant="info" title="มีรายการวันที่ที่ควรตรวจสอบ">
            <p>
              พบ {statistics.uncertainDateRows.toLocaleString('th-TH')} รายการที่ระบบไม่แน่ใจว่าเป็นปี พ.ศ. หรือ
              ค.ศ. หรืออ่านวันที่ไม่สำเร็จ — รายการเหล่านี้ยังแสดงวันที่ตามที่พบในไฟล์
              กรุณาตรวจสอบเทียบกับต้นฉบับก่อนนำไปใช้งาน
            </p>
          </Alert>
        </section>
      ) : null}

      {/*
        พื้นที่วัดความสูงจริง (ไม่แสดงบนจอและไม่พิมพ์)
        ใช้ตาราง/สไตล์ชุดเดียวกับรายงาน เพื่อให้ความสูงของแถวที่วัดได้
        ตรงกับตอนพิมพ์จริง แล้วนำไปคำนวณการแบ่งหน้า
      */}
      <div className="report-measure" aria-hidden="true" ref={measureRef}>
        <div className="report-header" ref={measureHeaderRef}>
          {orgName ? <div className="report-org">{orgName}</div> : null}
          <h1 className="report-title">{reportTitle || 'ทะเบียนหนังสือรับ'}</h1>
          <div className="report-range">{rangeLabel}</div>
          <div className="report-meta">
            <span>จำนวนรายการในรายงาน: {reportRows.length.toLocaleString('th-TH')} รายการ</span>
            <span>หน้า 88 จาก 88</span>
          </div>
        </div>

        <table className="report-table" ref={measureTableRef}>
          <colgroup>
            <col style={{ width: `${REPORT_INDEX_WIDTH_MM}mm` }} />
            {REPORT_COLUMNS.map((column) => (
              <col key={column.key} style={{ width: `${column.widthMm}mm` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>ลำดับ</th>
              {REPORT_COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reportRows.map((row, index) => (
              <tr key={row.id}>
                <td className="col-center">{index + 1}</td>
                {REPORT_COLUMNS.map((column) => {
                  const center =
                    column.key === 'receiveNo' ||
                    column.key === 'documentDate' ||
                    column.key === 'receivedDate';
                  return (
                    <td key={column.key} className={center ? 'col-center' : ''}>
                      {reportColumnValue(row, column.key)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {includeSignature ? (
          <div className="report-footer-note" ref={measureSignRef} style={{ textAlign: 'right', marginTop: '12mm' }}>
            <div style={{ display: 'inline-block', textAlign: 'center', minWidth: '70mm' }}>
              <div>ลงชื่อ ....................................................</div>
              <div style={{ marginTop: 4 }}>({signerName || '...........................................'})</div>
              <div>{signerPosition || '...........................................'}</div>
            </div>
          </div>
        ) : null}

        <div className="report-footer-note" ref={measureFooterRef}>
          พิมพ์จากระบบทะเบียนหนังสือ เมื่อ {printedAtLabel}
        </div>
      </div>

      <div className="report-preview-wrap">
        {pages.map((pageRows, pageIndex) => (
          <div className="a4-page" key={`page-${pageIndex}`}>
            <header className="report-header">
              {orgName ? <div className="report-org">{orgName}</div> : null}
              <h1 className="report-title">{reportTitle || 'ทะเบียนหนังสือรับ'}</h1>
              <div className="report-range">{rangeLabel}</div>
              <div className="report-meta">
                <span>จำนวนรายการในรายงาน: {reportRows.length.toLocaleString('th-TH')} รายการ</span>
                <span>
                  หน้า {pageIndex + 1} จาก {pages.length}
                </span>
              </div>
            </header>

            <table
              className="report-table"
              style={{ '--report-row-pad-extra': `${pageExtraPadPx[pageIndex] ?? 0}px` } as CSSProperties}
            >
              <colgroup>
                <col style={{ width: `${REPORT_INDEX_WIDTH_MM}mm` }} />
                {REPORT_COLUMNS.map((column) => (
                  <col key={column.key} style={{ width: `${column.widthMm}mm` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>ลำดับ</th>
                  {REPORT_COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => {
                  const globalIndex = pageStarts[pageIndex] + index + 1;
                  return (
                    <tr key={row.id} className="report-row">
                      <td className="col-center">{globalIndex}</td>
                      {REPORT_COLUMNS.map((column) => {
                        const value = reportColumnValue(row, column.key);
                        const center =
                          column.key === 'receiveNo' ||
                          column.key === 'documentDate' ||
                          column.key === 'receivedDate';
                        return (
                          <td key={column.key} className={center ? 'col-center' : ''}>
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pageIndex === pages.length - 1 && includeSignature ? (
              <div className="report-footer-note" style={{ textAlign: 'right', marginTop: '12mm' }}>
                <div style={{ display: 'inline-block', textAlign: 'center', minWidth: '70mm' }}>
                  <div>ลงชื่อ ....................................................</div>
                  <div style={{ marginTop: 4 }}>({signerName || '...........................................'})</div>
                  <div>{signerPosition || '...........................................'}</div>
                </div>
              </div>
            ) : null}

            <div className="report-footer-note">
              พิมพ์จากระบบทะเบียนหนังสือ เมื่อ {printedAtLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** แสดงวันที่ในรูปแบบไทย (เฉพาะวันที่ ไม่มีเวลา) สำหรับหัวรายงาน */
function formatThaiDateInput(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return formatBEDate(Number(match[1]), Number(match[2]), Number(match[3]));
}
