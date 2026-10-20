/**
 * หน้าสร้างรายงาน — ตั้งค่า ดูตัวอย่าง และพิมพ์ A4 แนวตั้ง / บันทึกเป็น PDF
 * - คอลัมน์ 7 ช่องตามลำดับบังคับ
 * - แสดงเฉพาะวันที่ ไม่แสดงเวลา และไม่มีเครื่องหมายเตือน ⚠
 * - องค์ประกอบของเว็บไซต์ (Sidebar/ปุ่ม/Dashboard) ถูกซ่อนด้วย .no-print
 */
import { useMemo, useState } from 'react';
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

const ROWS_PER_PRINT_PAGE = 22;

/** ความกว้างคอลัมน์ "ลำดับ" ของรายงาน (มม.) — รวมกับ 7 คอลัมน์แล้วต้องเท่ากับพื้นที่พิมพ์ A4 */
const INDEX_COLUMN_WIDTH_MM = 10;

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

  const pages = useMemo(() => {
    const chunks: RegisterRow[][] = [];
    if (reportRows.length === 0) return chunks;
    for (let i = 0; i < reportRows.length; i += ROWS_PER_PRINT_PAGE) {
      chunks.push(reportRows.slice(i, i + ROWS_PER_PRINT_PAGE));
    }
    return chunks;
  }, [reportRows]);

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
          กำหนดกระดาษ A4 แนวตั้ง ระยะขอบ 12–13 มม. และเปิด “Background graphics” เพื่อให้สีหัวตารางติดมาด้วย
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

      <div className="report-preview-wrap">
        {pages.map((pageRows, pageIndex) => (
          <div className="a4-page" key={pageIndex}>
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

            <table className="report-table">
              <colgroup>
                <col style={{ width: `${INDEX_COLUMN_WIDTH_MM}mm` }} />
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
                  const globalIndex = pageIndex * ROWS_PER_PRINT_PAGE + index + 1;
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
              พิมพ์จากระบบทะเบียนหนังสือ เมื่อ{' '}
              {new Date().toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
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
