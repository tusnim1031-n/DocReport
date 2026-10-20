export type RegisterRow = {
  /** รหัสภายในสำหรับ React key และการอ้างอิงแถว */
  id: string;
  /** เลขรับ */
  receiveNo: string;
  /** ที่ (เลขที่หนังสือ) */
  documentNo: string;
  /** ลงวันที่ (จัดเก็บเป็น ISO yyyy-mm-dd เท่านั้น หากแปลงไม่ได้จะว่าง) */
  documentDateISO: string;
  /** ลงวันที่ (ข้อความตามที่ผู้ใช้ยืนยันรูปแบบ) */
  documentDateText: string;
  /** ที่มา / หน่วยงานผู้ส่ง */
  from: string;
  /** เรื่อง */
  subject: string;
  /** วันที่รับ (ISO) */
  receivedDateISO: string;
  /** วันที่รับ (ข้อความ) */
  receivedDateText: string;
  /** หมายเหตุ (ตามไฟล์ต้นทางเท่านั้น — ระบบจะไม่เติมข้อความใด ๆ ลงในช่องนี้) */
  note: string;
  /**
   * ข้อควรระวังด้านวันที่ (พ.ศ./ค.ศ. ไม่ชัดเจน หรืออ่านวันที่ไม่ได้)
   * เก็บแยกจาก "หมายเหตุ" เพื่อให้ช่องหมายเหตุสะอาดตามต้นทาง
   * ใช้แสดงเป็นเครื่องหมายเตือนในตาราง ไม่ถือเป็นข้อมูลของแถว
   */
  dateIssue: string;
};

export const REPORT_COLUMNS = [
  { key: 'receiveNo', label: 'เลขรับ', widthMm: 17 },
  { key: 'documentNo', label: 'ที่', widthMm: 21 },
  { key: 'documentDate', label: 'ลงวันที่', widthMm: 21 },
  { key: 'from', label: 'จาก', widthMm: 28 },
  { key: 'subject', label: 'เรื่อง', widthMm: 48 },
  { key: 'receivedDate', label: 'วันที่รับ', widthMm: 21 },
  { key: 'note', label: 'หมายเหตุ', widthMm: 18 },
] as const;

export type ReportColumnKey = (typeof REPORT_COLUMNS)[number]['key'];

/** คีย์ที่จับคู่ได้จากไฟล์ต้นทาง (ต้องกรอกอย่างน้อย 1 คีย์จึงจะนำเข้าได้) */
export const REQUIRED_MAPPABLE_KEYS: ReportColumnKey[] = ['receiveNo', 'subject'];

export function emptyRegisterRow(id: string): RegisterRow {
  return {
    id,
    receiveNo: '',
    documentNo: '',
    documentDateISO: '',
    documentDateText: '',
    from: '',
    subject: '',
    receivedDateISO: '',
    receivedDateText: '',
    note: '',
    dateIssue: '',
  };
}

export function reportColumnValue(row: RegisterRow, key: ReportColumnKey): string {
  switch (key) {
    case 'receiveNo':
      return row.receiveNo;
    case 'documentNo':
      return row.documentNo;
    case 'documentDate':
      return row.documentDateText;
    case 'from':
      return row.from;
    case 'subject':
      return row.subject;
    case 'receivedDate':
      return row.receivedDateText;
    case 'note':
      // คอลัมน์หมายเหตุต้องว่างเสมอทุกบริบท (ตาราง ตัวอย่างรายงาน พิมพ์/PDF และส่งออก Excel)
      // ไม่นำข้อมูลจากไฟล์ต้นทางหรือข้อความที่ระบบสร้างขึ้นมาแสดง
      return '';
  }
}

/** ลายนิ้วมือของแถว ใช้ตรวจรายการซ้ำ (เฉพาะข้อมูลที่ผู้ใช้จับคู่เข้ามา) */
export function rowFingerprint(row: RegisterRow): string {
  const parts = [
    row.receiveNo,
    row.documentNo,
    row.documentDateText || row.documentDateISO,
    row.from,
    row.subject,
    row.receivedDateText || row.receivedDateISO,
    row.note,
  ];
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase())
    .join('\u0001');
}

export function isRowEmpty(row: RegisterRow): boolean {
  return (
    row.receiveNo.trim() === '' &&
    row.documentNo.trim() === '' &&
    row.documentDateText.trim() === '' &&
    row.from.trim() === '' &&
    row.subject.trim() === '' &&
    row.receivedDateText.trim() === '' &&
    row.note.trim() === ''
  );
}

