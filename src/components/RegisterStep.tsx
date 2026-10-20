/**
 * หน้าทะเบียนหนังสือ — ตารางข้อมูลหลัก
 * - ค้นหา กรองช่วงวันที่ เรียงลำดับ แบ่งหน้า และล้างตัวกรอง
 * - ลำดับคอลัมน์ 7 ช่องคงเดิมตาม REPORT_COLUMNS
 * - ไม่แสดงเครื่องหมายเตือน ⚠ (ข้อควรระวังด้านวันที่แสดงเป็นข้อความในหน้าภาพรวมเท่านั้น)
 */
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from './ui';
import { RegisterTable } from './RegisterTable';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import {
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconFilter,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconTrash,
} from './icons';
import {
  applyFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  monthOptions,
  type FilterState,
  type SortKey,
} from '../lib/stats';
import type { RegisterRow } from '../lib/types';

type RegisterStepProps = {
  rows: RegisterRow[];
  sourceFileLabel: string | null;
  onClearAllData: () => void;
  onGoToReport: () => void;
  onAddRecord: () => void;
  onGoToUpload: () => void;
  /** ลบรายการตาม id (ระบุด้วย id ที่ไม่ซ้ำ ไม่ใช่เลขแถวบนหน้าจอ) */
  onDeleteRows: (ids: string[]) => void;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function formatNumber(value: number): string {
  return value.toLocaleString('th-TH');
}

export function RegisterStep({
  rows,
  sourceFileLabel,
  onClearAllData,
  onGoToReport,
  onAddRecord,
  onGoToUpload,
  onDeleteRows,
}: RegisterStepProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<RegisterRow[] | null>(null);

  const months = useMemo(() => monthOptions(rows), [rows]);
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const filtersActive = hasActiveFilters(filters);

  // ตัด id ที่ถูกลบไปแล้วออกจากรายการที่เลือกไว้ (กันการค้างและการลบผิด)
  useEffect(() => {
    const existing = new Set(rows.map((row) => row.id));
    setSelectedIds((current) => {
      let changed = false;
      const next = new Set<string>();
      current.forEach((id) => {
        if (existing.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : current;
    });
  }, [rows]);

  // เลือกได้เฉพาะรายการที่กำลังแสดงในหน้านี้
  const pageIds = useMemo(() => pageRows.map((row) => row.id), [pageRows]);
  const selectedOnPage = pageIds.filter((id) => selectedIds.has(id));
  const allSelected = pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;

  const updateFilters = (patch: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) pageIds.forEach((id) => next.add(id));
      else pageIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );

  const confirmDelete = (ids: string[]) => {
    onDeleteRows(ids);
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setPendingDelete(null);
  };

  if (rows.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={<IconCalendar size={30} />}
          title="ยังไม่มีข้อมูลทะเบียนหนังสือ"
          description={
            <>
              เริ่มได้ 2 วิธี: นำเข้าจากไฟล์ Excel หรือเพิ่มข้อมูลทีละรายการด้วยมือ
              <div className="btn-row center" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-primary" onClick={onAddRecord}>
                  <IconPlus size={16} />
                  เพิ่มข้อมูล
                </button>
                <button type="button" className="btn btn-secondary" onClick={onGoToUpload}>
                  นำเข้าไฟล์ Excel
                </button>
              </div>
            </>
          }
        />
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">ทะเบียนหนังสือ</h2>
            <p className="card-hint tight">
              ค้นหาได้จาก เลขรับ, ที่ (เลขที่หนังสือ), จาก และเรื่อง • กรองด้วยช่วงวันที่ • เรียงลำดับ •
              แบ่งหน้าอัตโนมัติ
            </p>
          </div>
          <div className="btn-row tight">
            <button type="button" className="btn btn-primary btn-sm" onClick={onAddRecord}>
              <IconPlus size={15} />
              เพิ่มข้อมูล
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onGoToReport}>
              <IconPrinter size={15} />
              ไปที่สร้างรายงาน
            </button>
          </div>
        </div>

        <div className="toolbar">
          <div className="search-field">
            <span className="search-icon" aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="search"
              placeholder="ค้นหา เลขรับ / เลขที่หนังสือ / หน่วยงาน / เรื่อง"
              value={filters.search}
              onChange={(event) => updateFilters({ search: event.target.value })}
              aria-label="ค้นหาในตาราง"
            />
            {filters.search ? (
              <button
                type="button"
                className="search-clear"
                onClick={() => updateFilters({ search: '' })}
                aria-label="ล้างคำค้นหา"
              >
                <IconClose size={14} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className={`btn btn-secondary btn-sm${showFilters ? ' is-on' : ''}`}
            onClick={() => setShowFilters((value) => !value)}
            aria-expanded={showFilters}
          >
            <IconFilter size={15} />
            ตัวกรอง{filtersActive ? ' •' : ''}
          </button>

          <select
            className="mini-select"
            value={filters.sortKey}
            onChange={(event) => updateFilters({ sortKey: event.target.value as SortKey })}
            aria-label="เรียงลำดับตาม"
          >
            <option value="documentDate">เรียง: ลงวันที่</option>
            <option value="receivedDate">เรียง: วันที่รับ</option>
            <option value="receiveNo">เรียง: เลขรับ</option>
            <option value="documentNo">เรียง: ที่</option>
            <option value="from">เรียง: จาก</option>
            <option value="subject">เรียง: เรื่อง</option>
          </select>

          <select
            className="mini-select"
            value={filters.sortDirection}
            onChange={(event) =>
              updateFilters({ sortDirection: event.target.value as 'asc' | 'desc' })
            }
            aria-label="ทิศทางการเรียง"
          >
            <option value="asc">เก่า → ใหม่</option>
            <option value="desc">ใหม่ → เก่า</option>
          </select>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearFilters}
            disabled={!filtersActive}
          >
            ล้างตัวกรอง
          </button>
        </div>

        {showFilters ? (
          <div className="filter-panel">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="r-date-field">ใช้คอลัมน์วันที่</label>
                <select
                  id="r-date-field"
                  value={filters.dateField}
                  onChange={(event) =>
                    updateFilters({ dateField: event.target.value as FilterState['dateField'] })
                  }
                >
                  <option value="documentDate">ลงวันที่</option>
                  <option value="receivedDate">วันที่รับ</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="r-date-from">ตั้งแต่วันที่</label>
                <input
                  id="r-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => updateFilters({ dateFrom: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="r-date-to">ถึงวันที่</label>
                <input
                  id="r-date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => updateFilters({ dateTo: event.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="r-month">เดือน</label>
                <select
                  id="r-month"
                  value={filters.month}
                  onChange={(event) => updateFilters({ month: event.target.value })}
                >
                  <option value="all">ทุกเดือน</option>
                  {months.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="btn-row tight" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearFilters}
                disabled={!filtersActive}
              >
                ล้างตัวกรองทั้งหมด
              </button>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-ghost btn-sm danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `ต้องการล้างข้อมูลทะเบียนหนังสือทั้งหมด ${formatNumber(rows.length)} รายการ หรือไม่?\nข้อมูลที่ยังไม่ได้ส่งออกจะหายไปและเรียกคืนไม่ได้`,
                    )
                  ) {
                    onClearAllData();
                  }
                }}
              >
                <IconTrash size={15} />
                ล้างข้อมูลทั้งหมด
              </button>
            </div>
          </div>
        ) : null}

        {filtersActive ? (
          <div className="chip-row">
            {filters.search ? (
              <button type="button" className="filter-chip" onClick={() => updateFilters({ search: '' })}>
                ค้นหา: {filters.search}
                <IconClose size={12} />
              </button>
            ) : null}
            {filters.month !== 'all' ? (
              <button type="button" className="filter-chip" onClick={() => updateFilters({ month: 'all' })}>
                เดือน: {months.find((option) => option.value === filters.month)?.label ?? filters.month}
                <IconClose size={12} />
              </button>
            ) : null}
            {filters.dateFrom || filters.dateTo ? (
              <button
                type="button"
                className="filter-chip"
                onClick={() => updateFilters({ dateFrom: '', dateTo: '' })}
              >
                {filters.dateField === 'documentDate' ? 'ลงวันที่' : 'วันที่รับ'}:{' '}
                {filters.dateFrom || 'เริ่มต้น'} → {filters.dateTo || 'ล่าสุด'}
                <IconClose size={12} />
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card flush">
        {selectedRows.length > 0 ? (
          <div className="bulk-bar">
            <span className="bulk-count">
              <IconCheck size={15} />
              เลือกไว้ <strong>{formatNumber(selectedRows.length)}</strong> รายการ
            </span>
            <span className="spacer" />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds(new Set())}
            >
              ล้างการเลือก
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setPendingDelete(selectedRows)}
            >
              <IconTrash size={15} />
              ลบรายการที่เลือก {formatNumber(selectedRows.length)} รายการ
            </button>
          </div>
        ) : null}

        <div className="dt-toolbar">
          <span className="dt-count">
            พบ <strong>{formatNumber(filtered.length)}</strong> รายการ
            <span className="dt-sep">•</span>
            จากทั้งหมด {formatNumber(rows.length)} รายการ
            {sourceFileLabel ? (
              <>
                <span className="dt-sep">•</span>
                <span className="dt-source">ไฟล์ {sourceFileLabel}</span>
              </>
            ) : null}
          </span>
          <span className="spacer" />
          <select
            className="mini-select"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            aria-label="จำนวนต่อหน้า"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / หน้า
              </option>
            ))}
          </select>
          <div className="dt-pager">
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
              aria-label="หน้าแรก"
            >
              «
            </button>
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              aria-label="ก่อนหน้า"
            >
              <IconChevronLeft size={15} />
            </button>
            <span className="dt-page-indicator">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              aria-label="ถัดไป"
            >
              <IconChevronRight size={15} />
            </button>
            <button
              type="button"
              className="page-btn"
              onClick={() => setPage(totalPages)}
              disabled={safePage >= totalPages}
              aria-label="หน้าสุดท้าย"
            >
              »
            </button>
          </div>
        </div>

        <RegisterTable
          rows={pageRows}
          startIndex={(safePage - 1) * pageSize + 1}
          emptyAction={{ label: 'ล้างตัวกรองทั้งหมด', onClick: clearFilters }}
          selectable
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAllOnPage}
          allSelected={allSelected}
          someSelected={someSelected}
          onRequestDelete={(row) => setPendingDelete([row])}
        />

        {filtered.length > 0 ? (
          <div className="dt-footer">
            <span className="dt-count">
              แสดงรายการที่ {formatNumber((safePage - 1) * pageSize + 1)} –{' '}
              {formatNumber(Math.min(safePage * pageSize, filtered.length))} จาก{' '}
              {formatNumber(filtered.length)}
            </span>
          </div>
        ) : null}
      </section>

      {pendingDelete ? (
        <DeleteConfirmDialog
          rows={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
