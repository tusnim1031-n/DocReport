import type { ReactNode } from 'react';
import { IconAlert, IconCheck, IconClose, IconInfo, IconInbox } from './icons';

type AlertProps = {
  variant: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
};

const ALERT_ICON = {
  info: IconInfo,
  success: IconCheck,
  warning: IconAlert,
  error: IconAlert,
} as const;

export function Alert({ variant, title, children, onClose, className }: AlertProps) {
  const Icon = ALERT_ICON[variant];
  return (
    <div className={`alert alert-${variant} no-print ${className ?? ''}`.trim()} role={variant === 'error' ? 'alert' : undefined}>
      <span className="alert-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="alert-body">
        {title ? <strong className="alert-title">{title}</strong> : null}
        {children}
      </div>
      {onClose ? (
        <button type="button" className="alert-close" onClick={onClose} aria-label="ปิดข้อความ">
          <IconClose size={16} />
        </button>
      ) : null}
    </div>
  );
}

type BadgeProps = {
  variant?: 'navy' | 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  children: ReactNode;
};

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

type ModalProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** แถบปุ่มด้านล่าง — หากไม่ส่งมา จะไม่แสดงแถบนี้ (ใช้เมื่อเนื้อหามีปุ่มของตัวเอง) */
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
};

export function Modal({ title, subtitle, children, footer, onClose, wide }: ModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-subtitle">{subtitle}</div> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="ปิดหน้าต่าง">
            <IconClose size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        {icon ?? <IconInbox size={30} />}
      </div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{description}</div>
    </div>
  );
}

/** แถบแสดงสถานะกำลังดำเนินการ */
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-row">
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="text-muted">{label}</span> : null}
    </span>
  );
}

/** ป้ายตัวเลขสรุป ใช้ในหัวการ์ด */
export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="stat-pill">
      <span className="stat-pill-label">{label}</span>
      <strong className="stat-pill-value">{value}</strong>
    </span>
  );
}
