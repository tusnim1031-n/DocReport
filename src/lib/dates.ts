/**
 * การแปลงวันที่อย่างระมัดระวัง
 * - รองรับ Excel serial date
 * - รองรับวันที่แบบข้อความไทย/อังกฤษ
 * - ตรวจสอบว่าเป็น พ.ศ. หรือ ค.ศ. และแจ้งเตือนเมื่อไม่แน่ใจ
 * - ไม่เดาเกินข้อมูล: หากแปลงไม่ได้จะคืนค่าว่าง พร้อมสาเหตุ
 */

export type EraGuess = 'CE' | 'BE' | 'UNKNOWN';
export type DatePrecision = 'day' | 'month' | 'unknown';

export type DateParseResult = {
  /** วันที่ในรูปแบบ ISO (yyyy-mm-dd) สำหรับกรอง/เรียงลำดับ ใช้ได้เฉพาะ precision = 'day' */
  iso: string;
  /** คีย์สำหรับเรียงลำดับ/กรอง: yyyy-mm-dd, yyyy-mm หรือ '' */
  sortKey: string;
  /** ข้อความวันที่ตามที่พบในไฟล์ (ปรับให้อ่านง่ายขึ้นเล็กน้อย) */
  display: string;
  precision: DatePrecision;
  /** ปีคริสต์ศักราชที่แปลงแล้ว (ค.ศ.) */
  yearCE?: number;
  /** ปีพุทธศักราชที่แปลงแล้ว (พ.ศ.) */
  yearBE?: number;
  /** เป็น พ.ศ. หรือไม่ */
  isBE: boolean;
  /** ไม่แน่ใจว่าเป็น พ.ศ. หรือ ค.ศ. หรือไม่ (ต้องให้ผู้ใช้ตรวจสอบ) */
  uncertain: boolean;
  /** หมายเหตุ/สาเหตุที่แปลงไม่ได้ */
  note?: string;
};

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
  // ชื่อย่อ
  'ม.ค.': 1,
  'ก.พ.': 2,
  'มี.ค.': 3,
  'เม.ย.': 4,
  'พ.ค.': 5,
  'มิ.ย.': 6,
  'ก.ค.': 7,
  'ส.ค.': 8,
  'ก.ย.': 9,
  'ต.ค.': 10,
  'พ.ย.': 11,
  'ธ.ค.': 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export const THAI_MONTH_LABELS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const;

export const THAI_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function toISO(yearCE: number, month: number, day: number): string {
  return `${yearCE.toString().padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/** ปี ค.ศ. -> พ.ศ. (บวก 543 ครั้งเดียวจากค่าที่เก็บเป็น ค.ศ. เสมอ) */
export function toBuddhistYear(yearCE: number): number {
  return yearCE + 543;
}

/**
 * จัดรูปแบบวันที่เป็น `DD/MM/YYYY` โดยใช้ปีพุทธศักราช (พ.ศ.) เท่านั้น
 * ตัวอย่าง: 2026-12-01 -> "01/12/2569"
 * - รับปีเป็น ค.ศ. (ค่าที่ระบบเก็บภายใน) แล้วบวก 543 ครั้งเดียวที่นี่
 * - ห้ามส่งปี พ.ศ. เข้ามา เพราะจะทำให้บวกซ้ำ
 */
export function formatBEDate(yearCE: number, month: number, day: number): string {
  if (!Number.isFinite(yearCE) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${pad(day)}/${pad(month)}/${toBuddhistYear(yearCE)}`;
}

