/**
 * เรขาคณิตหน้ากระดาษ A4 และอัลกอริทึมแบ่งหน้าของรายงาน
 *
 * ปัญหาเดิม: รายงานแบ่งหน้าด้วยจำนวนแถวคงที่ (22 แถว/หน้า)
 * แต่ความสูงจริงของแต่ละแถวขึ้นกับความยาวของ "เรื่อง" และ "จาก"
 * (แถวเดียวอาจสูง 1–5 เท่าของแถวปกติ) ทำให้บางหน้าเนื้อหาล้นออกนอกกระดาษ
 * แล้วเบราว์เซอร์ดันไปหน้าใหม่ + break-after: page สร้างหน้าว่างเพิ่ม
 *
 * วิธีแก้: คำนวณจาก "ความสูงจริง" ของแต่ละแถวที่วัดจาก DOM
 * โดยพื้นที่ใช้งานจริง = A4 ลบระยะขอบ ลบหัวรายงาน ลบหัวตาราง ลบส่วนท้าย
 */

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** ระยะขอบที่ใช้ทั้งใน @page และ padding ของตัวอย่างบนจอ — ต้องตรงกันเสมอ */
export const PRINT_MARGIN_X_MM = 12;
export const PRINT_MARGIN_Y_MM = 10;

/** พื้นที่พิมพ์จริงหลังหักระยะขอบ (มม.) */
export const CONTENT_WIDTH_MM = A4_WIDTH_MM - PRINT_MARGIN_X_MM * 2; // 186
export const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - PRINT_MARGIN_Y_MM * 2; // 277

/**
 * ความกว้างคอลัมน์ "ลำดับ" (มม.)
 * รวมกับความกว้าง 7 คอลัมน์ใน REPORT_COLUMNS ต้องเท่ากับ CONTENT_WIDTH_MM พอดี
 * เพื่อไม่ให้เบราว์เซอร์ย่อ/ขยายคอลัมน์จนแนวไม่ตรงกัน
 */
export const REPORT_INDEX_WIDTH_MM = 10;

/**
 * 1 CSS px = 1/96 นิ้ว, 1 นิ้ว = 25.4 มม.
 * เบราว์เซอร์ใช้หน่วยนี้ทั้งการแสดงผลบนจอและการคำนวณงานพิมพ์
 */
export const PX_PER_MM = 96 / 25.4;

/** เผื่อความคลาดเคลื่อนจากการปัดเศษเส้นขอบ/ฟอนต์ (มม.) กันเนื้อหาล้นไปหน้าใหม่ */
export const PAGINATION_SAFETY_MM = 4;

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

/** ช่วงของแถวในหนึ่งหน้า: เริ่มที่ start (รวม) ถึง end (ไม่รวม) */
export type PageSlice = {
  start: number;
  end: number;
};

export type PaginateOptions = {
  /**
   * ความสูงของบล็อกที่ต้องอยู่ท้ายหน้าสุดท้าย (เช่น ช่องลงนาม)
   * ถ้าหน้าสุดท้ายเหลือที่ไม่พอ จะยกแถวท้าย ๆ ไปหน้าใหม่ให้ลงนามอยู่หน้าเดียว
   */
  trailingHeight?: number;
};

/**
 * แบ่งแถวเป็นหน้าตามความสูงจริง
 * - เติมแถวลงหน้าเดิมจนกว่าจะเต็ม capacityPx แล้วขึ้นหน้าใหม่
 * - ไม่ตัดแถวกลางคัน (แต่ละแถวอยู่หน้าเดียวเสมอ)
 * - ถ้าแถวเดียวสูงกว่า capacity จะให้อยู่หน้าเดียวตามลำพัง (ไม่วนลูปไม่รู้จบ)
 */
