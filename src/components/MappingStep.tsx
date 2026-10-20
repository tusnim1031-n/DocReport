import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge } from './ui';
import { parseDateValue } from '../lib/dates';
import { formatFileSize } from '../lib/excel';
import type { SheetPreview, WorkbookData } from '../lib/excel';
import { buildRows, guessMapping, type ColumnMapping } from '../lib/import';
import { REPORT_COLUMNS, reportColumnValue, type ReportColumnKey } from '../lib/types';

type MappingStepProps = {
  data: WorkbookData;
  activeSheetName: string;
  onSelectSheet: (sheetName: string) => void;
  mapping: ColumnMapping;
  onChangeMapping: (mapping: ColumnMapping) => void;
  eraPolicy: 'auto' | 'BE' | 'CE';
  onChangeEraPolicy: (policy: 'auto' | 'BE' | 'CE') => void;
  skipIncomplete: boolean;
  onChangeSkipIncomplete: (value: boolean) => void;
  onConfirm: () => void;
  onReset: () => void;
  hasExistingData: boolean;
};

const PREVIEW_ROWS = 8;

function confidenceLabel(score: number | undefined): { text: string; variant: 'success' | 'warning' | 'neutral' } {
  if (score === undefined) return { text: 'ยังไม่จับคู่', variant: 'neutral' };
  if (score >= 70) return { text: 'ตรงกับชื่อคอลัมน์', variant: 'success' };
  if (score >= 40) return { text: 'ใกล้เคียง', variant: 'warning' };
  return { text: 'ควรตรวจสอบ', variant: 'warning' };
}

function summarizeDateColumn(sheet: SheetPreview, column: number | undefined): string {
  if (column === undefined || column < 0) return '—';
  let dayCount = 0;
  let uncertainCount = 0;
  let failedCount = 0;
  let sample = '';
  const limit = Math.min(sheet.rows.length, 300);
  for (let i = 0; i < limit; i += 1) {
    const value = (sheet.rows[i]?.[column] ?? '').trim();
    if (value === '') continue;
    const parsed = parseDateValue(value);
    if (!parsed || parsed.precision === 'unknown') {
      failedCount += 1;
      // ไม่แสดงค่าดิบที่อ่านไม่ได้เป็นตัวอย่าง (อาจเป็น ISO หรือมีเวลา) — แสดงข้อความแทน
      if (sample === '') sample = 'อ่านไม่ได้';
      continue;
    }
    dayCount += 1;
    if (parsed.uncertain) uncertainCount += 1;
    if (sample === '') sample = parsed.display;
  }
  const parts = [`อ่านได้ ${dayCount}`];
  if (failedCount > 0) parts.push(`อ่านไม่ได้ ${failedCount}`);
  if (uncertainCount > 0) parts.push(`ต้องตรวจสอบปี ${uncertainCount}`);
  if (sample) parts.push(`ตัวอย่าง: ${sample}`);
  return parts.join(' • ');
}

