/**
 * หน้าต่างยืนยันการลบรายการทะเบียนหนังสือ
 * - แสดงข้อมูลระบุรายการ (เลขรับ / เลขที่หนังสือ / เรื่อง) เพื่อกันลบผิดรายการ
 * - ต้องกด "ยืนยันการลบ" เท่านั้นจึงจะลบจริง (ห้ามลบทันทีโดยไม่ถาม)
 * - รองรับทั้งการลบรายการเดียวและการลบหลายรายการที่เลือกไว้
 */
import { useMemo, useState } from 'react';
import { Alert, Modal } from './ui';
import { IconAlert, IconTrash } from './icons';
import type { RegisterRow } from '../lib/types';

type DeleteConfirmDialogProps = {
  /** รายการที่กำลังจะลบ (1 รายการสำหรับลบเดี่ยว, หลายรายการสำหรับลบที่เลือก) */
  rows: RegisterRow[];
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
};

export function DeleteConfirmDialog({ rows, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const isBulk = rows.length > 1;
  const preview = rows.slice(0, 5);

  const handleConfirm = () => {
    if (isDeleting) return; // กันการกดซ้ำ
    setIsDeleting(true);
    try {
      onConfirm(ids);
    } catch (err) {
      setError(
        `ลบไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)} — ยังไม่มีรายการใดถูกลบ`,
      );
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      title="ยืนยันการลบรายการ"
      subtitle={
        isBulk
          ? `คุณเลือกไว้ ${rows.length.toLocaleString('th-TH')} รายการ`
          : 'กรุณาตรวจสอบข้อมูลก่อนยืนยัน'
      }
      onClose={onCancel}
    >
      {error ? (
        <Alert variant="error" title="เกิดข้อผิดพลาด">
          <p>{error}</p>
        </Alert>
      ) : null}

      <Alert variant="warning">
        <p>
          คุณต้องการลบรายการทะเบียนหนังสือ{isBulk ? ` ${rows.length.toLocaleString('th-TH')} รายการ` : 'นี้'}
          ใช่หรือไม่? เมื่อลบแล้วจะไม่สามารถกู้คืนได้จากระบบนี้
        </p>
      </Alert>

      <div className="delete-preview">
        <div className="delete-preview-head">
          <IconAlert size={15} />
          <span>รายการที่จะถูกลบ {rows.length.toLocaleString('th-TH')} รายการ</span>
        </div>
        <ul className="delete-list">
          {preview.map((row) => (
            <li key={row.id}>
              <span className="delete-list-index" aria-hidden="true">
                <IconTrash size={13} />
              </span>
              <span className="delete-list-body">
                <span className="delete-list-main">
                  เลขรับ <strong>{row.receiveNo || '—'}</strong>
                  {row.documentNo ? (
                    <>
                      {' '}
                      • ที่ <strong>{row.documentNo}</strong>
                    </>
                  ) : null}
                </span>
                <span className="delete-list-sub">{row.subject || '(ไม่มีเรื่อง)'}</span>
              </span>
            </li>
          ))}
        </ul>
        {rows.length > preview.length ? (
          <p className="delete-more">และอีกรวมทั้งหมด {rows.length.toLocaleString('th-TH')} รายการ</p>
        ) : null}
      </div>

      <p className="delete-note">
        การลบจะนำรายการออกจากข้อมูลที่ระบบกำลังใช้งานเท่านั้น
        ไฟล์ Excel ต้นฉบับบนเครื่องของคุณจะไม่ถูกแก้ไข
      </p>

      <div className="btn-row manual-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isDeleting}>
          ยกเลิก
        </button>
        <button type="button" className="btn btn-danger" onClick={handleConfirm} disabled={isDeleting}>
          <IconTrash size={16} />
          {isDeleting ? 'กำลังลบ...' : `ยืนยันการลบ${isBulk ? ` ${rows.length} รายการ` : ''}`}
        </button>
      </div>
    </Modal>
  );
}
