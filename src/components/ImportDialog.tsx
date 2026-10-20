import { useMemo, useState } from 'react';
import { Alert, Badge, Modal } from './ui';
import { applyImport, findDuplicates, type ImportedResult } from '../lib/import';
import type { RegisterRow } from '../lib/types';

type ImportDialogProps = {
  existingRows: RegisterRow[];
  incoming: ImportedResult;
  onCancel: () => void;
  onConfirm: (result: {
    mode: 'replace' | 'merge';
    skipDuplicates: boolean;
    rows: RegisterRow[];
    addedCount: number;
    skippedDuplicates: number;
  }) => void;
};

export function ImportDialog({ existingRows, incoming, onCancel, onConfirm }: ImportDialogProps) {
  const [mode, setMode] = useState<'replace' | 'merge'>(existingRows.length > 0 ? 'merge' : 'replace');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showDuplicateDetail, setShowDuplicateDetail] = useState(false);

  const duplicates = useMemo(
    () => findDuplicates(existingRows, incoming.rows),
    [existingRows, incoming.rows],
  );

  const duplicatesWithExisting = duplicates.filter((group) => group.existingIndices.length > 0);
  const duplicatesWithinIncoming = duplicates.filter(
    (group) => group.existingIndices.length === 0 && group.incomingIndices.length > 1,
  );

  const result = useMemo(
    () => applyImport(existingRows, incoming.rows, { mode, skipDuplicates }),
    [existingRows, incoming.rows, mode, skipDuplicates],
  );

  const willRemoveCount = mode === 'replace' ? existingRows.length : 0;

  return (
    <Modal
      title="ยืนยันการนำเข้าข้อมูล"
      subtitle={`ไฟล์ใหม่ ${incoming.rows.length.toLocaleString('th-TH')} รายการ • ข้อมูลเดิม ${existingRows.length.toLocaleString('th-TH')} รายการ`}
      wide
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={mode === 'replace' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() =>
              onConfirm({
                mode,
                skipDuplicates,
                rows: result.rows,
                addedCount: result.addedCount,
                skippedDuplicates: result.skippedDuplicates,
              })
            }
          >
            {mode === 'replace' ? 'ยืนยันแทนที่ข้อมูลทั้งหมด' : 'ยืนยันรวมข้อมูล'}
          </button>
        </>
      }
    >
      <div className="radio-group">
        <label className={`radio-card${mode === 'replace' ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
          />
          <span>
            <span className="radio-card-title">แทนที่ข้อมูลที่แสดงอยู่ทั้งหมด</span>
            <span className="radio-card-desc">
              ลบข้อมูลเดิม {existingRows.length.toLocaleString('th-TH')} รายการออก แล้วใช้ข้อมูลใหม่{' '}
              {incoming.rows.length.toLocaleString('th-TH')} รายการแทน
              {existingRows.length > 0 ? ' — รายการเดิมจะหายไปและเรียกคืนไม่ได้หากยังไม่ส่งออก' : ''}
            </span>
          </span>
        </label>

        <label className={`radio-card${mode === 'merge' ? ' is-selected' : ''}`}>
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'merge'}
            onChange={() => setMode('merge')}
          />
          <span>
            <span className="radio-card-title">รวมข้อมูลจากไฟล์ใหม่กับข้อมูลเดิม</span>
            <span className="radio-card-desc">
              เก็บข้อมูลเดิมไว้ แล้วเพิ่มข้อมูลใหม่ต่อท้าย (ตรวจรายการซ้ำให้ก่อนบันทึก)
            </span>
          </span>
        </label>
      </div>

      {mode === 'replace' && existingRows.length > 0 ? (
        <Alert variant="warning" title="การแทนที่ข้อมูลจะลบข้อมูลเดิม">
          <p>
            ข้อมูลเดิม {willRemoveCount.toLocaleString('th-TH')} รายการจะถูกแทนที่ด้วยข้อมูลใหม่{' '}
            {incoming.rows.length.toLocaleString('th-TH')} รายการ
            หากต้องการเก็บข้อมูลเดิมไว้ กรุณาเลือก “รวมข้อมูล” หรือส่งออกข้อมูลเดิมเป็น Excel ก่อน
          </p>
        </Alert>
      ) : null}

      {duplicates.length > 0 ? (
        <Alert variant="warning" title="พบข้อมูลที่อาจซ้ำกัน">
          <p>
            พบ <strong>{duplicatesWithExisting.length}</strong> รายการที่ซ้ำกับข้อมูลเดิม และ{' '}
            <strong>{duplicatesWithinIncoming.length}</strong> รายการที่ซ้ำกันเองภายในไฟล์ใหม่
          </p>
          <div className="checkbox-row" style={{ marginTop: 6 }}>
            <input
              id="skip-duplicates"
              type="checkbox"
              checked={skipDuplicates}
              onChange={(event) => setSkipDuplicates(event.target.checked)}
              disabled={mode === 'replace'}
            />
            <label htmlFor="skip-duplicates">
              ข้ามรายการที่ซ้ำ (ระบบไม่ลบให้อัตโนมัติหากคุณไม่เลือกข้อนี้)
            </label>
          </div>
          {mode === 'replace' ? (
            <p style={{ marginTop: 6 }}>
              หมายเหตุ: โหมด “แทนที่” จะนำเข้าข้อมูลใหม่ทั้งหมดตามไฟล์ต้นทาง โดยไม่ข้ามรายการซ้ำ
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setShowDuplicateDetail((value) => !value)}
          >
            {showDuplicateDetail ? 'ซ่อนตัวอย่างรายการซ้ำ' : 'ดูตัวอย่างรายการซ้ำ'}
          </button>
          {showDuplicateDetail ? (
            <div className="table-scroll" style={{ marginTop: 10, maxHeight: 260, overflowY: 'auto' }}>
              <table className="data-table is-compact" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>เลขรับ</th>
                    <th>ที่</th>
                    <th>ลงวันที่</th>
                    <th>จาก</th>
                    <th>เรื่อง</th>
                    <th>วันที่รับ</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.slice(0, 50).map((group) => (
                    <tr key={group.fingerprint}>
                      <td>{group.sample.receiveNo || <span className="cell-blank">—</span>}</td>
                      <td>{group.sample.documentNo || <span className="cell-blank">—</span>}</td>
                      <td>{group.sample.documentDateText || <span className="cell-blank">—</span>}</td>
                      <td>{group.sample.from || <span className="cell-blank">—</span>}</td>
                      <td>{group.sample.subject || <span className="cell-blank">—</span>}</td>
                      <td>{group.sample.receivedDateText || <span className="cell-blank">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Alert>
      ) : (
        <Alert variant="success" title="ไม่พบรายการซ้ำ">
          <p>ไม่พบรายการที่ซ้ำกับข้อมูลเดิมหรือซ้ำกันเองในไฟล์ใหม่</p>
        </Alert>
      )}

      {incoming.issues.length > 0 ? (
        <Alert variant="warning" title={`มี ${incoming.issueRows} แถวที่ต้องตรวจสอบ`}>
          <ul>
            {incoming.issues.slice(0, 8).map((issue, index) => (
              <li key={index}>
                แถวที่ {issue.rowNumber} • {issue.field}: {issue.message}
              </li>
            ))}
            {incoming.issues.length > 8 ? <li>… และอีก {incoming.issues.length - 8} รายการ</li> : null}
          </ul>
        </Alert>
      ) : null}

      <h4 className="section-heading">สรุปจำนวนรายการ</h4>
      <div className="stat-grid compact">
        <div className="stat-card tone-slate">
          <div className="stat-label">รายการก่อนนำเข้า</div>
          <div className="stat-value">{existingRows.length.toLocaleString('th-TH')}</div>
        </div>
        <div className="stat-card tone-sky">
          <div className="stat-label">รายการจากไฟล์ใหม่</div>
          <div className="stat-value">{incoming.rows.length.toLocaleString('th-TH')}</div>
        </div>
        <div className="stat-card tone-emerald">
          <div className="stat-label">รายการหลังนำเข้า</div>
          <div className="stat-value">{result.rows.length.toLocaleString('th-TH')}</div>
        </div>
        <div className="stat-card tone-amber">
          <div className="stat-label">รายการซ้ำที่ข้าม</div>
          <div className="stat-value">{result.skippedDuplicates.toLocaleString('th-TH')}</div>
        </div>
      </div>

      <p className="import-dialog-foot">
        <Badge variant="neutral">แถวว่างที่ข้าม</Badge>{' '}
        {incoming.blankRowCount.toLocaleString('th-TH')} แถว •{' '}
        <Badge variant="neutral">แถวข้อมูลไม่ครบที่ข้าม</Badge>{' '}
        {incoming.incompleteRows.toLocaleString('th-TH')} แถว
      </p>
    </Modal>
  );
}
