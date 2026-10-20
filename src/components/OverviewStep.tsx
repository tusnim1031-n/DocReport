/**
 * หน้าภาพรวม (Dashboard)
 * - ตัวเลขทั้งหมดคำนวณจากข้อมูลที่นำเข้าจริงเท่านั้น ไม่มีข้อมูลจำลอง
 * - หากยังไม่มีข้อมูล แสดง Empty State พร้อมปุ่มนำเข้าไฟล์
 */
import { useMemo } from 'react';
import { Alert, Badge, EmptyState } from './ui';
import { RegisterTable } from './RegisterTable';
import {
  IconCalendar,
  IconChart,
  IconDatabase,
  IconFileText,
  IconMapPin,
  IconUpload,
} from './icons';
import { formatDateRange } from '../lib/dates';
import { computeStatistics, monthOptions } from '../lib/stats';
import type { RegisterRow } from '../lib/types';

type OverviewStepProps = {
  rows: RegisterRow[];
  sourceFileLabel: string | null;
  onGoToUpload: () => void;
  onGoToRegister: () => void;
  onGoToReport: () => void;
};

function formatNumber(value: number): string {
  return value.toLocaleString('th-TH');
}

export function OverviewStep({
  rows,
  sourceFileLabel,
  onGoToUpload,
  onGoToRegister,
  onGoToReport,
}: OverviewStepProps) {
  const statistics = useMemo(() => computeStatistics(rows), [rows]);
  const months = useMemo(() => monthOptions(rows), [rows]);

  const peakMonth = useMemo(
    () => statistics.byMonth.reduce<null | { label: string; count: number }>(
      (best, item) => (best === null || item.count > best.count ? item : best),
      null,
    ),
    [statistics.byMonth],
  );

  const recentRows = useMemo(() => {
    const withDate = rows.filter((row) => row.documentDateISO || row.receivedDateISO);
    const sorted = [...withDate].sort((a, b) => {
      const aKey = a.documentDateISO || a.receivedDateISO;
      const bKey = b.documentDateISO || b.receivedDateISO;
      return bKey.localeCompare(aKey);
    });
    return sorted.slice(0, 8);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={<IconFileText size={30} />}
          title="ยังไม่มีข้อมูลทะเบียนหนังสือ"
          description={
            <>
              เริ่มต้นด้วยการนำเข้าไฟล์ทะเบียนหนังสือของคุณ (Excel หรือ CSV)
              ระบบจะอ่านไฟล์ในเครื่องนี้เท่านั้น ไม่มีการส่งไฟล์ออกภายนอก
              <div className="btn-row center" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-primary" onClick={onGoToUpload}>
                  <IconUpload size={16} />
                  นำเข้าไฟล์ Excel
                </button>
              </div>
            </>
          }
        />
      </section>
    );
  }

  const maxMonthCount = statistics.byMonth.reduce((max, item) => Math.max(max, item.count), 0);

  return (
    <div className="stack">
      <section className="stat-grid">
        <article className="stat-card tone-navy">
          <div className="stat-icon" aria-hidden="true">
            <IconDatabase size={19} />
          </div>
          <div className="stat-label">รายการทั้งหมด</div>
          <div className="stat-value">{formatNumber(statistics.total)}</div>
          <div className="stat-detail">
            {sourceFileLabel ? `จากไฟล์ ${sourceFileLabel}` : 'ข้อมูลที่นำเข้าแล้ว'}
          </div>
        </article>

        <article className="stat-card tone-sky">
          <div className="stat-icon" aria-hidden="true">
            <IconMapPin size={19} />
          </div>
          <div className="stat-label">ช่วงวันที่ลงวันที่</div>
          <div className="stat-value sm">
            {statistics.minDocumentDateISO && statistics.maxDocumentDateISO
              ? formatDateRange(statistics.minDocumentDateISO, statistics.maxDocumentDateISO)
              : 'ไม่พบวันที่'}
          </div>
          <div className="stat-detail">
            {statistics.minReceivedDateISO && statistics.maxReceivedDateISO
              ? `ช่วงวันที่รับ: ${formatDateRange(
                  statistics.minReceivedDateISO,
                  statistics.maxReceivedDateISO,
                )}`
              : 'ไม่พบวันที่รับ'}
          </div>
        </article>

        <article className="stat-card tone-emerald">
          <div className="stat-icon" aria-hidden="true">
            <IconCalendar size={19} />
          </div>
          <div className="stat-label">เดือนที่มีรายการมากที่สุด</div>
          <div className="stat-value sm">{peakMonth ? peakMonth.label : 'ไม่พบข้อมูลเดือน'}</div>
          <div className="stat-detail">
            {peakMonth ? `${formatNumber(peakMonth.count)} รายการ` : 'ต้องมีวันที่ที่สมบูรณ์'}
          </div>
        </article>

        <article className="stat-card tone-slate">
          <div className="stat-icon" aria-hidden="true">
            <IconChart size={19} />
          </div>
          <div className="stat-label">เดือนที่มีข้อมูล</div>
          <div className="stat-value">{formatNumber(months.length)}</div>
          <div className="stat-detail">
            {statistics.withoutAnyDate > 0
              ? `ไม่มีวันที่ ${formatNumber(statistics.withoutAnyDate)} รายการ`
              : 'ทุกรายการมีวันที่'}
          </div>
        </article>
      </section>

      {statistics.byMonth.length > 0 ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h3 className="card-title-sm">จำนวนรายการแยกตามเดือน</h3>
              <p className="card-hint tight">
                นับจากวันที่ในข้อมูลจริง (ใช้วันที่ลงวันที่ หากไม่มีจึงใช้วันที่รับ)
              </p>
            </div>
            <Badge variant="navy">
              รวม{' '}
              {formatNumber(statistics.byMonth.reduce((sum, item) => sum + item.count, 0))} รายการ
            </Badge>
          </div>
          <div className="bar-chart" role="img" aria-label="กราฟจำนวนรายการแยกตามเดือน">
            {statistics.byMonth.map((item) => (
              <div className="bar-col" key={item.month}>
                <span className="bar-value">{formatNumber(item.count)}</span>
                <span
                  className="bar"
                  style={{ height: `${maxMonthCount === 0 ? 0 : Math.max(6, (item.count / maxMonthCount) * 100)}%` }}
                />
                <span className="bar-label">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <Alert variant="info">
          <p>ไม่มีข้อมูลวันที่ที่อ่านได้ครบถ้วน จึงยังไม่สามารถสรุปจำนวนรายการแยกตามเดือนได้</p>
        </Alert>
      )}

      <section className="card flush">
        <div className="card-head">
          <div>
            <h3 className="card-title-sm">รายการล่าสุดจากข้อมูลจริง</h3>
            <p className="card-hint tight">แสดง {formatNumber(recentRows.length)} รายการที่มีวันที่ล่าสุด</p>
          </div>
          <div className="btn-row tight">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onGoToRegister}>
              ดูตารางทั้งหมด
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onGoToReport}>
              สร้างรายงาน
            </button>
          </div>
        </div>
        {recentRows.length > 0 ? (
          <RegisterTable rows={recentRows} startIndex={1} variant="compact" />
        ) : (
          <EmptyState
            icon={<IconCalendar size={30} />}
            title="ยังไม่มีรายการที่มีวันที่สมบูรณ์"
            description="ตารางสรุปรายการล่าสุดต้องอาศัยวันที่ในข้อมูล จึงแสดงไม่ได้ในขณะนี้"
          />
        )}
      </section>
    </div>
  );
}
