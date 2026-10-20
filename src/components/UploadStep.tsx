/**
 * ขั้นตอนนำเข้าไฟล์ — เลือกไฟล์ Excel/CSV จากเครื่องผู้ใช้
 * ไฟล์ถูกอ่านในเบราว์เซอร์เท่านั้น ไม่มีการอัปโหลดขึ้นเซิร์ฟเวอร์หรือบริการภายนอก
 */
import { useCallback, useRef, useState } from 'react';
import { Alert, Badge } from './ui';
import { IconDatabase, IconFileText, IconShield, IconUpload } from './icons';
import { formatFileSize, readWorkbookFile, type WorkbookData } from '../lib/excel';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.csv', '.txt'];
const MAX_SIZE_BYTES = 60 * 1024 * 1024; // 60 MB

type UploadState =
  | { status: 'idle' }
  | { status: 'reading'; fileName: string; fileSize: number }
  | { status: 'ready'; data: WorkbookData }
  | { status: 'error'; fileName: string; fileSize: number; message: string };

type UploadStepProps = {
  onLoaded: (data: WorkbookData) => void;
  hasExistingData: boolean;
  existingCount: number;
  currentFileLabel: string | null;
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

export function UploadStep({
  onLoaded,
  hasExistingData,
  existingCount,
  currentFileLabel,
}: UploadStepProps) {
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      const extension = extensionOf(file.name);
      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        setState({
          status: 'error',
          fileName: file.name,
          fileSize: file.size,
          message: `ไม่รองรับไฟล์ประเภท "${extension || 'ไม่ทราบชนิด'}" — รองรับเฉพาะไฟล์ Excel (.xlsx, .xls, .xlsm) และ CSV`,
        });
        return;
      }
      if (file.size === 0) {
        setState({
          status: 'error',
          fileName: file.name,
          fileSize: 0,
          message: 'ไฟล์ว่างเปล่า (0 ไบต์) กรุณาเลือกไฟล์ที่มีข้อมูล',
        });
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setState({
          status: 'error',
          fileName: file.name,
          fileSize: file.size,
          message: `ไฟล์มีขนาด ${formatFileSize(file.size)} ซึ่งใหญ่เกิน ${formatFileSize(MAX_SIZE_BYTES)} กรุณาแบ่งไฟล์หรือลดขนาดก่อน`,
        });
        return;
      }

      setState({ status: 'reading', fileName: file.name, fileSize: file.size });
      try {
        const { data } = await readWorkbookFile(file);
        setState({ status: 'ready', data });
        onLoaded(data);
      } catch (error) {
        setState({
          status: 'error',
          fileName: file.name,
          fileSize: file.size,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onLoaded],
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      void handleFile(files[0]);
      return;
    }
    setState({
      status: 'error',
      fileName: '',
      fileSize: 0,
      message: 'ไม่พบไฟล์ในรายการที่ลากมาวาง กรุณาลากไฟล์จากหน้าต่าง File Explorer โดยตรง',
    });
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">เลือกไฟล์ทะเบียนหนังสือ</h2>
            <p className="card-hint tight">
              รองรับไฟล์ Excel (.xlsx, .xls, .xlsm) และ CSV — ไฟล์จะถูกอ่านในเครื่องของคุณทันที
            </p>
          </div>
          <div className="btn-row tight">
            <Badge variant="accent">
              <IconShield size={13} />
              ประมวลผลในเครื่อง
            </Badge>
          </div>
        </div>

        {hasExistingData ? (
          <Alert variant="info">
            <p>
              ขณะนี้มีข้อมูลในระบบแล้ว <strong>{existingCount.toLocaleString('th-TH')} รายการ</strong>
              {currentFileLabel ? ` (จากไฟล์ ${currentFileLabel})` : ''} — การเลือกไฟล์ใหม่จะยังไม่ทับข้อมูลเดิม
              จนกว่าคุณจะยืนยันในขั้นตอนนำเข้า
            </p>
          </Alert>
        ) : null}

        <div
          className={`dropzone${isDragging ? ' is-dragging' : ''}${
            state.status === 'reading' ? ' is-busy' : ''
          }`}
          role="button"
          tabIndex={0}
          aria-label="เลือกไฟล์ Excel หรือ CSV"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <span className="dropzone-icon" aria-hidden="true">
            <IconUpload size={26} />
          </span>
          <span className="dropzone-title">
            {state.status === 'reading'
              ? 'กำลังอ่านไฟล์...'
              : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์'}
          </span>
          <span className="dropzone-subtitle">
            ไฟล์ Excel หรือ CSV ทะเบียนรับ–ส่งหนังสือ ขนาดไม่เกิน {formatFileSize(MAX_SIZE_BYTES)}
          </span>
          <span className="dropzone-formats">
            <Badge variant="neutral">.xlsx</Badge>
            <Badge variant="neutral">.xls</Badge>
            <Badge variant="neutral">.xlsm</Badge>
            <Badge variant="neutral">.csv</Badge>
          </span>
          <button
            type="button"
            className="btn btn-primary dropzone-cta"
            onClick={(event) => {
              event.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <IconFileText size={16} />
            เลือกไฟล์จากคอมพิวเตอร์
          </button>
          {state.status === 'reading' ? (
            <span className="spinner-row" style={{ marginTop: 14 }}>
              <span className="spinner" aria-hidden="true" />
              <span className="text-muted">กำลังอ่าน {state.fileName}</span>
            </span>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // ล้างค่าเพื่อให้เลือกไฟล์เดิมซ้ำได้อีกครั้ง
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </section>

      {state.status === 'ready' ? (
        <section className="card">
          <Alert variant="success" title="อ่านไฟล์สำเร็จ">
            <div className="file-summary">
              <span className="file-summary-icon" aria-hidden="true">
                <IconDatabase size={20} />
              </span>
              <div className="file-summary-text">
                <div className="file-summary-name">{state.data.fileName}</div>
                <div className="file-summary-meta">
                  ขนาด {formatFileSize(state.data.fileSize)} • พบ {state.data.sheetNames.length} Worksheet
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => inputRef.current?.click()}
              >
                เปลี่ยนไฟล์
              </button>
            </div>
            <p style={{ marginTop: 12, marginBottom: 0 }}>
              ขั้นตอนถัดไป: เลือก Worksheet และจับคู่คอลัมน์ในแท็บ “เลือกชีตและจับคู่คอลัมน์”
            </p>
          </Alert>
        </section>
      ) : null}

      {state.status === 'error' ? (
        <section className="card">
          <Alert variant="error" title="อ่านไฟล์ไม่สำเร็จ">
            <p>
              ไฟล์: <strong>{state.fileName || '(ไม่ทราบชื่อไฟล์)'}</strong>
              {state.fileSize > 0 ? ` • ขนาด ${formatFileSize(state.fileSize)}` : ''}
            </p>
            <p>{state.message}</p>
          </Alert>
        </section>
      ) : null}
    </div>
  );
}
