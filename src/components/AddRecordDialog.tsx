/**
 * ฟอร์มเพิ่มข้อมูลทะเบียนหนังสือด้วยมือ (7 ช่อง)
 * - บังคับเฉพาะเลขรับและเรื่อง ที่เหลือเว้นว่างได้
 * - ตรวจรูปแบบวันที่ก่อนบันทึก หากไม่ถูกต้องจะไม่ปิดฟอร์มและไม่ล้างข้อมูลที่กรอก
 * - เมื่อบันทึกสำเร็จจะส่งแถวใหม่กลับให้ผู้เรียกโดยไม่ต้องรีโหลดหน้าเว็บ
 */
import { useMemo, useState } from 'react';
import { Alert, Modal } from './ui';
import { IconPlus } from './icons';
import { parseDateValue } from '../lib/dates';
import {
  buildManualRow,
  EMPTY_MANUAL_ENTRY,
  nextRowId,
  validateManualEntry,
  type ManualEntryInput,
  type RegisterRow,
  type ValidationResult,
} from '../lib/types';
import { rowFingerprint } from '../lib/types';

type AddRecordDialogProps = {
  /** ข้อมูลเดิม ใช้ตรวจรายการซ้ำก่อนบันทึก */
  existingRows: RegisterRow[];
  onCancel: () => void;
  onSave: (row: RegisterRow) => void;
};

type FieldKey = keyof ManualEntryInput;

const TEXT_FIELDS: Array<{
  key: FieldKey;
  label: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
}> = [
  { key: 'receiveNo', label: 'เลขรับ', required: true, placeholder: 'เช่น 1001' },
  { key: 'documentNo', label: 'ที่ (เลขที่หนังสือ)', placeholder: 'เช่น สธ 001/2567' },
  { key: 'documentDateText', label: 'ลงวันที่', placeholder: 'เช่น 8 มกราคม 2567' },
  { key: 'from', label: 'จาก (หน่วยงานผู้ส่ง)', placeholder: 'เช่น สำนักปลัดกระทรวงสาธารณสุข' },
  { key: 'subject', label: 'เรื่อง', required: true, placeholder: 'เช่น ขอเชิญประชุม', multiline: true },
  { key: 'receivedDateText', label: 'วันที่รับ', placeholder: 'เช่น 9/1/2567' },
  { key: 'note', label: 'หมายเหตุ', placeholder: 'เว้นว่างได้' },
];

export function AddRecordDialog({ existingRows, onCancel, onSave }: AddRecordDialogProps) {
  const [input, setInput] = useState<ManualEntryInput>({ ...EMPTY_MANUAL_ENTRY });
  const [errors, setErrors] = useState<ValidationResult['fieldErrors']>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const existingFingerprints = useMemo(
    () => new Set(existingRows.map((row) => rowFingerprint(row))),
    [existingRows],
  );

  const updateField = (key: FieldKey, value: string) => {
    setInput((current) => ({ ...current, [key]: value }));
    // ล้างข้อผิดพลาดของช่องนั้นทันทีเมื่อผู้ใช้เริ่มแก้ไข
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (formError) setFormError('');
  };

  const handleSave = () => {
    if (isSaving) return; // กันการกดซ้ำ

    const result = validateManualEntry(input, parseDateValue);
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setFormError(result.formError);
      return;
    }

    setIsSaving(true);
    try {
      const row = buildManualRow(input, parseDateValue, nextRowId());
      const fingerprint = rowFingerprint(row);

      // เตือนรายการซ้ำ แต่ให้ผู้ใช้ตัดสินใจเองว่าจะบันทึกต่อหรือไม่
      if (fingerprint.replace(/\u0001/g, '').trim() !== '' && existingFingerprints.has(fingerprint)) {
        const proceed = window.confirm(
          'พบรายการที่มีข้อมูลเหมือนกับรายการที่มีอยู่แล้วในทะเบียน\nต้องการบันทึกซ้ำอีกครั้งหรือไม่?',
        );
        if (!proceed) {
          setIsSaving(false);
          return;
        }
      }

      onSave(row);
    } catch (error) {
      setFormError(
        `บันทึกไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)} — ข้อมูลที่กรอกยังอยู่ครบ`,
      );
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="เพิ่มข้อมูลทะเบียนหนังสือ"
      subtitle="กรอกข้อมูล 7 ช่อง ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก ส่วนที่เหลือเว้นว่างได้"
      wide
      onClose={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        {formError ? (
          <Alert variant="error" title="ยังบันทึกไม่ได้">
            <p>{formError}</p>
          </Alert>
        ) : null}

        <div className="manual-grid">
          {TEXT_FIELDS.map((field) => (
            <div
              className={`field${field.multiline ? ' field-span-2' : ''}${
                errors[field.key] ? ' field-invalid' : ''
              }`}
              key={field.key}
            >
              <label htmlFor={`manual-${field.key}`}>
                {field.label}
                {field.required ? <span className="req-mark">*</span> : null}
              </label>
              {field.multiline ? (
                <textarea
                  id={`manual-${field.key}`}
                  rows={2}
                  value={input[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  aria-invalid={errors[field.key] ? true : undefined}
                />
              ) : (
                <input
                  id={`manual-${field.key}`}
                  type="text"
                  value={input[field.key]}
                  placeholder={field.placeholder}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  aria-invalid={errors[field.key] ? true : undefined}
                />
              )}
              {errors[field.key] ? (
                <span className="field-error">{errors[field.key]}</span>
              ) : null}
            </div>
          ))}
        </div>

        <p className="manual-note">
          ข้อมูลจะถูกเก็บไว้ในหน่วยความจำของหน้านี้เท่านั้น หากรีโหลดหรือปิดหน้าเว็บจะหายไป
          กรุณาส่งออกเป็น Excel หรือพิมพ์รายงานก่อนปิด
        </p>

        <div className="btn-row manual-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSaving}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            <IconPlus size={16} />
            {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