export function paginateRowsByHeight(
  rowHeights: number[],
  capacityPx: number,
  options: PaginateOptions = {},
): PageSlice[] {
  const capacity = Math.max(1, capacityPx);
  const pages: PageSlice[] = [];
  if (rowHeights.length === 0) return pages;

  let start = 0;
  let used = 0;

  for (let i = 0; i < rowHeights.length; i += 1) {
    const height = Number.isFinite(rowHeights[i]) ? Math.max(0, rowHeights[i]) : 0;
    // i > start กันกรณีแถวแรกของหน้าสูงเกินพื้นที่ (ต้องปล่อยไว้ ไม่ใช่ขึ้นหน้าเปล่า)
    if (i > start && used + height > capacity) {
      pages.push({ start, end: i });
      start = i;
      used = 0;
    }
    used += height;
  }
  pages.push({ start, end: rowHeights.length });

  const trailing = Math.max(0, options.trailingHeight ?? 0);
  if (trailing > 0 && pages.length > 0) {
    // ขยับแถวท้ายของหน้าสุดท้ายออกไปหน้าใหม่ จนกว่าช่องลงนามจะมีที่พอ
    for (;;) {
      const last = pages[pages.length - 1];
      const usedLast = sumHeights(rowHeights, last.start, last.end);
      if (usedLast + trailing <= capacity) break;
      if (last.end - last.start <= 1) break;
      const movedStart = last.end - 1;
      last.end = movedStart;
      pages.push({ start: movedStart, end: rowHeights.length });
    }
  }

  return pages;
}

/** เพดานการเพิ่มระยะห่างบน/ล่างของแต่ละแถวเมื่อยืดตารางให้เต็มหน้า (มม. ต่อด้าน) */
export const JUSTIFY_MAX_EXTRA_PAD_MM = 4;

/**
 * เผื่อพื้นที่ว่างไว้อีกชั้นเมื่อยืดตาราง (มม.)
 * กันเคสที่ความสูงจริงบนหน้ากระดาษต่างจากตัวที่วัดเล็กน้อย
 * (เช่น หัวรายงานต่าง ~0.5 มม.) จนเนื้อหาล้นพื้นที่พิมพ์
 */
export const JUSTIFY_BUFFER_MM = 1.5;

/**
 * คำนวณระยะ padding เพิ่ม (px ต่อด้าน) สำหรับแถวในหน้านั้น
 * ใช้ "ยืดตารางให้เต็มพื้นที่พิมพ์" เพื่อไม่ให้เหลือช่องว่างท้ายหน้า
 * - ไม่ยืดหน้าสุดท้าย (ปล่อยให้จบตามเนื้อหา)
 * - หัก JUSTIFY_BUFFER_MM ออกเสมอ กันเนื้อหาล้น
 * - จำกัดไม่เกิน JUSTIFY_MAX_EXTRA_PAD_MM ต่อด้าน กันแถวบานผิดปกติ
 */
export function computeJustifiedExtraPadPx(params: {
  capacityPx: number;
  usedPx: number;
  rowCount: number;
  isLastPage: boolean;
  maxPadMm?: number;
  bufferMm?: number;
}): number {
  const { capacityPx, usedPx, rowCount, isLastPage } = params;
  if (isLastPage || rowCount <= 0) return 0;
  const leftover = capacityPx - usedPx - mmToPx(params.bufferMm ?? JUSTIFY_BUFFER_MM);
  if (!(leftover > 0)) return 0;
  // padding ถูกเพิ่มทั้งบนและล่างของทุกแถว
  const extra = leftover / (rowCount * 2);
  return Math.min(extra, mmToPx(params.maxPadMm ?? JUSTIFY_MAX_EXTRA_PAD_MM));
}

export function sumHeights(rowHeights: number[], start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i += 1) {
    const height = rowHeights[i];
    total += Number.isFinite(height) ? Math.max(0, height) : 0;
  }
  return total;
}

/** จำนวนแถวในแต่ละหน้า (ใช้ตรวจสอบ/แสดงผล) */
export function rowCountsPerPage(pages: PageSlice[]): number[] {
  return pages.map((page) => page.end - page.start);
}

/**
 * คำนวณพื้นที่เหลือสำหรับแถวข้อมูลในแต่ละหน้า
 * capacity = ความสูงพื้นที่พิมพ์ − หัวรายงาน − หัวตาราง − ส่วนท้าย − (ช่องลงนาม)
 */
export function computeRowCapacityPx(params: {
  headerHeight: number;
  tableHeadHeight: number;
  footerHeight: number;
  trailingHeight?: number;
  safetyMm?: number;
}): number {
  const { headerHeight, tableHeadHeight, footerHeight } = params;
  const safety = mmToPx(params.safetyMm ?? PAGINATION_SAFETY_MM);
  const total = mmToPx(CONTENT_HEIGHT_MM) - safety;
  const trailing = Math.max(0, params.trailingHeight ?? 0);
  return Math.max(1, total - headerHeight - tableHeadHeight - footerHeight - trailing);
}
