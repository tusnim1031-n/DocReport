import { useCallback, useMemo, useState } from 'react';
import { Alert } from './components/ui';
import {
  IconBook,
  IconDatabase,
  IconFileText,
  IconGrid,
  IconMenu,
  IconPlus,
  IconPrinter,
  IconShield,
  IconTable,
  IconUpload,
} from './components/icons';
import { OverviewStep } from './components/OverviewStep';
import { AddRecordDialog } from './components/AddRecordDialog';
import { ImportDialog } from './components/ImportDialog';
import { MappingStep } from './components/MappingStep';
import { RegisterStep } from './components/RegisterStep';
import { ReportStep } from './components/ReportStep';
import { UploadStep } from './components/UploadStep';
import type { WorkbookData } from './lib/excel';
import { buildRows, type ColumnMapping, type ImportedResult } from './lib/import';
import { computeStatistics } from './lib/stats';
import type { RegisterRow } from './lib/types';

export type ViewKey = 'overview' | 'register' | 'import' | 'report';
type DataStep = 'upload' | 'mapping';

const APP_VERSION = '1.0.0';

const NAV_ITEMS: Array<{
  key: ViewKey;
  label: string;
  description: string;
  Icon: typeof IconGrid;
}> = [
  {
    key: 'overview',
    label: 'ภาพรวม',
    description: 'สรุปสถิติและรายการล่าสุดจากข้อมูลที่นำเข้า',
    Icon: IconGrid,
  },
  {
    key: 'register',
    label: 'ทะเบียนหนังสือ',
    description: 'ค้นหา กรอง เรียงลำดับ และแบ่งหน้าทะเบียนหนังสือ',
    Icon: IconTable,
  },
  {
    key: 'import',
    label: 'นำเข้าไฟล์',
    description: 'เลือกไฟล์ Excel หรือ CSV เลือกชีต และจับคู่คอลัมน์',
    Icon: IconUpload,
  },
  {
    key: 'report',
    label: 'สร้างรายงาน',
    description: 'กำหนดช่วงข้อมูล ดูตัวอย่าง และพิมพ์เป็น A4 / PDF',
    Icon: IconPrinter,
  },
];