export function MappingStep({
  data,
  activeSheetName,
  onSelectSheet,
  mapping,
  onChangeMapping,
  eraPolicy,
  onChangeEraPolicy,
  skipIncomplete,
  onChangeSkipIncomplete,
  onConfirm,
  onReset,
  hasExistingData,
}: MappingStepProps) {
  const sheet = data.workbooks[activeSheetName];
  const [showAllPreviewRows, setShowAllPreviewRows] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  // เดาจับคู่คอลัมน์อัตโนมัติเมื่อเปลี่ยนชีต (ยังไม่ตั้งค่าใด ๆ)
  const guessed = useMemo(() => {
    if (!sheet || sheet.headers.length === 0) {
      return { mapping: {} as ColumnMapping, confidence: {} as Record<string, number> };
    }
    return guessMapping(sheet.headers, sheet.dateColumns);
  }, [sheet]);

  useEffect(() => {
    if (!sheet) return;
    if (Object.keys(mapping).length === 0 && Object.keys(guessed.mapping).length > 0) {
      onChangeMapping(guessed.mapping);
    }
  }, [guessed, mapping, onChangeMapping, sheet]);

  const preview = useMemo(() => {
    if (!sheet) return null;
    try {
      return buildRows({ sheet, mapping, eraPolicy, skipIncomplete });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) } as const;
    }
  }, [sheet, mapping, eraPolicy, skipIncomplete]);

  if (!sheet) {
    return (
      <section className="card">
        <Alert variant="error" title="ไม่พบข้อมูลชีต">
          ไม่พบ Worksheet ชื่อ “{activeSheetName}” ในไฟล์นี้ กรุณาเลือกชีตใหม่
        </Alert>
      </section>
    );
  }

  const mappingCount = (Object.keys(mapping) as ReportColumnKey[]).filter(
    (key) => mapping[key] !== undefined,
  ).length;

  const previewRowsToShow = showAllPreviewRows ? sheet.rows : sheet.rows.slice(0, PREVIEW_ROWS);

  const handleAutoMap = () => {
    onChangeMapping(guessed.mapping);
  };

  const handleClearMapping = () => {
    onChangeMapping({});
  };

  return (
    <div>
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">เลือก Worksheet และจับคู่คอลัมน์</h2>
            <p className="card-hint tight">
              ไฟล์: <strong>{data.fileName}</strong> • ขนาด {formatFileSize(data.fileSize)}
            </p>
          </div>
          <Badge variant="navy">{data.sheetNames.length} Worksheet</Badge>
        </div>

        <div className="report-sheet-list">
          {data.sheetNames.map((name) => {
            const sheetData = data.workbooks[name];
            return (
              <button
                key={name}
                type="button"
                className={`sheet-chip${name === activeSheetName ? ' is-active' : ''}`}
                onClick={() => {
                  setShowAllPreviewRows(false);
                  onSelectSheet(name);
                }}
              >
                {name}
                {sheetData ? (
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>({sheetData.totalRows})</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="hint-box">
          ตรวจพบแถวหัวตารางที่แถวที่{' '}
          <strong>
            {sheet.headerRowIndex >= 0 ? sheet.headerRowIndex + 1 : 'ไม่พบ (ใช้ข้อมูลทุกแถว)'}
          </strong>{' '}
          ของชีต “{sheet.activeSheet}” • แถวข้อมูลทั้งหมด <strong>{sheet.totalRows}</strong> แถว •
          ข้ามแถวว่าง <strong>{sheet.blankRowCount}</strong> แถว
        </div>

        {sheet.rowNumbers.length > 0 ? (
          <div className="hint-box">
            เลขแถวในชีตต้นทางของแถวแรก–สุดท้ายที่อ่านได้: {sheet.rowNumbers[0]} –{' '}
            {sheet.rowNumbers[sheet.rowNumbers.length - 1]}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title-sm">จับคู่คอลัมน์จาก Excel กับคอลัมน์รายงาน 7 คอลัมน์</h3>
            <p className="card-hint tight">
              เลือกคอลัมน์ต้นทางให้ตรงกับคอลัมน์รายงาน หากไฟล์ไม่มีคอลัมน์ใด ให้เลือก “— ไม่มีข้อมูล —”
              ระบบจะเว้นว่างไว้ ไม่ดึงคอลัมน์อื่นมาแทนให้เอง
            </p>
          </div>
          <Badge variant={mappingCount > 0 ? 'success' : 'warning'}>
            จับคู่แล้ว {mappingCount} / {REPORT_COLUMNS.length} คอลัมน์
          </Badge>
        </div>

        <div className="btn-row" style={{ marginBottom: 14 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleAutoMap}>
            เดาจับคู่ให้อัตโนมัติ
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearMapping}>
            ล้างการจับคู่ทั้งหมด
          </button>
        </div>

        <div className="table-scroll">
          <table className="mapping-table">
            <colgroup>
              <col style={{ width: '58px' }} />
              <col style={{ width: '150px' }} />
              <col />
              <col style={{ width: '230px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>คอลัมน์รายงาน</th>
                <th>คอลัมน์ต้นทางใน Excel</th>
                <th>ข้อมูลตัวอย่าง</th>
              </tr>
            </thead>
            <tbody>
              {REPORT_COLUMNS.map((column, index) => {
                const selected = mapping[column.key];
                const confidence = guessed.confidence[column.key];
                const usedByGuesser = confidence !== undefined && guessed.mapping[column.key] === selected;
                const label = confidenceLabel(usedByGuesser ? confidence : undefined);
                const sampleValues = selected !== undefined
                  ? sheet.rows
                      .map((row) => (row[selected] ?? '').trim())
                      .filter((value) => value !== '')
                      .slice(0, 3)
                  : [];
                const isDateColumn = column.key === 'documentDate' || column.key === 'receivedDate';
                const dateSummary = isDateColumn ? summarizeDateColumn(sheet, selected) : '';

                return (
                  <tr key={column.key}>
                    <td className="text-center">{index + 1}</td>
                    <td>
                      <strong>{column.label}</strong>
                      {column.key === 'documentNo' ? (
                        <div className="field-hint">เลขที่หนังสือ</div>
                      ) : null}
                    </td>
                    <td>
                      <select
                        className={selected !== undefined ? 'has-value' : ''}
                        value={selected === undefined ? '' : String(selected)}
                        onChange={(event) => {
                          const value = event.target.value;
                          const next: ColumnMapping = { ...mapping };
                          if (value === '') {
                            delete next[column.key];
                          } else {
                            next[column.key] = Number(value);
                          }
                          onChangeMapping(next);
                        }}
                      >
                        <option value="">— ไม่มีข้อมูล (เว้นว่าง) —</option>
                        {sheet.headers.map((header, columnIndex) => (
                          <option key={columnIndex} value={columnIndex}>
                            {String.fromCharCode(65 + (columnIndex % 26))} • {header}
                          </option>
                        ))}
                      </select>
                      <div style={{ marginTop: 6 }}>
                        <Badge variant={label.variant}>{label.text}</Badge>
                      </div>
                    </td>
                    <td>
                      {isDateColumn ? (
                        <span className="sample-value" title={dateSummary}>
                          {dateSummary || '—'}
                        </span>
                      ) : sampleValues.length > 0 ? (
                        <span className="sample-value" title={sampleValues.join(' | ')}>
                          {sampleValues.join(' | ')}
                        </span>
                      ) : (
                        <span className="text-muted">ยังไม่มีข้อมูล</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="field" style={{ marginTop: 18, maxWidth: 520 }}>
          <label htmlFor="era-policy">รูปแบบปีของข้อมูลวันที่ในไฟล์นี้</label>
          <select
            id="era-policy"
            value={eraPolicy}
            onChange={(event) => onChangeEraPolicy(event.target.value as 'auto' | 'BE' | 'CE')}
          >
            <option value="auto">ตรวจสอบอัตโนมัติ (แนะนำ)</option>
            <option value="BE">ยืนยันว่าเป็น พ.ศ. ทั้งไฟล์</option>
            <option value="CE">ยืนยันว่าเป็น ค.ศ. ทั้งไฟล์</option>
          </select>
          <span className="field-hint">
            หากไม่แน่ใจ ให้เลือก “ตรวจสอบอัตโนมัติ” ระบบจะรายงานแถวที่ต้องตรวจสอบไว้ในสรุปด้านล่าง
            โดยไม่แก้ไขข้อมูลต้นทาง
          </span>
        </div>

        <div className="checkbox-row" style={{ marginTop: 14 }}>
          <input
            id="skip-incomplete"
            type="checkbox"
            checked={skipIncomplete}
            onChange={(event) => onChangeSkipIncomplete(event.target.checked)}
          />
          <label htmlFor="skip-incomplete">
            ข้ามแถวที่ไม่ข้อมูลในช่อง เลขรับ / ที่ / เรื่อง (แถวสรุปท้ายตาราง)
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h3 className="card-title-sm">ตัวอย่างข้อมูลก่อนนำเข้า</h3>
            <p className="card-hint tight">
              ข้อมูลด้านล่างเป็นตัวอย่างจากผลการจับคู่ปัจจุบัน ยังไม่ถูกนำเข้า จนกว่าคุณจะกด “นำเข้าข้อมูล”
            </p>
          </div>
        </div>

        {preview && 'error' in preview ? (
          <Alert variant="warning" title="ยังไม่สามารถแสดงตัวอย่างได้">
            <p>{preview.error}</p>
          </Alert>
        ) : null}

        {preview && !('error' in preview) ? (
          <>
            <div className="stat-grid compact" style={{ marginBottom: 16 }}>
              <div className="stat-card tone-slate">
                <div className="stat-label">แถวทั้งหมดในชีต</div>
                <div className="stat-value">{preview.totalRows.toLocaleString('th-TH')}</div>
                <div className="stat-detail">รวมแถวที่ข้ามไปด้วย</div>
              </div>
              <div className="stat-card tone-emerald">
                <div className="stat-label">แถวที่จะนำเข้า</div>
                <div className="stat-value">{preview.importedCount.toLocaleString('th-TH')}</div>
                <div className="stat-detail">ตามการจับคู่คอลัมน์ปัจจุบัน</div>
              </div>
              <div className="stat-card tone-sky">
                <div className="stat-label">แถวว่างที่ข้าม</div>
                <div className="stat-value">{preview.blankRowCount.toLocaleString('th-TH')}</div>
                <div className="stat-detail">แถวที่ไม่มีข้อมูลจริง</div>
              </div>
              <div className={`stat-card${preview.issueRows > 0 ? ' tone-amber' : ' tone-slate'}`}>
                <div className="stat-label">แถวที่ต้องตรวจสอบ</div>
                <div className="stat-value">{preview.issueRows.toLocaleString('th-TH')}</div>
                <div className="stat-detail">
                  {preview.incompleteRows > 0
                    ? `ข้ามเพราะข้อมูลไม่ครบ ${preview.incompleteRows} แถว`
                    : 'วันที่ไม่ชัดเจนหรืออ่านไม่ได้'}
                </div>
              </div>
            </div>

            {preview.unclearEraCount > 0 ? (
              <Alert variant="warning" title="พบวันที่ที่ไม่แน่ใจว่าเป็น พ.ศ. หรือ ค.ศ.">
                <p>
                  พบ {preview.unclearEraCount} รายการที่ระบบไม่แน่ใจเรื่องปี
                  กรุณาตรวจสอบเทียบกับไฟล์ต้นทาง หากทราบแน่ชัดให้เลือก “ยืนยันว่าเป็น พ.ศ./ค.ศ. ทั้งไฟล์”
                  ด้านบน ระบบจะไม่แก้ไขปีให้เองโดยไม่แจ้ง
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowIssues((value) => !value)}
                >
                  {showIssues ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดแถวที่ต้องตรวจสอบ'}
                </button>
                {showIssues ? (
                  <ul>
                    {preview.issues.slice(0, 30).map((issue, index) => (
                      <li key={`${issue.rowNumber}-${issue.field}-${index}`}>
                        แถวที่ {issue.rowNumber} • {issue.field}: {issue.message}
                      </li>
                    ))}
                    {preview.issues.length > 30 ? (
                      <li>… และอีก {preview.issues.length - 30} รายการ</li>
                    ) : null}
                  </ul>
                ) : null}
              </Alert>
            ) : null}

            <div className="table-scroll">
              <table className="data-table is-compact">
                <colgroup>
                  <col className="cw-rowno" />
                  {REPORT_COLUMNS.map((column) => (
                    <col key={column.key} className={`cw-${column.key}`} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="col-index">แถว</th>
                    {REPORT_COLUMNS.map((column) => (
                      <th key={column.key} className={`col-${column.key}`}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                    <tr key={row.id}>
                      <td className="col-index">{sheet.rowNumbers[index] ?? index + 1}</td>
                      {REPORT_COLUMNS.map((column) => {
                        // ใช้ reportColumnValue เพื่อให้ช่องหมายเหตุว่างเสมอและสอดคล้องกับตาราง/รายงาน
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.rows.length === 0 ? (
              <Alert variant="warning" title="ยังไม่มีแถวข้อมูลที่จะนำเข้า">
                <p>
                  ตรวจสอบว่าจับคู่คอลัมน์ถูกต้อง หรือยกเลิกการข้ามแถวที่ข้อมูลไม่ครบ
                </p>
              </Alert>
            ) : null}

            {sheet.rows.length > PREVIEW_ROWS ? (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAllPreviewRows((value) => !value)}
                >
                  {showAllPreviewRows
                    ? `แสดงตัวอย่างเพียง ${PREVIEW_ROWS} แถว`
                    : `แสดงข้อมูลตัวอย่างทั้งหมด ${sheet.rows.length} แถว`}
                </button>
                {showAllPreviewRows ? (
                  <div className="table-scroll" style={{ marginTop: 12, maxHeight: 420, overflowY: 'auto' }}>
                    <table className="data-table is-compact">
                      <thead>
                        <tr>
                          <th className="col-index">แถว</th>
                          {sheet.headers.map((header, index) => (
                            <th key={index}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRowsToShow.map((sourceRow, index) => (
                          <tr key={index}>
                            <td className="text-muted">{sheet.rowNumbers[index] ?? index + 1}</td>
                            {sourceRow.map((value, cellIndex) => (
                              <td key={cellIndex} className={value.trim() ? '' : 'cell-empty'}>
                                {value || <span className="cell-blank">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="btn-row" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={preview.importedCount === 0}
                onClick={onConfirm}
              >
                นำเข้าข้อมูล {preview.importedCount.toLocaleString('th-TH')} รายการ
              </button>
              <button type="button" className="btn btn-ghost" onClick={onReset}>
                ล้างการจับคู่และเริ่มใหม่
              </button>
              {hasExistingData ? (
                <Badge variant="navy">
                  มีข้อมูลเดิมอยู่แล้ว ระบบจะให้เลือก “แทนที่” หรือ “รวมข้อมูล”
                </Badge>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

export type { SheetPreview };
