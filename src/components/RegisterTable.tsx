/**
 * ตารางทะเบียนหนังสือ (ใช้ร่วมกันระหว่างหน้าภาพรวมและหน้าทะเบียนหนังสือ)
 * - คงลำดับคอลัมน์ 7 ช่องตาม REPORT_COLUMNS เสมอ
 * - ข้อความยาวตัดบรรทัดในคอลัมน์ "เรื่อง" ไม่ล้นไปทับคอลัมน์ข้างเคียง
 * - เลื่อนแนวนอนได้เมื่อพื้นที่หน้าจอไม่เพียงพอ
 * - คอลัมน์หมายเหตุว่างเสมอ (ดู reportColumnValue)
 */
import { IconSearch, IconTrash } from './icons';
import { REPORT_COLUMNS, reportColumnValue, type RegisterRow } from '../lib/types';
import { EmptyState } from './ui';

type RegisterTableProps = {
  rows: RegisterRow[];
  startIndex: number;
  variant?: 'screen' | 'compact';
  emptyAction?: { label: string; onClick: () => void };
  /** เปิดโหมดจัดการ: แสดงช่องเลือกและปุ่มลบรายแถว */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
  allSelected?: boolean;
  someSelected?: boolean;
  onRequestDelete?: (row: RegisterRow) => void;
};

export function RegisterTable({
  rows,
  startIndex,
  variant = 'screen',
  emptyAction,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allSelected = false,
  someSelected = false,
  onRequestDelete,
}: RegisterTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconSearch size={30} />}
        title="ไม่พบรายการที่ตรงกับเงื่อนไข"
        description={
          <>
            ลองปรับคำค้นหา ช่วงวันที่ หรือกดปุ่ม “ล้างตัวกรองทั้งหมด”
            {emptyAction ? (
              <div className="btn-row center" style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={emptyAction.onClick}>
                  {emptyAction.label}
                </button>
              </div>
            ) : null}
          </>
        }
      />
    );
  }

  const showActions = typeof onRequestDelete === 'function';

  return (
    <div className="table-scroll">
      <table
        className={`data-table${variant === 'compact' ? ' is-compact' : ''}${
          showActions ? ' has-actions' : ''
        }`}
      >
        <colgroup>
          <col className="cw-index" />
          {selectable ? <col className="cw-select" /> : null}
          {REPORT_COLUMNS.map((column) => (
            <col key={column.key} className={`cw-${column.key}`} />
          ))}
          {showActions ? <col className="cw-actions" /> : null}
        </colgroup>
        <thead>
          <tr>
            <th className="col-index">ลำดับ</th>
            {selectable ? (
              <th className="col-select">
                <input
                  type="checkbox"
                  className="row-check"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && someSelected;
                  }}
                  onChange={(event) => onToggleSelectAll?.(event.target.checked)}
                  aria-label="เลือกรายการทั้งหมดในหน้านี้"
                />
              </th>
            ) : null}
            {REPORT_COLUMNS.map((column) => (
              <th key={column.key} className={`col-${column.key}`}>
                {column.label}
              </th>
            ))}
            {showActions ? (
              <th className="col-actions">
                <span className="visually-hidden">จัดการ</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isSelected = selectedIds?.has(row.id) ?? false;
            return (
              <tr key={row.id} className={isSelected ? 'is-selected' : undefined}>
                <td className="col-index">{startIndex + index}</td>
                {selectable ? (
                  <td className="col-select">
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={isSelected}
                      onChange={() => onToggleSelect?.(row.id)}
                      aria-label={`เลือกรายการ ${row.receiveNo || row.id}`}
                    />
                  </td>
                ) : null}
                {REPORT_COLUMNS.map((column) => {
                  const value = reportColumnValue(row, column.key);
                  const numeric =
                    column.key === 'receiveNo' ||
                    column.key === 'documentDate' ||
                    column.key === 'receivedDate';
                  return (
                    <td
                      key={column.key}
                      className={`col-${column.key}${numeric ? ' col-num' : ''}${
                        value === '' ? ' cell-empty' : ''
                      }`}
                    >
                      {value === '' ? <span className="cell-blank">—</span> : value}
                    </td>
                  );
                })}
                {showActions ? (
                  <td className="col-actions">
                    <button
                      type="button"
                      className="row-action-btn danger"
                      title="ลบรายการนี้"
                      aria-label={`ลบรายการนี้ (เลขรับ ${row.receiveNo || 'ไม่มีเลขรับ'})`}
                      onClick={() => onRequestDelete?.(row)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