/** จัดรูปแบบจาก ISO (yyyy-mm-dd, ค.ศ.) เป็น `DD/MM/YYYY` พ.ศ. — คืนค่า '' หากไม่ใช่วันที่ครบถ้วน */
export function formatBEDateFromISO(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return formatBEDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * เดาว่าปีที่พบเป็น พ.ศ. หรือ ค.ศ.
 * เกณฑ์ที่ใช้ (conservative): ปี >= 2400 ถือเป็น พ.ศ. แน่นอน, ปี 2200-2399 คือกำกวม, ปี <= 2200 ถือเป็น ค.ศ.
 * ผลลัพธ์จะติดธง uncertain = true เมื่อกำกวม เพื่อให้ผู้ใช้ยืนยันเอง
 */
export function guessEra(year: number): { era: EraGuess; uncertain: boolean; note?: string } {
  if (!Number.isFinite(year)) {
    return { era: 'UNKNOWN', uncertain: true, note: 'ไม่พบปีในข้อมูล' };
  }
  if (year >= 2400) {
    return { era: 'BE', uncertain: false };
  }
  if (year >= 2200) {
    // 2200-2399: ถ้าเป็น พ.ศ. จะได้ ค.ศ. 1657-1856 (เก่าเกินไป) แต่ยังไม่ตัดทิ้ง
    return {
      era: 'UNKNOWN',
      uncertain: true,
      note: `ปี ${year} ไม่ชัดเจนว่าเป็น พ.ศ. หรือ ค.ศ. กรุณาตรวจสอบ`,
    };
  }
  if (year >= 1500) {
    return {
      era: 'CE',
      uncertain: true,
      note: `ปี ${year} ถูกตีความเป็น ค.ศ. กรุณาตรวจสอบว่าเป็น พ.ศ. หรือไม่`,
    };
  }
  return { era: 'CE', uncertain: false };
}

function isValidYMD(yearCE: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(yearCE, month - 1, day));
  return (
    date.getUTCFullYear() === yearCE &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function buildResult(params: {
  yearCE: number;
  month: number;
  day: number;
  precision: DatePrecision;
  raw: string;
  era: EraGuess;
  uncertain: boolean;
  note?: string;
}): DateParseResult {
  const { yearCE, month, day, precision, raw, era, uncertain, note } = params;
  const isBE = era === 'BE';
  // แสดงวันที่ครบถ้วนเป็น DD/MM/YYYY พ.ศ. เสมอ (ตัดเวลาและรูปแบบ ISO ออก)
  // หากไม่มีวันครบถ้วน (precision ไม่ใช่ 'day') จึงคงข้อความต้นทางที่ทำความสะอาดแล้ว
  const display =
    precision === 'day' ? formatBEDate(yearCE, month, day) : cleanDisplay(raw);
  const result: DateParseResult = {
    iso: precision === 'day' ? toISO(yearCE, month, day) : '',
    sortKey:
      precision === 'day'
        ? toISO(yearCE, month, day)
        : precision === 'month'
          ? `${yearCE.toString().padStart(4, '0')}-${pad(month)}`
          : '',
    // แสดงเฉพาะวันที่ในรูปแบบไทย (พ.ศ.) — ไม่แก้ข้อมูลต้นฉบับ
    display,
    precision,
    yearCE,
    // เก็บปี พ.ศ. ที่คำนวณจาก ค.ศ. เพียงครั้งเดียว (ไม่บวกซ้ำ)
    yearBE: toBuddhistYear(yearCE),
    isBE,
    uncertain,
  };
  if (note) result.note = note;
  return result;
}

/**
 * แปลง Excel serial date (ระบบ 1900) เป็นวันที่ ISO
 * Excel มีบั๊กปี 1900 ที่นับวันที่ 29 ก.พ. 1900 ซึ่งไม่มีจริง จึงต้องชดเชย
 */
export function excelSerialToDate(serial: number): { yearCE: number; month: number; day: number } | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  if (whole <= 0 || whole > 2958465) return null; // เกินขอบเขตที่สมเหตุสมผล
  // วันที่ 60 ของ Excel = 29/02/1900 (ไม่มีจริง) ค่าตั้งแต่ 61 ขึ้นไปให้ลบ 1 วัน
  const adjusted = whole >= 61 ? whole - 1 : whole;
  const epoch = Date.UTC(1899, 11, 31); // 1900-01-00
  const ms = epoch + adjusted * 86400000;
  const date = new Date(ms);
  return {
    yearCE: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** ตรวจว่า string เป็นตัวเลขล้วน */
function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

/** เวลาที่ต่อท้ายวันที่ (ต้องตัดออกก่อนตีความ แต่ไม่แตะข้อมูลต้นฉบับ) */
const TIME_SUFFIX_PATTERNS: RegExp[] = [
  // ISO timestamp: 2024-01-08T00:00:00.000Z / 2024-01-08T00:00:00+07:00
  /[Tt]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s*$/,
  // "(เวลา 08:30)" / "[เวลา 8.30 น.]" — วงเล็บครอบเวลา
  /\s*[([]\s*(?:เวลา\s*)?\d{1,2}(?:[:.]\d{2}){1,2}(?:\s*น\.?)?\s*[)\]]\s*$/,
  // "เวลา 08:30 น." / "เวลา 8.30" / "เวลา 08.30.15 น." — ต้องมาก่อนรูปแบบเวลาล้วน
  /\s*เวลา\s*\d{1,2}(?:[:.]\d{0,2}){0,2}(?:\s*น\.?)?\s*$/,
  // "08:30", "08:30:15", "08.30 น.", "08.30.15", "16:30 น."
  /\s+\d{1,2}(?:[:.]\d{2}){1,2}(?:\s*น\.?)?\s*$/,
  // "00:00:00 น." / "16:30:00"
  /\s*\d{1,2}:\d{2}:\d{2}\s*(?:น\.?)?\s*$/,
];

/**
 * ตัดส่วน "เวลา" ที่ต่อท้ายข้อความวันที่ออก โดยยังคงวันที่ไว้
 * (ใช้เฉพาะเพื่อตีความ ไม่ได้แก้ข้อมูลต้นฉบับ)
 */
export function stripTimePart(value: string): string {
  let text = value.replace(/\u00a0/g, ' ').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TIME_SUFFIX_PATTERNS) {
      const next = text.replace(pattern, '').trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  // คำว่า "เวลา" ที่เหลือลอย ๆ หลังตัดตัวเลขออกแล้ว เช่น "8 มกราคม 2567 เวลา"
  text = text.replace(/[\s,;:\-–—]*(?:เวลา|เวลา\s*น\.?)\s*$/, '').trim();
  // ตัดช่องว่าง/ตัวคั่นที่ค้างอยู่ท้ายสุด เช่น "8 มกราคม 2567 ," หรือ "8/1/2567 -"
  text = text.replace(/[\s,;:\-–—]+$/, '').trim();
  return text;
}

/**
 * จัดรูปแบบวันที่ให้เป็นมาตรฐานเดียว โดยตัดเวลาและอักขระส่วนเกินออก
 * ใช้แสดงผล "ตามที่พบในไฟล์" แต่สะอาด — ถ้าซ่อนเวลาไว้จะคืนเฉพาะวันที่
 */
function cleanDisplay(raw: string): string {
  const stripped = stripTimePart(raw);
  return stripped === '' ? raw.trim() : stripped;
}

/**
 * แปลงค่าจากเซลล์ให้เป็นข้อความวันที่
 * ลำดับ: Date object -> ตัวเลข (Excel serial) -> ข้อความรูปแบบต่าง ๆ -> คืนค่าว่างพร้อมหมายเหตุ
 */
export function parseDateValue(input: unknown): DateParseResult | null {
  if (input === null || input === undefined) return null;

  // 1) เป็น Date object (กรณีอ่านด้วย cellDates: true)
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const year = input.getUTCFullYear();
    const month = input.getUTCMonth() + 1;
    const day = input.getUTCDate();
    const era = guessEra(year);
    return buildResult({
      yearCE: year,
      month,
      day,
      precision: 'day',
      raw: formatBEDate(year, month, day),
      era: 'CE',
      uncertain: era.uncertain,
      note: era.note,
    });
  }

  // 2) เป็นตัวเลข = Excel serial date
  if (typeof input === 'number') {
    const converted = excelSerialToDate(input);
    if (!converted) {
      return {
        iso: '',
        sortKey: '',
        display: '',
        precision: 'unknown',
        isBE: false,
        uncertain: true,
        note: `ค่าตัวเลข ${input} ไม่ใช่รูปแบบวันที่ที่รองรับ`,
      };
    }
    return buildResult({
      yearCE: converted.yearCE,
      month: converted.month,
      day: converted.day,
      precision: 'day',
      raw: formatBEDate(converted.yearCE, converted.month, converted.day),
      era: 'CE',
      uncertain: false,
    });
  }

  const raw = String(input).trim();
  if (raw === '') return null;

  // ตัดส่วนเวลา/อักขระส่วนเกินที่ต่อท้ายออกก่อนตีความ (ไม่แตะข้อมูลต้นฉบับ)
  const cleaned = stripTimePart(raw);

  // ข้อความที่เป็นตัวเลขล้วน -> ตีความเป็น Excel serial date
  if (isNumeric(cleaned)) {
    const asNumber = Number(cleaned);
    const converted = excelSerialToDate(asNumber);
    if (converted) {
      return buildResult({
        yearCE: converted.yearCE,
        month: converted.month,
        day: converted.day,
        precision: 'day',
        raw: formatBEDate(converted.yearCE, converted.month, converted.day),
        era: 'CE',
        uncertain: false,
        note: 'ตีความจากตัวเลข Excel serial date',
      });
    }
  }

  // ตัดชื่อวันภาษาไทย/อังกฤษที่นำหน้า (เช่น "วันจันทร์ที่ 1 มกราคม 2567")
  let text = cleaned
    .replace(/วัน(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)?/g, ' ')
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b/gi, ' ')
    .replace(/\bdate\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/^ที่\s*/, '').trim();

  // รูปแบบตัวเลขล้วน: d/m/yyyy หรือ d-m-yyyy หรือ d.m.yyyy
  const numericMatch = text.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})$/);
  if (numericMatch) {
    const first = Number(numericMatch[1]);
    const second = Number(numericMatch[2]);
    let year = Number(numericMatch[3]);
    if (year < 100) {
      // ปี 2 หลัก: สมมติเป็น ค.ศ. 20xx (พ.ศ. 2 หลักไม่ปรากฏในทางปฏิบัติ)
      year += 2000;
    }
    const era = guessEra(year);
    // เอกสารราชการไทยใช้ วัน/เดือน/ปี — ตีความเป็น DD/MM เมื่อค่าแรกเป็นวันได้
    // (ถ้าค่าแรก > 12 แปลว่าเป็นวันแน่นอน; ถ้าค่าที่สอง > 12 แปลว่าสลับกันมา)
    let day = first;
    let month = second;
    if (first > 12 && second > 12) {
      // ทั้งคู่เกิน 12 -> ไม่ใช่วันที่ที่ถูกต้อง
      return {
        iso: '',
        sortKey: '',
        display: '',
        precision: 'unknown',
        isBE: era.era === 'BE',
        uncertain: true,
        note: `วันที่ ${raw} ไม่ถูกต้องตามปฏิทิน`,
      };
    }
    if (second > 12) {
      // ค่าที่สองเป็นวัน -> ต้นฉบับเป็น MM/DD
      day = second;
      month = first;
    }
    let yearCE: number;
    if (era.era === 'BE') {
      yearCE = year - 543;
    } else if (era.era === 'CE') {
      yearCE = year;
    } else {
      // ไม่แน่ใจ: ตีความเป็น พ.ศ. ไว้ก่อน (เอกสารราชการไทยส่วนใหญ่ใช้ พ.ศ.) แต่ติดธงเตือน
      yearCE = year - 543;
    }
    if (!isValidYMD(yearCE, month, day)) {
      return {
        iso: '',
        sortKey: '',
        display: cleanDisplay(raw),
        precision: 'unknown',
        isBE: era.era === 'BE',
        uncertain: true,
        note: `วันที่ ${raw} ไม่ถูกต้องตามปฏิทิน (${pad(day)}/${pad(month)}/${year})`,
      };
    }
    return buildResult({
      yearCE,
      month,
      day,
      precision: 'day',
      raw,
      era: era.era === 'UNKNOWN' ? 'UNKNOWN' : era.era,
      uncertain: era.uncertain,
      note: era.note,
    });
  }

  // รูปแบบ ISO: yyyy-mm-dd
  const isoMatch = text.match(/^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const era = guessEra(year);
    const yearCE = era.era === 'BE' ? year - 543 : year;
    if (!isValidYMD(yearCE, month, day)) {
      return {
        iso: '',
        sortKey: '',
        display: '',
        precision: 'unknown',
        isBE: era.era === 'BE',
        uncertain: true,
        note: `วันที่ ${raw} ไม่ถูกต้องตามปฏิทิน`,
      };
    }
    return buildResult({
      yearCE,
      month,
      day,
      precision: 'day',
      raw,
      era: era.era === 'UNKNOWN' ? 'UNKNOWN' : era.era,
      uncertain: era.uncertain,
      note: era.note,
    });
  }

  // รูปแบบ วันที่ เดือน(ชื่อ) ปี  — เช่น 1 มกราคม 2567 / 1 ม.ค. 67 / January 5, 2024
  const monthDayYear = text.match(/^(\d{1,2})\s+([^\d\s]+)\s+(\d{2,4})$/);
  const yearMonthDay = text.match(/^([^\d\s]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  if (monthDayYear) {
    day = Number(monthDayYear[1]);
    month = matchMonthName(monthDayYear[2]);
    year = Number(monthDayYear[3]);
  } else if (yearMonthDay) {
    month = matchMonthName(yearMonthDay[1]);
    day = Number(yearMonthDay[2]);
    year = Number(yearMonthDay[3]);
  }

  if (day !== null && month !== null && year !== null) {
    if (year < 100) {
      // ปี 2 หลัก: ถ้า <= 90 ให้เป็น พ.ศ. (2500-2590) มิฉะนั้นเป็น ค.ศ. 19xx
      year = year <= 90 ? year + 2500 : year + 1900;
    }
    const era = guessEra(year);
    let yearCE: number;
    if (era.era === 'BE') {
      yearCE = year - 543;
    } else if (era.era === 'CE') {
      yearCE = year;
    } else {
      yearCE = year - 543;
    }
    if (!isValidYMD(yearCE, month, day)) {
      return {
        iso: '',
        sortKey: '',
        display: '',
        precision: 'unknown',
        isBE: era.era === 'BE',
        uncertain: true,
        note: `วันที่ ${raw} ไม่ถูกต้องตามปฏิทิน`,
      };
    }
    return buildResult({
      yearCE,
      month,
      day,
      precision: 'day',
      raw,
      era: era.era === 'UNKNOWN' ? 'UNKNOWN' : era.era,
      uncertain: era.uncertain,
      note: era.note,
    });
  }

  // รูปแบบ เดือน(ชื่อ) ปี  — เช่น มกราคม 2567 / Jan 2024 (ไม่ทราบวัน)
  const monthYear = text.match(/^([^\d\s]+)\s+(\d{2,4})$/);
  if (monthYear) {
    const m = matchMonthName(monthYear[1]);
    const y = Number(monthYear[2]);
    if (m !== null) {
      const era = guessEra(y < 100 ? y + 2500 : y);
      let yearCE = y < 100 ? y + 2500 : y;
      if (era.era !== 'CE') yearCE = yearCE - 543;
      return buildResult({
        yearCE,
        month: m,
        day: 1,
        precision: 'month',
        raw,
        era: era.era === 'UNKNOWN' ? 'UNKNOWN' : era.era,
        uncertain: true,
        note: `พบเพียงเดือนและปี (${raw}) จึงใช้สำหรับกรองรายเดือนได้ แต่ไม่มีวันครบถ้วน`,
      });
    }
  }

  // อ่านวันที่ไม่ได้ -> ไม่แสดงค่าดิบ (อาจเป็น ISO หรือมีเวลา) และไม่สร้างวันที่ขึ้นเอง
  return {
    iso: '',
    sortKey: '',
    display: '',
    precision: 'unknown',
    isBE: false,
    uncertain: true,
    note: `ไม่สามารถตีความ "${raw}" เป็นวันที่ได้`,
  };
}

function matchMonthName(token: string): number | null {
  const cleaned = token.replace(/\.+$/, '').trim();
  if (THAI_MONTHS[token]) return THAI_MONTHS[token];
  if (THAI_MONTHS[cleaned]) return THAI_MONTHS[cleaned];
  const withDot = `${cleaned}.`;
  if (THAI_MONTHS[withDot]) return THAI_MONTHS[withDot];
  const lower = cleaned.toLowerCase();
  if (EN_MONTHS[lower]) return EN_MONTHS[lower];
  return null;
}

/** แปลง ISO (ค.ศ.) -> ข้อความวันที่ตามรูปแบบมาตรฐาน DD/MM/YYYY พ.ศ. */
export function formatThaiDateFromISO(iso: string): string {
  const formatted = formatBEDateFromISO(iso);
  if (formatted) return formatted;
  // fallback: แสดงแบบเดิมเฉพาะกรณีที่ ISO ไม่ครบวัน
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const yearCE = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${day} ${THAI_MONTH_LABELS[month - 1]} ${toBuddhistYear(yearCE)}`;
}

/** แสดงช่วงวันที่จาก ISO สองค่า */
export function formatDateRange(minISO: string, maxISO: string): string {
  if (!minISO || !maxISO) return '';
  if (minISO === maxISO) return formatThaiDateFromISO(minISO);
  return `${formatThaiDateFromISO(minISO)} – ${formatThaiDateFromISO(maxISO)}`;
}
