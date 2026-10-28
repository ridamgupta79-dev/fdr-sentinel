import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, X } from "lucide-react";

// ---------- Modal ----------

export function Modal({
  title, subtitle, onClose, children, footer, wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------- Confirm dialog ----------

export function ConfirmDialog({
  title, message, confirmLabel = "Confirm", danger, busy, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}
      footer={
        <>
          <button type="button" className="secondary-action" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={danger ? "danger-action" : "primary-action"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }>
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}

// ---------- Form fields ----------

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="form-field">
      <span className="field-label">{label}{required && <b aria-hidden="true"> *</b>}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

// ---------- Empty state ----------

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

// ---------- Skeletons ----------

export function Skeleton({ height = 14, width }: { height?: number; width?: string | number }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-skeleton" aria-label="Loading records">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="table-skeleton-row" key={index}>
          <Skeleton height={12} width="22%" /><Skeleton height={12} width="30%" />
          <Skeleton height={12} width="14%" /><Skeleton height={12} width="12%" />
          <Skeleton height={12} width="12%" />
        </div>
      ))}
    </div>
  );
}

// ---------- DataTable ----------

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  hideOn?: "sm" | "md";
  width?: string;
};

type DataTableProps<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  initialSort?: { key: string; direction: "asc" | "desc" };
  dense?: boolean;
};

export function DataTable<T>({
  rows, columns, rowKey, loading, emptyMessage = "No records found.",
  onRowClick, pageSize: controlledPageSize, pageSizeOptions, onPageSizeChange, initialSort, dense,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(initialSort ?? null);
  const [uncontrolledPage, setUncontrolledPage] = useState(1);
  const [uncontrolledSize, setUncontrolledSize] = useState(pageSizeOptions?.[0] ?? 10);

  const pageSize = controlledPageSize ?? uncontrolledSize;
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find(item => item.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const valueA = column.sortValue!(a);
      const valueB = column.sortValue!(b);
      if (typeof valueA === "number" && typeof valueB === "number") return (valueA - valueB) * factor;
      return String(valueA).localeCompare(String(valueB), undefined, { numeric: true }) * factor;
    });
  }, [rows, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const page = Math.min(uncontrolledPage, totalPages);
  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) return;
    setSort(current =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: "asc" });
    setUncontrolledPage(1);
  }

  return (
    <div className="data-table">
      <div className="table-wrap">
        <table className={dense ? "table-dense" : ""}>
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.key}
                  className={[column.align === "right" ? "cell-right" : "", column.hideOn ? `hide-${column.hideOn}` : ""].join(" ").trim()}
                  style={column.width ? { width: column.width } : undefined}>
                  {column.sortValue ? (
                    <button type="button" className={`th-sort ${sort?.key === column.key ? "th-sort-active" : ""}`}
                      onClick={() => toggleSort(column)}
                      aria-label={`Sort by ${column.header}`}>
                      {column.header}
                      {sort?.key === column.key
                        ? (sort.direction === "asc" ? <ArrowUp size={13} strokeWidth={2.6} /> : <ArrowDown size={13} strokeWidth={2.6} />)
                        : <ChevronsUpDown size={13} strokeWidth={2.4} />}
                    </button>
                  ) : column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={columns.length} className="empty-cell"><TableSkeleton rows={4} /></td></tr>}
            {!loading && visibleRows.map(row => (
              <tr key={rowKey(row)}
                className={onRowClick ? "row-clickable" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map(column => (
                  <td key={column.key}
                    className={[column.align === "right" ? "cell-right" : "", column.hideOn ? `hide-${column.hideOn}` : ""].join(" ").trim()}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && !visibleRows.length && (
              <tr><td colSpan={columns.length} className="empty-cell">
                <EmptyState icon={<Inbox size={22} />} title="Nothing here yet" message={emptyMessage} />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="table-count">
          {sortedRows.length === 0 ? "0 records" :
            `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sortedRows.length)} of ${sortedRows.length}`}
        </span>
        <div className="pager">
          {pageSizeOptions && !controlledPageSize && (
            <label className="page-size">
              Rows
              <select value={uncontrolledSize} onChange={event => { setUncontrolledSize(Number(event.target.value)); setUncontrolledPage(1); onPageSizeChange?.(Number(event.target.value)); }}>
                {pageSizeOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="pager-button" disabled={page <= 1} onClick={() => setUncontrolledPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
          <span className="pager-status">Page {page} of {totalPages}</span>
          <button type="button" className="pager-button" disabled={page >= totalPages} onClick={() => setUncontrolledPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}