export default function App() {
  const [view, setView] = useState<ViewKey>('import');
  const [dataStep, setDataStep] = useState<DataStep>('upload');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [workbookData, setWorkbookData] = useState<WorkbookData | null>(null);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [eraPolicy, setEraPolicy] = useState<'auto' | 'BE' | 'CE'>('auto');
  const [skipIncomplete, setSkipIncomplete] = useState(false);

  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [sourceFileLabel, setSourceFileLabel] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportedResult | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const [dismissedSummary, setDismissedSummary] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const activeSheet = useMemo(() => {
    if (!workbookData || !activeSheetName) return null;
    return workbookData.workbooks[activeSheetName] ?? null;
  }, [workbookData, activeSheetName]);

  const statistics = useMemo(() => computeStatistics(rows), [rows]);
  const currentNav = NAV_ITEMS.find((item) => item.key === view) ?? NAV_ITEMS[0];

  const goTo = useCallback((next: ViewKey) => {
    setView(next);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleWorkbookLoaded = useCallback((data: WorkbookData) => {
    setWorkbookData(data);
    setActiveSheetName(data.sheetNames[0] ?? '');
    setMapping({});
    setEraPolicy('auto');
    setSkipIncomplete(false);
    setPendingImport(null);
    setDataStep('mapping');
    setView('import');
  }, []);

  const handleSelectSheet = useCallback((sheetName: string) => {
    setActiveSheetName(sheetName);
    setMapping({});
    setPendingImport(null);
  }, []);

  const handleRequestMapping = useCallback(() => {
    if (!activeSheet) return;
    const hasAnyMapping = Object.values(mapping).some((value) => value !== undefined);
    if (!hasAnyMapping) {
      window.alert('กรุณาจับคู่คอลัมน์อย่างน้อย 1 คอลัมน์ก่อนนำเข้าข้อมูล');
      return;
    }
    try {
      const preview = buildRows({
        sheet: activeSheet,
        mapping,
        eraPolicy,
        skipIncomplete,
      });
      setPendingImport(preview);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }, [activeSheet, mapping, eraPolicy, skipIncomplete]);

  const handleConfirmImport = useCallback(
    (result: {
      mode: 'replace' | 'merge';
      skipDuplicates: boolean;
      rows: RegisterRow[];
      addedCount: number;
      skippedDuplicates: number;
    }) => {
      const before = rows.length;
      setRows(result.rows);
      setPendingImport(null);
      setDismissedSummary(false);
      const after = result.rows.length;
      const modeLabel = result.mode === 'replace' ? 'แทนที่ข้อมูล' : 'รวมข้อมูล';
      const fileLabel = workbookData?.fileName ?? activeSheetName;
      setSourceFileLabel((current) => {
        if (result.mode === 'replace') return `${fileLabel} (ชีต ${activeSheetName})`;
        return current ? `${current} + ${fileLabel}` : `${fileLabel} (ชีต ${activeSheetName})`;
      });
      setLastImportSummary(
        `${modeLabel}สำเร็จ: ก่อนนำเข้า ${before.toLocaleString('th-TH')} รายการ • ` +
          `เพิ่ม/ตั้งค่าใหม่ ${(result.mode === 'replace' ? after : result.addedCount).toLocaleString('th-TH')} รายการ • ` +
          `หลังนำเข้า ${after.toLocaleString('th-TH')} รายการ` +
          (result.skippedDuplicates > 0
            ? ` • ข้ามรายการซ้ำ ${result.skippedDuplicates.toLocaleString('th-TH')} รายการ`
            : ''),
      );
      goTo('overview');
    },
    [activeSheetName, goTo, rows.length, workbookData],
  );

  /**
   * ลบรายการตาม id ที่ไม่ซ้ำ (ไม่ใช้เลขแถวบนหน้าจอ)
   * - ทำงานบน state ที่ระบบใช้งานจริง จึงอัปเดตตาราง ภาพรวม รายงาน และการส่งออกทันที
   * - ไม่แตะไฟล์ Excel ต้นฉบับบนเครื่องผู้ใช้
   * - ลบเฉพาะ id ที่ระบุ รายการอื่น (รวมถึงรายการที่มีเลขรับซ้ำกัน) จึงไม่ได้รับผลกระทบ
   */
  const handleDeleteRows = useCallback(
    (ids: string[]) => {
      const target = new Set(ids);
      setRows((current) => current.filter((row) => !target.has(row.id)));
      setDismissedSummary(false);
      setLastImportSummary(
        `ลบข้อมูลสำเร็จ ${ids.length.toLocaleString('th-TH')} รายการ • ` +
          `ขณะนี้มีทั้งหมด ${(rows.length - ids.length).toLocaleString('th-TH')} รายการ`,
      );
    },
    [rows.length],
  );

  const handleClearAllData = useCallback(() => {
    setRows([]);
    setSourceFileLabel(null);
    setLastImportSummary(null);
    goTo('import');
    setDataStep('upload');
  }, [goTo]);

  /**
   * บันทึกรายการที่กรอกด้วยมือ
   * - ต่อท้ายข้อมูลเดิมเสมอ (ไม่ทับข้อมูลที่นำเข้าจาก Excel)
   * - อัปเดตตารางทันทีผ่าน state โดยไม่ต้องรีโหลดหน้าเว็บ
   */
  const handleSaveManualRow = useCallback(
    (row: RegisterRow) => {
      setRows((current) => [...current, row]);
      setAddDialogOpen(false);
      setDismissedSummary(false);
      setLastImportSummary(
        `เพิ่มข้อมูลใหม่สำเร็จ 1 รายการ • ขณะนี้มีทั้งหมด ${(rows.length + 1).toLocaleString('th-TH')} รายการ`,
      );
      goTo('register');
    },
    [goTo, rows.length],
  );

  const handleResetMapping = useCallback(() => {
    setMapping({});
    setPendingImport(null);
  }, []);

  const hasRows = rows.length > 0;

  return (
    <div className={`app-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      {/* ------------------------------- Sidebar ------------------------------- */}
      <aside className="sidebar no-print" aria-label="เมนูหลัก">
        <div className="sidebar-brand">
          <span className="sidebar-logo" aria-hidden="true">
            <IconBook size={22} />
          </span>
          <span className="sidebar-brand-text">
            <span className="sidebar-brand-name">ระบบทะเบียนหนังสือ</span>
            <span className="sidebar-brand-sub">Document Registry</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item${view === item.key ? ' is-active' : ''}`}
              onClick={() => goTo(item.key)}
              aria-current={view === item.key ? 'page' : undefined}
            >
              <item.Icon size={18} />
              <span className="nav-item-label">{item.label}</span>
              {item.key === 'register' && hasRows ? (
                <span className="nav-count">{rows.length.toLocaleString('th-TH')}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-note">
            <IconShield size={15} />
            <span>ประมวลผลในเครื่อง • ไม่ส่งไฟล์ออกภายนอก</span>
          </div>
          <div className="sidebar-version">เวอร์ชัน {APP_VERSION}</div>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-scrim no-print"
          aria-label="ปิดเมนู"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* ------------------------------ Main area ------------------------------ */}
      <div className="main-area">
        <header className="main-header no-print">
          <button
            type="button"
            className="icon-btn header-menu-btn"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label="เปิด/ปิดเมนู"
          >
            <IconMenu size={20} />
          </button>

          <div className="main-header-text">
            <h1 className="page-title">{currentNav.label}</h1>
            <p className="page-subtitle">{currentNav.description}</p>
          </div>

          <div className="main-header-actions">
            {hasRows ? (
              <span className="record-chip" title="จำนวนรายการที่นำเข้าแล้ว">
                <IconDatabase size={16} />
                <strong>{statistics.total.toLocaleString('th-TH')}</strong>
                <span className="record-chip-label">รายการ</span>
              </span>
            ) : (
              <span className="record-chip is-empty">
                <IconDatabase size={16} />
                <span className="record-chip-label">ยังไม่มีข้อมูล</span>
              </span>
            )}
            {hasRows ? (
              <button type="button" className="btn btn-secondary" onClick={() => goTo('report')}>
                <IconPrinter size={16} />
                สร้างรายงาน
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAddDialogOpen(true)}
            >
              <IconPlus size={16} />
              เพิ่มข้อมูล
            </button>
            <button type="button" className="btn btn-primary" onClick={() => goTo('import')}>
              <IconUpload size={16} />
              นำเข้าไฟล์ Excel
            </button>
          </div>
        </header>

        <main className="main-content">
          {lastImportSummary && !dismissedSummary ? (
            <Alert variant="success" onClose={() => setDismissedSummary(true)}>
              <p>{lastImportSummary}</p>
            </Alert>
          ) : null}

          {view === 'import' ? (
            <div className="stack">
              <div className="step-switch" role="tablist" aria-label="ขั้นตอนนำเข้า">
                <button
                  type="button"
                  role="tab"
                  aria-selected={dataStep === 'upload'}
                  className={`step-tab${dataStep === 'upload' ? ' is-active' : ''}`}
                  onClick={() => setDataStep('upload')}
                >
                  <span className="step-index">1</span> เลือกไฟล์
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={dataStep === 'mapping'}
                  className={`step-tab${dataStep === 'mapping' ? ' is-active' : ''}`}
                  onClick={() => setDataStep('mapping')}
                  disabled={!workbookData}
                >
                  <span className="step-index">2</span> เลือกชีตและจับคู่คอลัมน์
                  {hasRows ? <span className="step-badge">{rows.length.toLocaleString('th-TH')}</span> : null}
                </button>
              </div>

              {dataStep === 'upload' ? (
                <UploadStep
                  onLoaded={handleWorkbookLoaded}
                  hasExistingData={hasRows}
                  existingCount={rows.length}
                  currentFileLabel={sourceFileLabel}
                />
              ) : null}

              {dataStep === 'mapping' ? (
                workbookData && activeSheetName ? (
                  <MappingStep
                    data={workbookData}
                    activeSheetName={activeSheetName}
                    onSelectSheet={handleSelectSheet}
                    mapping={mapping}
                    onChangeMapping={setMapping}
                    eraPolicy={eraPolicy}
                    onChangeEraPolicy={setEraPolicy}
                    skipIncomplete={skipIncomplete}
                    onChangeSkipIncomplete={setSkipIncomplete}
                    onConfirm={handleRequestMapping}
                    onReset={handleResetMapping}
                    hasExistingData={hasRows}
                  />
                ) : (
                  <section className="card">
                    <Alert variant="info" title="ยังไม่ได้เลือกไฟล์">
                      <p>กรุณาเลือกไฟล์ Excel หรือ CSV ในขั้นตอน “เลือกไฟล์” ก่อน จึงจะจับคู่คอลัมน์ได้</p>
                      <div className="btn-row" style={{ marginTop: 10 }}>
                        <button type="button" className="btn btn-primary" onClick={() => setDataStep('upload')}>
                          ไปที่ขั้นตอนเลือกไฟล์
                        </button>
                      </div>
                    </Alert>
                  </section>
                )
              ) : null}
            </div>
          ) : null}

          {view === 'overview' ? (
            <OverviewStep
              rows={rows}
              sourceFileLabel={sourceFileLabel}
              onGoToReport={() => goTo('report')}
              onGoToUpload={() => {
                setDataStep('upload');
                goTo('import');
              }}
              onGoToRegister={() => goTo('register')}
            />
          ) : null}

          {view === 'register' ? (
            <RegisterStep
              rows={rows}
              sourceFileLabel={sourceFileLabel}
              onClearAllData={handleClearAllData}
              onGoToReport={() => goTo('report')}
              onAddRecord={() => setAddDialogOpen(true)}
              onDeleteRows={handleDeleteRows}
              onGoToUpload={() => {
                setDataStep('upload');
                goTo('import');
              }}
            />
          ) : null}

          {view === 'report' ? (
            <ReportStep
              rows={rows}
              sourceFileLabel={sourceFileLabel}
              onGoToRegister={() => goTo('register')}
              onGoToUpload={() => {
                setDataStep('upload');
                goTo('import');
              }}
            />
          ) : null}
        </main>

        <footer className="app-footer no-print">
          <IconFileText size={14} />
          <span>
            ระบบทะเบียนหนังสือ • ทำงานในเบราว์เซอร์ทั้งหมด ไม่มีเซิร์ฟเวอร์บันทึกข้อมูล •
            โปรดตรวจสอบความถูกต้องของวันที่ก่อนนำไปใช้งานจริง
          </span>
        </footer>
      </div>

      {pendingImport ? (
        <ImportDialog
          existingRows={rows}
          incoming={pendingImport}
          onCancel={() => setPendingImport(null)}
          onConfirm={handleConfirmImport}
        />
      ) : null}

      {addDialogOpen ? (
        <AddRecordDialog
          existingRows={rows}
          onCancel={() => setAddDialogOpen(false)}
          onSave={handleSaveManualRow}
        />
      ) : null}
    </div>
  );
}