let counter = 0;
export function nextRowId(): string {
  counter += 1;
  return `row-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** ค่าที่รับจากฟอร์มเพิ่มข้อมูลด้วยมือ (7 ช่องของทะเบียนหนังสือ) */
export type ManualEntryInput = {
  receiveNo: string;
  documentNo: string;
  documentDateText: string;
  from: string;
  subject: string;
  receivedDateText: string;
  note: string;
};

export const EMPTY_MANUAL_ENTRY: ManualEntryInput = {
  receiveNo: '',
  documentNo: '',
  documentDateText: '',
  from: '',
  subject: '',
  receivedDateText: '',
  note: '',
};

export type ValidationResult = {
  ok: boolean;
  /** ข้อความผิดพลาดรายช่อง (คีย์ตรงกับชื่อช่องใน ManualEntryInput) */
  fieldErrors: Partial<Record<keyof ManualEntryInput, string>>;
  /** ข้อความสรุปภาพรวมสำหรับแสดงบนสุดของฟอร์ม */
  formError: string;
};

/**
 * ตรวจสอบข้อมูลจากฟอร์มเพิ่มข้อมูลด้วยมือ
 * - บังคับเฉพาะ "เลขรับ" และ "เรื่อง" ให้สอดคล้องกับ REQUIRED_MAPPABLE_KEYS ของการนำเข้าไฟล์
 * - ช่องวันที่ หากกรอกต้องอ่านเป็นวันที่ได้ จึงจะยอมรับ (ตรวจตรงตามที่ระบบจะจัดเก็บจริง)
 */
export function validateManualEntry(
  input: ManualEntryInput,
  parseDate: (value: string) => { iso: string } | null,
): ValidationResult {
  const fieldErrors: Partial<Record<keyof ManualEntryInput, string>> = {};

  if (input.receiveNo.trim() === '') {
    fieldErrors.receiveNo = 'กรุณากรอกเลขรับ';
  }
  if (input.subject.trim() === '') {
    fieldErrors.subject = 'กรุณากรอกเรื่อง';
  }

  if (input.documentDateText.trim() !== '') {
    const parsed = parseDate(input.documentDateText.trim());
    if (!parsed || parsed.iso === '') {
      fieldErrors.documentDateText =
        'อ่านวันที่ไม่สำเร็จ กรุณากรอก เช่น 8 มกราคม 2567, 8/1/2567 หรือ 2567-01-08';
    }
  }

  if (input.receivedDateText.trim() !== '') {
    const parsed = parseDate(input.receivedDateText.trim());
    if (!parsed || parsed.iso === '') {
      fieldErrors.receivedDateText =
        'อ่านวันที่ไม่สำเร็จ กรุณากรอก เช่น 8 มกราคม 2567, 8/1/2567 หรือ 2567-01-08';
    }
  }

  const keys = Object.keys(fieldErrors) as Array<keyof ManualEntryInput>;
  if (keys.length === 0) {
    return { ok: true, fieldErrors, formError: '' };
  }

  const missingRequired =
    fieldErrors.receiveNo !== undefined || fieldErrors.subject !== undefined;
  return {
    ok: false,
    fieldErrors,
    formError: missingRequired
      ? 'กรุณากรอกข้อมูลในช่องที่จำเป็น (เลขรับ และ เรื่อง) ให้ครบถ้วน'
      : 'รูปแบบวันที่ไม่ถูกต้อง กรุณาตรวจสอบช่องที่ระบุสีแดง',
  };
}

/**
 * สร้างแถวทะเบียนจากข้อมูลที่กรอกด้วยมือ
 * - วันที่ถูกจัดเก็บทั้งแบบข้อความ (ตามที่ผู้ใช้กรอก ไม่ตัดทอนความหมาย) และแบบ ISO สำหรับกรอง/เรียง
 * - หมายเหตุเก็บตามที่ผู้ใช้กรอกเท่านั้น ระบบไม่เติมข้อความใด ๆ
 */
export function buildManualRow(
  input: ManualEntryInput,
  parseDate: (value: string) => { iso: string; display: string; note?: string | null } | null,
  id: string,
): RegisterRow {
  const row = emptyRegisterRow(id);

  row.receiveNo = input.receiveNo.trim();
  row.documentNo = input.documentNo.trim();
  row.from = input.from.trim();
  row.subject = input.subject.trim();
  // คอลัมน์หมายเหตุต้องว่างเสมอ (แม้ผู้ใช้กรอกในแบบฟอร์ม) เพื่อให้สอดคล้องกับไฟล์นำเข้าและรายงาน
  row.note = '';

  const docDateText = input.documentDateText.trim();
  if (docDateText !== '') {
    const parsed = parseDate(docDateText);
    // เก็บเฉพาะรูปแบบมาตรฐาน DD/MM/YYYY พ.ศ. — หากอ่านไม่ได้ให้เว้นว่าง ไม่สร้างขึ้นเอง
    row.documentDateText = parsed && parsed.display ? parsed.display : '';
    row.documentDateISO = parsed ? parsed.iso : '';
  }

  const recvDateText = input.receivedDateText.trim();
  if (recvDateText !== '') {
    const parsed = parseDate(recvDateText);
    row.receivedDateText = parsed && parsed.display ? parsed.display : '';
    row.receivedDateISO = parsed ? parsed.iso : '';
  }

  return row;
}
